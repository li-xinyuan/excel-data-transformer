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
const { sessionContext } = require('./sessionContext');

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
                            sessionContext.setConfigName(data.configName || '默认配置');
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
                    sessionContext.transformConfirmed = false;
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                    resolve({ cancelled: true });
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
            console.log(`\n  🌐 Web界面已启动: http://localhost:${port}`);
            console.log('  请在浏览器中打开上述地址进行操作\n');
        });
        
        server.on('close', () => {
            if (!sessionContext.transformConfirmed) {
                resolve({ cancelled: true });
            } else {
                resolve(sessionContext.transformResult);
            }
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
                
                const validExtensions = config.file.upload.allowedExtensions;
                if (!validateFileType(file.originalFilename, validExtensions)) {
                    const error = createError(
                        ERROR_TYPES.FILE_UPLOAD,
                        ERROR_CODES.INVALID_FILE_TYPE,
                        ERROR_MESSAGES.INVALID_FILE_TYPE
                    );
                    logErrorHandler(error, { url: req.url, method: req.method, filename: file.originalFilename });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
                
                const maxFileSize = 100 * 1024 * 1024;
                if (!validateFileSize(file.size, maxFileSize)) {
                    const error = createError(
                        ERROR_TYPES.FILE_UPLOAD,
                        ERROR_CODES.FILE_TOO_LARGE,
                        ERROR_MESSAGES.FILE_TOO_LARGE
                    );
                    logErrorHandler(error, { url: req.url, method: req.method, filename: file.originalFilename, fileSize: file.size });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
                
                const sanitizedFileType = sanitizeInput(fileType);
                if (!['source', 'target'].includes(sanitizedFileType)) {
                    const error = createError(
                        ERROR_TYPES.FILE_UPLOAD,
                        ERROR_CODES.FILE_PARSE_ERROR,
                        '无效的文件类型参数'
                    );
                    logErrorHandler(error, { url: req.url, method: req.method, fileType: fileType });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
                
                console.log('File type:', sanitizedFileType);
                console.log('File name:', file.originalFilename);
                console.log('File content length:', file.size);
                logger.debug({ fileType: sanitizedFileType, fileName: file.originalFilename, fileSize: file.size }, 'File uploaded');
                
                let tempPath;
                try {
                    tempPath = safeJoin(__dirname, '..', `${config.file.upload.tempPrefix}${sanitizedFileType}_${Date.now()}.xlsx`);
                } catch (pathError) {
                    const error = createError(
                        ERROR_TYPES.FILE_UPLOAD,
                        ERROR_CODES.FILE_PARSE_ERROR,
                        '无效的文件路径',
                        pathError.message
                    );
                    logErrorHandler(error, { url: req.url, method: req.method });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
                
                try {
                    const readStream = fs.createReadStream(file.filepath);
                    const writeStream = fs.createWriteStream(tempPath);
                    
                    await new Promise((resolve, reject) => {
                        readStream.on('error', reject);
                        writeStream.on('error', reject);
                        writeStream.on('finish', resolve);
                        readStream.pipe(writeStream);
                    });
                } catch (fileError) {
                    const error = createError(
                        ERROR_TYPES.FILE_UPLOAD,
                        ERROR_CODES.FILE_READ_ERROR,
                        ERROR_MESSAGES.FILE_READ_ERROR,
                        fileError.message
                    );
                    logErrorHandler(error, { url: req.url, method: req.method, filename: file.originalFilename });
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
                
                try {
                    if (sanitizedFileType === 'source') {
                        const wb = XLSX.readFile(tempPath);
                        const ws = wb.Sheets[wb.SheetNames[0]];
                        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
                        const analysis = analyzeSourceFile(data);
                        sessionContext.setSourceAnalysis(analysis, tempPath);
                        
                        const sampleData = analysis.dataRows.slice(0, 5).map(row => {
                            return analysis.dataHeaders.map((header, idx) => {
                                return row[idx] !== undefined ? row[idx] : '';
                            });
                        });
                        
                        console.log(`源文件分析完成: ${analysis.dataHeaders.length} 列, ${analysis.dataRows.length} 行数据`);
                        logger.info({ headers: analysis.dataHeaders.length, rows: analysis.dataRows.length }, 'Source file analyzed');
                        
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            data: {
                                headers: analysis.dataHeaders,
                                rowCount: analysis.dataRows.length,
                                sampleData: sampleData
                            }
                        }));
                    } else if (sanitizedFileType === 'target') {
                        const wb = XLSX.readFile(tempPath, { cellFormula: true });
                        const sheetName = wb.SheetNames[0];
                        const ws = wb.Sheets[sheetName];
                        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
                        
                        const analysis = analyzeTargetTemplate(data, ws);
                        sessionContext.setTargetAnalysis(analysis, data, wb, sheetName, tempPath);
                        
                        console.log(`目标模板分析完成: ${analysis.dataHeaders.length} 列`);
                        logger.info({ headers: analysis.dataHeaders.length }, 'Target template analyzed');
                        
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            data: {
                                headers: analysis.dataHeaders
                            }
                        }));
                    }
                } catch (excelError) {
                    const error = createError(
                        ERROR_TYPES.EXCEL_PARSE,
                        ERROR_CODES.INVALID_EXCEL_FILE,
                        ERROR_MESSAGES.INVALID_EXCEL_FILE,
                        excelError.message
                    );
                    logErrorHandler(error, { url: req.url, method: req.method, filename: file.originalFilename });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
            } catch (e) {
                const error = createError(
                    ERROR_TYPES.SYSTEM,
                    ERROR_CODES.INTERNAL_ERROR,
                    ERROR_MESSAGES.INTERNAL_ERROR,
                    e.message
                );
                logErrorHandler(error, { url: req.url, method: req.method });
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(formatErrorResponse(error)));
            }
        });
    } catch (e) {
        const error = createError(
            ERROR_TYPES.SYSTEM,
            ERROR_CODES.INTERNAL_ERROR,
            ERROR_MESSAGES.INTERNAL_ERROR,
            e.message
        );
        logErrorHandler(error, { url: req.url, method: req.method });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(formatErrorResponse(error)));
    }
}

function handleAnalyze(req, res) {
    try {
        if (!sessionContext.isReadyForMapping()) {
            const error = createError(
                ERROR_TYPES.FIELD_MAPPING,
                ERROR_CODES.MAPPING_FAILED,
                '请先上传源文件和目标模板'
            );
            logErrorHandler(error, { url: req.url, method: req.method });
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(formatErrorResponse(error)));
            return;
        }
        
        try {
            const mapping = buildFieldMapping(sessionContext.sourceAnalysis, sessionContext.targetAnalysis);
            sessionContext.setMapping(mapping);
            const preview = previewTransformation(sessionContext.sourceAnalysis, sessionContext.targetAnalysis, mapping);
            
            const previewData = {
                sourceFile: path.basename(sessionContext.sourceFilePath),
                targetFile: path.basename(sessionContext.targetFilePath),
                sourceHeaders: sessionContext.sourceAnalysis.dataHeaders,
                targetHeaders: sessionContext.targetAnalysis.dataHeaders,
                mappings: mapping.columnMappings.map(m => ({
                    sourceIndex: m.sourceIndex,
                    targetIndex: m.targetIndex,
                    sourceField: m.sourceField,
                    targetField: m.targetField,
                    score: m.score
                })),
                missingFields: preview.missingRequiredFields.concat(preview.missingOptionalFields),
                missingRequiredFields: preview.missingRequiredFields,
                autoGeneratedColumns: mapping.autoGeneratedColumns,
                calculatedColumns: mapping.calculatedColumns,
                summary: preview.summary
            };
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: previewData }));
        } catch (mappingError) {
            const error = createError(
                ERROR_TYPES.FIELD_MAPPING,
                ERROR_CODES.MAPPING_FAILED,
                ERROR_MESSAGES.MAPPING_FAILED,
                mappingError.message
            );
            logErrorHandler(error, { url: req.url, method: req.method });
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(formatErrorResponse(error)));
        }
    } catch (e) {
        const error = createError(
            ERROR_TYPES.SYSTEM,
            ERROR_CODES.INTERNAL_ERROR,
            ERROR_MESSAGES.INTERNAL_ERROR,
            e.message
        );
        logErrorHandler(error, { url: req.url, method: req.method });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(formatErrorResponse(error)));
    }
}

function handleConfirm(req, res, server, resolve) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            let data;
            try {
                data = JSON.parse(body);
            } catch (parseError) {
                const error = createError(
                    ERROR_TYPES.SYSTEM,
                    ERROR_CODES.INTERNAL_ERROR,
                    '无效的请求数据',
                    parseError.message
                );
                logErrorHandler(error, { url: req.url, method: req.method });
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(formatErrorResponse(error)));
                return;
            }
            
            const manualMappings = Array.isArray(data.manualMappings) ? data.manualMappings : [];
            const removedMappings = Array.isArray(data.removedMappings) ? data.removedMappings : [];
            const valueTransformRules = typeof data.valueTransformRules === 'object' ? data.valueTransformRules : {};
            
            try {
                applyManualMappings(
                    sessionContext.mapping,
                    manualMappings,
                    removedMappings,
                    sessionContext.sourceAnalysis.dataHeaders,
                    sessionContext.targetAnalysis.dataHeaders
                );
                
                const transformedData = transformData(
                    sessionContext.sourceAnalysis,
                    sessionContext.targetAnalysis,
                    sessionContext.mapping,
                    valueTransformRules
                );
                const outputRows = buildOutputRows(
                    sessionContext.targetAnalysis,
                    transformedData,
                    sessionContext.mapping,
                    sessionContext.targetData
                );
                
                const XLSX = require('xlsx');
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet(outputRows);
                XLSX.utils.book_append_sheet(wb, ws, sessionContext.targetSheetName || 'Sheet1');
                
                const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
                const base64Data = buffer.toString('base64');
                
                const fileName = sessionContext.getOutputFileName();
                const fileSizeKB = (buffer.length / 1024).toFixed(2);
                
                sessionContext.setTransformConfirmed({
                    success: true,
                    fileName: fileName,
                    fileData: base64Data,
                    fileSize: fileSizeKB + ' KB',
                    dataRowCount: transformedData.dataRows.length
                });
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(sessionContext.transformResult));
            } catch (transformError) {
                const error = createError(
                    ERROR_TYPES.DATA_TRANSFORM,
                    ERROR_CODES.TRANSFORM_FAILED,
                    ERROR_MESSAGES.TRANSFORM_FAILED,
                    transformError.message
                );
                logErrorHandler(error, { url: req.url, method: req.method });
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(formatErrorResponse(error)));
            }
        } catch (e) {
            const error = createError(
                ERROR_TYPES.SYSTEM,
                ERROR_CODES.INTERNAL_ERROR,
                ERROR_MESSAGES.INTERNAL_ERROR,
                e.message
            );
            logErrorHandler(error, { url: req.url, method: req.method });
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(formatErrorResponse(error)));
        }
    });
}

function cleanup() {
    sessionContext.cleanup();
}

module.exports = {
    startWebServer,
    cleanup,
    sessionContext
};
