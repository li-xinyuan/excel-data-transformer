const http = require('http');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const XLSX = require('xlsx');
const formidable = require('formidable');

const config = require('./config');
const { logger, createChildLogger } = require('./utils/logger');

const {
    ERROR_TYPES,
    ERROR_CODES,
    ERROR_MESSAGES,
    createError,
    logError: logErrorHandler,
    formatErrorResponse
} = require('./utils/errorHandler');

const {
    validateFileType,
    validateFileSize,
    safeJoin,
    validateInput,
    sanitizeInput
} = require('./utils/security');

const { analyzeSourceFile, analyzeTargetTemplate } = require('./excelParser');
const { buildFieldMapping, previewTransformation, applyManualMappings } = require('./fieldMapper');
const { transformData, buildOutputRows, writeOutputFile } = require('./dataTransformer');
const { sessionManager } = require('./sessionContext');
const { sessionMiddleware, setSessionCookie } = require('./middleware/session');

function startWebServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            try {
                res.setHeader('Access-Control-Allow-Origin', config.server.cors.allowOrigin);
                res.setHeader('Access-Control-Allow-Methods', config.server.cors.allowMethods);
                res.setHeader('Access-Control-Allow-Headers', config.server.cors.allowHeaders);
                
                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }
                
                // 应用 Session 中间件
                sessionMiddleware(req, res);
                
                if (req.url === '/api/upload' && req.method === 'POST') {
                    handleFileUpload(req, res);
                    return;
                }
                
                if (req.url === '/api/analyze' && req.method === 'POST') {
                    handleAnalyze(req, res);
                    return;
                }
                
                if (req.url === '/api/setConfigName' && req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', () => {
                        try {
                            const data = JSON.parse(body);
                            req.session.setConfigName(data.configName || '默认配置');
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true }));
                        } catch (e) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, error: e.message }));
                        }
                    });
                    return;
                }
                
                if (req.url === '/api/confirm' && req.method === 'POST') {
                    handleConfirm(req, res, server, resolve);
                    return;
                }
                
                if (req.url === '/api/cancel' && req.method === 'POST') {
                    req.session.transformConfirmed = false;
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                    return;
                }
                
                if (req.url === '/api/session' && req.method === 'GET') {
                    // 获取当前 Session 信息
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        sessionId: req.sessionId,
                        sessionCount: sessionManager.getSessionCount()
                    }));
                    return;
                }
                
                let filePath = req.url;
                if (filePath === '/') {
                    filePath = '/index.html';
                }
                const fullPath = path.join(__dirname, 'public', filePath);
                
                if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
                    const ext = path.extname(fullPath);
                    const contentTypes = {
                        '.html': 'text/html; charset=utf-8',
                        '.js': 'application/javascript',
                        '.css': 'text/css',
                        '.json': 'application/json'
                    };
                    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
                    res.end(fs.readFileSync(fullPath));
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            } catch (error) {
                logErrorHandler(error, { url: req.url, method: req.method });
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(formatErrorResponse(error)));
            }
        });
        
        const port = config.server.port;
        server.listen(port, () => {
            logger.info({ port }, 'Web server started');
            console.log(`\n  🌐 Web 界面已启动：http://localhost:${port}`);
            console.log('  请在浏览器中打开上述地址进行操作\n');
        });
        
        server.on('close', () => {
            logger.info('服务器关闭');
        });
    });
}

async function handleFileUpload(req, res) {
    try {
        const form = new formidable.IncomingForm({
            keepExtensions: true,
            multiples: false,
            maxFileSize: config.file.upload.maxSize,
        });
        
        form.parse(req, async (err, fields, files) => {
            try {
                if (err) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        const error = createError(
                            ERROR_TYPES.FILE_UPLOAD,
                            ERROR_CODES.FILE_TOO_LARGE,
                            ERROR_MESSAGES.FILE_TOO_LARGE
                        );
                        logErrorHandler(error, { url: req.url, method: req.method });
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(formatErrorResponse(error)));
                        return;
                    }
                    
                    const error = createError(
                        ERROR_TYPES.FILE_UPLOAD,
                        ERROR_CODES.FILE_PARSE_ERROR,
                        ERROR_MESSAGES.FILE_PARSE_ERROR,
                        err.message
                    );
                    logErrorHandler(error, { url: req.url, method: req.method });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
                
                const fileType = fields.type && fields.type[0] ? fields.type[0] : null;
                const file = files.file && files.file[0] ? files.file[0] : null;
                
                if (!file || !fileType) {
                    const error = createError(
                        ERROR_TYPES.FILE_UPLOAD,
                        ERROR_CODES.FILE_PARSE_ERROR,
                        ERROR_MESSAGES.FILE_PARSE_ERROR,
                        '缺少文件或文件类型'
                    );
                    logErrorHandler(error, { url: req.url, method: req.method });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
                
                // 验证文件类型
                if (!validateFileType(file.originalFilename, ['xlsx', 'xls'])) {
                    const error = createError(
                        ERROR_TYPES.FILE_UPLOAD,
                        ERROR_CODES.INVALID_FILE_TYPE,
                        ERROR_MESSAGES.INVALID_FILE_TYPE
                    );
                    logErrorHandler(error, { url: req.url, method: req.method });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
                
                // 验证文件大小
                if (!validateFileSize(file.size, config.file.upload.maxSize)) {
                    const error = createError(
                        ERROR_TYPES.FILE_UPLOAD,
                        ERROR_CODES.FILE_TOO_LARGE,
                        ERROR_MESSAGES.FILE_TOO_LARGE
                    );
                    logErrorHandler(error, { url: req.url, method: req.method });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
                
                // 创建临时文件
                const tempDir = path.join(__dirname, '..', config.file.upload.tempDir);
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                
                const ext = path.extname(file.originalFilename);
                const tempFilename = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
                const tempPath = path.join(tempDir, tempFilename);
                
                // 复制文件到临时目录
                const oldData = fs.readFileSync(file.filepath);
                fs.writeFileSync(tempPath, oldData);
                
                // 删除 formidable 创建的临时文件
                fs.unlinkSync(file.filepath);
                
                logger.info({ 
                    fileType, 
                    originalFilename: file.originalFilename, 
                    tempPath,
                    sessionId: req.sessionId 
                }, '文件上传成功');
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    filename: file.originalFilename,
                    tempPath: tempPath,
                    fileType: fileType
                }));
                
                // 设置 Session Cookie
                setSessionCookie(res, req.sessionId);
            } catch (error) {
                logErrorHandler(error, { url: req.url, method: req.method });
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(formatErrorResponse(error)));
            }
        });
    } catch (error) {
        logErrorHandler(error, { url: req.url, method: req.method });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(formatErrorResponse(error)));
    }
}

async function handleAnalyze(req, res) {
    try {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { filePath, type } = data;
                
                if (!filePath || !type) {
                    const error = createError(
                        ERROR_TYPES.INVALID_INPUT,
                        ERROR_CODES.MISSING_PARAMETER,
                        '缺少必要参数'
                    );
                    logErrorHandler(error, { url: req.url, method: req.method });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
                
                let analysis;
                if (type === 'source') {
                    analysis = await analyzeSourceFile(filePath);
                    req.session.setSourceAnalysis(analysis, filePath);
                    logger.info({ 
                        sourceFile: filePath,
                        sessionId: req.sessionId 
                    }, '源文件分析完成');
                } else if (type === 'target') {
                    analysis = await analyzeTargetTemplate(filePath);
                    const wb = XLSX.readFile(filePath);
                    const sheetName = wb.SheetNames[0];
                    const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
                    req.session.setTargetAnalysis(analysis, data, wb, sheetName, filePath);
                    logger.info({ 
                        targetFile: filePath,
                        sessionId: req.sessionId 
                    }, '目标模板分析完成');
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    analysis: analysis
                }));
            } catch (error) {
                logErrorHandler(error, { url: req.url, method: req.method });
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(formatErrorResponse(error)));
            }
        });
    } catch (error) {
        logErrorHandler(error, { url: req.url, method: req.method });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(formatErrorResponse(error)));
    }
}

async function handleConfirm(req, res, server, resolvePromise) {
    try {
        if (!req.session.isReadyForMapping()) {
            const error = createError(
                ERROR_TYPES.INVALID_STATE,
                ERROR_CODES.INVALID_STATE,
                '请先上传并分析源文件和目标模板'
            );
            logErrorHandler(error, { url: req.url, method: req.method });
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(formatErrorResponse(error)));
            return;
        }
        
        // 构建映射
        const mapping = buildFieldMapping(req.session.sourceAnalysis, req.session.targetAnalysis);
        req.session.setMapping(mapping);
        const preview = previewTransformation(req.session.sourceAnalysis, req.session.targetAnalysis, mapping);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            preview: preview,
            sourceFile: path.basename(req.session.sourceFilePath),
            targetFile: path.basename(req.session.targetFilePath),
            sourceHeaders: req.session.sourceAnalysis.dataHeaders,
            targetHeaders: req.session.targetAnalysis.dataHeaders,
            mappings: mapping.mappings
        }));
        
        logger.info({ sessionId: req.sessionId }, '映射确认完成');
    } catch (error) {
        logErrorHandler(error, { url: req.url, method: req.method });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(formatErrorResponse(error)));
    }
}

module.exports = {
    startWebServer
};
