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
                
                if (req.url === '/api/preview' && req.method === 'POST') {
                    handlePreview(req, res, server, resolve);
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
            uploadDir: path.join(__dirname, '..', config.file.upload.tempDir),
            createDirs: true,
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
                // formidable v3+ files.file 是数组
                const file = Array.isArray(files.file) ? files.file[0] : files.file;
                
                logger.info({ 
                    originalFilename: file?.originalFilename,
                    ext: file?.originalFilename ? path.extname(file.originalFilename) : 'N/A',
                    sessionId: req.sessionId,
                    filesKeys: Object.keys(files),
                    fileType
                }, '文件上传信息');
                
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
                
                // formidable v3+ 已经自动保存文件到 uploadDir
                const tempPath = file.filepath;
                
                logger.info({ 
                    fileType, 
                    originalFilename: file.originalFilename, 
                    tempPath,
                    sessionId: req.sessionId 
                }, '文件上传成功');
                
                // 设置 Session Cookie
                setSessionCookie(res, req.sessionId);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    data: {
                        filename: file.originalFilename,
                        tempPath: tempPath,
                        fileType: fileType
                    }
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
                    // 先读取并解析 Excel 文件
                    const wb = XLSX.readFile(filePath);
                    const sheetName = wb.SheetNames[0];
                    const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
                    analysis = await analyzeSourceFile(data);
                    req.session.setSourceAnalysis(analysis, filePath);
                    logger.info({ 
                        sourceFile: filePath,
                        sessionId: req.sessionId 
                    }, '源文件分析完成');
                } else if (type === 'target') {
                    // 先读取并解析 Excel 文件
                    const wb = XLSX.readFile(filePath);
                    const sheetName = wb.SheetNames[0];
                    const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
                    analysis = await analyzeTargetTemplate(data);
                    req.session.setTargetAnalysis(analysis, data, wb, sheetName, filePath);
                    logger.info({ 
                        targetFile: filePath,
                        sessionId: req.sessionId 
                    }, '目标模板分析完成');
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                // 序列化分析结果，排除不能序列化的字段
                const serializableAnalysis = {
                    totalRows: analysis.totalRows,
                    titleRow: analysis.titleRow,
                    titleText: analysis.titleText,
                    columnHeaderRows: analysis.columnHeaderRows,
                    dataHeaders: analysis.dataHeaders,
                    dataStartRow: analysis.dataStartRow,
                    dataEndRow: analysis.dataEndRow,
                    dataRowCount: analysis.dataRowCount || 0,
                    sampleData: analysis.sampleData,
                    totalRow: analysis.totalRow,
                    endRow: analysis.endRow
                };
                res.end(JSON.stringify({
                    success: true,
                    analysis: serializableAnalysis
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
        
        // 解析请求体
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const requestData = JSON.parse(body);
                
                // 如果有 manualMappings，说明是执行转换
                if (requestData.manualMappings) {
                    // 设置配置名称
                    if (requestData.configName) {
                        req.session.setConfigName(requestData.configName);
                    }
                    
                    // 执行数据转换
                    const mapping = buildFieldMapping(req.session.sourceAnalysis, req.session.targetAnalysis);
                    
                    // 合并手动映射
                    if (requestData.manualMappings && requestData.manualMappings.length > 0) {
                        requestData.manualMappings.forEach(mm => {
                            const existingIndex = mapping.columnMappings.findIndex(cm => cm.targetIndex === mm.target);
                            if (existingIndex >= 0) {
                                mapping.columnMappings[existingIndex] = {
                                    ...mapping.columnMappings[existingIndex],
                                    sourceIndex: mm.source,
                                    sourceField: req.session.sourceAnalysis.dataHeaders[mm.source]
                                };
                            } else {
                                mapping.columnMappings.push({
                                    targetField: req.session.targetAnalysis.dataHeaders[mm.target],
                                    targetIndex: mm.target,
                                    sourceField: req.session.sourceAnalysis.dataHeaders[mm.source],
                                    sourceIndex: mm.source,
                                    score: 100,
                                    matchType: 'manual'
                                });
                            }
                        });
                    }
                    
                    // 删除移除的映射
                    if (requestData.removedMappings && requestData.removedMappings.length > 0) {
                        mapping.columnMappings = mapping.columnMappings.filter(cm => 
                            !requestData.removedMappings.some(rm => rm.targetIndex === cm.targetIndex)
                        );
                    }
                    
                    // 应用值转换规则
                    if (requestData.valueTransformRules && Object.keys(requestData.valueTransformRules).length > 0) {
                        // TODO: 实现值转换规则的应用
                    }
                    
                    // 构建输出数据
                    const outputRows = buildOutputRows(
                        req.session.targetAnalysis,
                        req.session.sourceAnalysis,
                        mapping,
                        req.session.targetData
                    );
                    
                    // 写入输出文件
                    const wb = writeOutputFile(
                        outputRows,
                        req.session.targetAnalysis.sheetName,
                        req.session.targetFilePath,
                        req.session.targetAnalysis
                    );
                    
                    // 生成输出文件名
                    const fileName = req.session.getOutputFileName();
                    
                    // 将 Excel 文件转换为 Buffer
                    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
                    
                    // 转换为 base64
                    const fileData = buffer.toString('base64');
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        fileData: fileData,
                        fileName: fileName,
                        fileSize: (buffer.length / 1024).toFixed(1) + ' KB',
                        dataRowCount: outputRows.length
                    }));
                    
                    logger.info({ sessionId: req.sessionId, rowCount: outputRows.length }, '数据转换完成');
                    return;
                }
                
                // 否则返回映射预览
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
                    mappings: mapping.columnMappings
                }));
                
                logger.info({ sessionId: req.sessionId }, '映射确认完成');
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

async function handlePreview(req, res, server, resolvePromise) {
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
        
        // 解析请求体
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const requestData = JSON.parse(body);
                const previewRows = requestData.previewRows || 10;
                
                // 读取源数据前 N 行
                const xlsxLib = require('xlsx');
                const sourceWorkbook = xlsxLib.readFile(req.session.sourceFilePath);
                const sourceSheet = sourceWorkbook.Sheets[sourceWorkbook.SheetNames[0]];
                const sourceData = xlsxLib.utils.sheet_to_json(sourceSheet, { header: 1 });
                
                // 获取表头和数据行
                const sourceHeaders = sourceData[0];
                const sourceRows = sourceData.slice(1, previewRows + 1);
                
                // 构建映射关系
                const mapping = buildFieldMapping(req.session.sourceAnalysis, req.session.targetAnalysis);
                
                // 合并手动映射
                if (requestData.manualMappings && requestData.manualMappings.length > 0) {
                    requestData.manualMappings.forEach(mm => {
                        const existingIndex = mapping.columnMappings.findIndex(cm => cm.targetIndex === mm.target);
                        if (existingIndex >= 0) {
                            mapping.columnMappings[existingIndex] = {
                                ...mapping.columnMappings[existingIndex],
                                sourceIndex: mm.source,
                                sourceField: req.session.sourceAnalysis.dataHeaders[mm.source]
                            };
                        } else {
                            mapping.columnMappings.push({
                                targetField: req.session.targetAnalysis.dataHeaders[mm.target],
                                targetIndex: mm.target,
                                sourceField: req.session.sourceAnalysis.dataHeaders[mm.source],
                                sourceIndex: mm.source,
                                score: 100,
                                matchType: 'manual'
                            });
                        }
                    });
                }
                
                // 删除移除的映射
                if (requestData.removedMappings && requestData.removedMappings.length > 0) {
                    mapping.columnMappings = mapping.columnMappings.filter(cm => 
                        !requestData.removedMappings.some(rm => rm.targetIndex === cm.targetIndex)
                    );
                }
                
                // 应用值转换规则
                const valueTransformRules = requestData.valueTransformRules || {};
                
                // 调试日志：查看接收到的转换规则
                console.log('[Preview] 接收到的值转换规则:', JSON.stringify(valueTransformRules, null, 2));
                console.log('[Preview] 映射关系数量:', mapping.columnMappings.length);
                
                // 转换数据
                const transformedRows = [];
                sourceRows.forEach((sourceRow, rowIndex) => {
                    const targetRow = {};
                    
                    req.session.targetAnalysis.dataHeaders.forEach((targetHeader, targetIndex) => {
                        // 查找映射关系
                        const mappingInfo = mapping.columnMappings.find(m => m.targetIndex === targetIndex);
                        
                        if (mappingInfo && mappingInfo.sourceIndex !== undefined) {
                            let value = sourceRow[mappingInfo.sourceIndex];
                            
                            // 应用值转换规则
                            const ruleKey = `${mappingInfo.sourceIndex}_${targetIndex}`;
                            console.log(`[Preview] 检查字段 ${targetHeader}: ruleKey=${ruleKey}, sourceValue=${value}, 有规则=${!!valueTransformRules[ruleKey]}`);
                            if (valueTransformRules[ruleKey]) {
                                const rule = valueTransformRules[ruleKey];
                                console.log(`[Preview] 应用规则:`, JSON.stringify(rule, null, 2));
                                
                                // 根据操作类型应用转换
                                if (rule.operation) {
                                    value = applyValueTransform(value, rule);
                                    console.log(`[Preview] 转换后值：${value}`);
                                }
                            }
                            
                            targetRow[targetHeader] = value !== undefined && value !== null ? value : '';
                        } else {
                            // 没有映射的字段留空
                            targetRow[targetHeader] = '';
                        }
                    });
                    
                    transformedRows.push(targetRow);
                });
                
                // 返回预览数据
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    previewData: {
                        source: {
                            headers: sourceHeaders,
                            rows: sourceRows.map(row => {
                                const obj = {};
                                sourceHeaders.forEach((h, i) => obj[h] = row[i] !== undefined ? row[i] : '');
                                return obj;
                            })
                        },
                        target: {
                            headers: req.session.targetAnalysis.dataHeaders,
                            rows: transformedRows
                        }
                    },
                    // 返回当前实际生效的映射关系（包括自动映射和手动映射，排除已移除的）
                activeMappings: mapping.columnMappings.map(m => ({
                    sourceIndex: m.sourceIndex,
                    targetIndex: m.targetIndex,
                    score: m.score,
                    matchType: m.matchType || 'auto'
                })),
                    statistics: {
                        totalRows: req.session.sourceAnalysis.dataRows.length,
                        previewRows: transformedRows.length,
                        mappedFields: mapping.columnMappings.length
                    }
                }));
                
                logger.info({ sessionId: req.sessionId, previewRows: transformedRows.length }, '数据预览完成');
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

// 应用值转换规则
function applyValueTransform(value, rule) {
    if (value === undefined || value === null || value === '') {
        return value;
    }
    
    switch (rule.operation) {
        case 'substring': {
            // 截取字符串 (参数："0,5" 表示从位置 0 开始截取 5 个字符)
            const params = (rule.params || '0,5').split(',');
            const start = parseInt(params[0]) || 0;
            const length = parseInt(params[1]) || value.length;
            return String(value).substring(start, start + length);
        }
        
        case 'replace': {
            // 替换字符串 (参数："a,b" 表示将 a 替换为 b)
            const params = (rule.params || '').split(',');
            if (params.length >= 2) {
                const search = params[0];
                const replace = params[1];
                return String(value).split(search).join(replace);
            }
            return value;
        }
        
        case 'trim':
            // 去除空格
            return String(value).trim();
        
        case 'uppercase':
            // 转为大写
            return String(value).toUpperCase();
        
        case 'lowercase':
            // 转为小写
            return String(value).toLowerCase();
        
        case 'round':
            // 四舍五入
            return Math.round(parseFloat(value) || 0);
        
        case 'floor':
            // 向下取整
            return Math.floor(parseFloat(value) || 0);
        
        case 'ceil':
            // 向上取整
            return Math.ceil(parseFloat(value) || 0);
        
        case 'fixed': {
            // 保留小数 (参数：小数位数)
            const decimals = parseInt(rule.params) || 2;
            return (parseFloat(value) || 0).toFixed(decimals);
        }
        
        default:
            return value;
    }
}

module.exports = {
    startWebServer
};
