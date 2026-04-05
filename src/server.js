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
const { transformData, buildOutputRows, writeOutputFile, applyValueTransformForOutput } = require('./dataTransformer');
const { sessionManager } = require('./sessionContext');
const { sessionMiddleware, setSessionCookie } = require('./middleware/session');
const filterModule = require('./public/js/filter/index');

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
                
                // 筛选功能 API
                if (req.url === '/api/filter/fields' && req.method === 'GET') {
                    handleFilterFields(req, res);
                    return;
                }
                
                if (req.url === '/api/filter/preview' && req.method === 'POST') {
                    handleFilterPreview(req, res);
                    return;
                }
                
                if (req.url === '/api/filter/apply' && req.method === 'POST') {
                    handleFilterApply(req, res);
                    return;
                }
                
                if (req.url === '/api/filter/validate-expression' && req.method === 'POST') {
                    handleFilterValidateExpression(req, res);
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
                                    sourceField: req.session.sourceAnalysis.dataHeaders[mm.source],
                                    matchType: 'manual' // 更新为手动映射
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
                    if (Object.keys(valueTransformRules).length > 0) {
                        mapping.columnMappings.forEach(colMapping => {
                            const ruleKey = `${colMapping.sourceIndex}_${colMapping.targetIndex}`;
                            if (valueTransformRules[ruleKey] && Array.isArray(valueTransformRules[ruleKey])) {
                                colMapping.valueTransformRules = valueTransformRules[ruleKey];
                            }
                        });
                    }
                    
                    // 获取筛选配置
                    const filterConfig = requestData.filterConfig || null;
                    
                    // 执行数据转换（包括筛选）
                    const transformedData = transformData(
                        req.session.sourceAnalysis,
                        req.session.targetAnalysis,
                        mapping,
                        valueTransformRules,
                        filterConfig
                    );
                    
                    // 构建输出数据
                    const outputResult = buildOutputRows(
                        req.session.targetAnalysis,
                        transformedData,
                        mapping,
                        req.session.targetData
                    );
                    
                    const outputRows = outputResult.rows;
                    const transformErrors = outputResult.transformErrors;
                    
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
                        dataRowCount: outputRows.length,
                        transformErrors: transformErrors.length > 0 ? transformErrors : undefined
                    }));
                    
                    logger.info({ sessionId: req.sessionId, rowCount: outputRows.length, errors: transformErrors.length }, '数据转换完成');
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

// 筛选功能 API 处理函数
async function handleFilterFields(req, res) {
    try {
        if (!req.session.sourceAnalysis) {
            const error = createError(
                ERROR_TYPES.INVALID_STATE,
                ERROR_CODES.INVALID_STATE,
                '请先上传并分析源文件'
            );
            logErrorHandler(error, { url: req.url, method: req.method });
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(formatErrorResponse(error)));
            return;
        }
        
        const sourceHeaders = req.session.sourceAnalysis.dataHeaders || [];
        
        // 为每个字段推断类型
        const XLSX = require('xlsx');
        const sourceWorkbook = XLSX.readFile(req.session.sourceFilePath);
        const sourceSheet = sourceWorkbook.Sheets[sourceWorkbook.SheetNames[0]];
        const sourceData = XLSX.utils.sheet_to_json(sourceSheet, { header: 1 });
        const dataRows = sourceData.slice(1); // 跳过表头
        
        const fields = sourceHeaders.map((header, index) => {
            // 收集该字段的所有值
            const values = dataRows.map(row => row[index]).filter(v => v !== null && v !== undefined && v !== '');
            
            // 使用类型推断器
            const typeInferencer = filterModule.createFieldTypeInferencer();
            const dataType = typeInferencer.infer(values);
            
            return {
                index,
                name: header,
                dataType,
                sampleValues: values.slice(0, 5), // 前 5 个样本值
                totalRows: values.length
            };
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            fields
        }));
        
        logger.info({ sessionId: req.sessionId, fieldCount: fields.length }, '获取筛选字段列表完成');
    } catch (error) {
        logErrorHandler(error, { url: req.url, method: req.method });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(formatErrorResponse(error)));
    }
}

async function handleFilterPreview(req, res) {
    try {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const requestData = JSON.parse(body);
                const filterConfig = requestData.filterConfig;
                const previewSize = requestData.previewSize || 100;
                
                if (!filterConfig) {
                    const error = createError(
                        ERROR_TYPES.INVALID_INPUT,
                        ERROR_CODES.MISSING_PARAMETER,
                        '缺少筛选配置'
                    );
                    logErrorHandler(error, { url: req.url, method: req.method });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
                
                // 验证配置
                const validation = filterModule.validateConfig(filterConfig);
                if (!validation.valid) {
                    const error = createError(
                        ERROR_TYPES.INVALID_INPUT,
                        ERROR_CODES.INVALID_CONFIG,
                        '筛选配置无效',
                        validation.errors.join(', ')
                    );
                    logErrorHandler(error, { url: req.url, method: req.method });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
                
                // 读取源数据
                const XLSX = require('xlsx');
                const sourceWorkbook = XLSX.readFile(req.session.sourceFilePath);
                const sourceSheet = sourceWorkbook.Sheets[sourceWorkbook.SheetNames[0]];
                const sourceData = XLSX.utils.sheet_to_json(sourceSheet, { header: 1 });
                
                const headers = sourceData[0];
                const rows = sourceData.slice(1);
                
                // 创建筛选器并执行预览
                const filter = filterModule.createFilter(filterConfig);
                const preview = filter.preview({ headers, rows }, previewSize);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    preview: {
                        totalRows: preview.totalRows,
                        matchedRows: preview.matchedRows,
                        filteredRows: preview.totalRows - preview.matchedRows,
                        matchRate: preview.matchRate,
                        previewData: preview.previewData,
                        previewHeaders: preview.previewHeaders || headers, // 添加字段名
                        executionTime: preview.executionTime
                    }
                }));
                
                logger.info({ 
                    sessionId: req.sessionId, 
                    totalRows: preview.totalRows,
                    matchedRows: preview.matchedRows,
                    executionTime: preview.executionTime
                }, '筛选预览完成');
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

async function handleFilterApply(req, res) {
    try {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const requestData = JSON.parse(body);
                const filterConfig = requestData.filterConfig;
                
                if (!filterConfig) {
                    const error = createError(
                        ERROR_TYPES.INVALID_INPUT,
                        ERROR_CODES.MISSING_PARAMETER,
                        '缺少筛选配置'
                    );
                    logErrorHandler(error, { url: req.url, method: req.method });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
                
                // 验证配置
                const validation = filterModule.validateConfig(filterConfig);
                if (!validation.valid) {
                    const error = createError(
                        ERROR_TYPES.INVALID_INPUT,
                        ERROR_CODES.INVALID_CONFIG,
                        '筛选配置无效',
                        validation.errors.join(', ')
                    );
                    logErrorHandler(error, { url: req.url, method: req.method });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
                
                // 读取源数据
                const XLSX = require('xlsx');
                const sourceWorkbook = XLSX.readFile(req.session.sourceFilePath);
                const sourceSheet = sourceWorkbook.Sheets[sourceWorkbook.SheetNames[0]];
                const sourceData = XLSX.utils.sheet_to_json(sourceSheet, { header: 1 });
                
                const headers = sourceData[0];
                const rows = sourceData.slice(1);
                
                // 创建筛选器并执行过滤
                const filter = filterModule.createFilter(filterConfig);
                const result = filter.filter({ headers, rows });
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    result: {
                        totalRows: result.statistics.totalRows,
                        matchedRows: result.statistics.matchedRows,
                        filteredRows: result.statistics.filteredRows,
                        matchRate: result.statistics.matchRate,
                        executionTime: result.statistics.executionTime
                    }
                }));
                
                logger.info({ 
                    sessionId: req.sessionId, 
                    totalRows: result.statistics.totalRows,
                    matchedRows: result.statistics.matchedRows,
                    executionTime: result.statistics.executionTime
                }, '筛选应用完成');
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

async function handleFilterValidateExpression(req, res) {
    try {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const requestData = JSON.parse(body);
                const expression = requestData.expression;
                const rules = requestData.rules || [];
                
                if (!expression) {
                    const error = createError(
                        ERROR_TYPES.INVALID_INPUT,
                        ERROR_CODES.MISSING_PARAMETER,
                        '缺少表达式'
                    );
                    logErrorHandler(error, { url: req.url, method: req.method });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(formatErrorResponse(error)));
                    return;
                }
                
                // 验证表达式语法
                try {
                    const { Parser } = require('expr-eval');
                    const parser = new Parser();
                    parser.parse(expression);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        valid: true,
                        message: '表达式语法正确'
                    }));
                } catch (parseError) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        valid: false,
                        message: `表达式语法错误：${parseError.message}`
                    }));
                }
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
                const filterConfig = requestData.filterConfig; // 获取筛选配置
                
                // 读取源数据
                const xlsxLib = require('xlsx');
                const sourceWorkbook = xlsxLib.readFile(req.session.sourceFilePath);
                const sourceSheet = sourceWorkbook.Sheets[sourceWorkbook.SheetNames[0]];
                const sourceData = xlsxLib.utils.sheet_to_json(sourceSheet, { header: 1 });
                
                // 获取表头和数据行
                const sourceHeaders = sourceData[0];
                let sourceRows = sourceData.slice(1); // 先取所有行
                
                // 如果有筛选配置，应用筛选
                let filteredRows = sourceRows;
                let matchedRows = sourceRows.length;
                if (filterConfig && filterConfig.enabled && filterConfig.rules && filterConfig.rules.length > 0) {
                    // 使用筛选模块
                    const filterModule = require('./public/js/filter');
                    const filter = filterModule.createFilter(filterConfig);
                    
                    // 构建数据对象
                    const data = {
                        headers: sourceHeaders,
                        rows: sourceRows
                    };
                    
                    // 执行筛选
                    const filterResult = filter.filter(data, filterConfig);
                    filteredRows = filterResult.rows;
                    matchedRows = filterResult.statistics.matchedRows;
                }
                
                // 取前 N 行用于预览
                const previewDataRows = filteredRows.slice(0, previewRows);
                
                // 构建映射关系
                const mapping = buildFieldMapping(req.session.sourceAnalysis, req.session.targetAnalysis);
                
                console.log('[Preview] 初始映射数量:', mapping.columnMappings.length);
                console.log('[Preview] 初始映射示例:', mapping.columnMappings.slice(0, 3));
                
                // 合并手动映射
                if (requestData.manualMappings && requestData.manualMappings.length > 0) {
                    requestData.manualMappings.forEach(mm => {
                        const existingIndex = mapping.columnMappings.findIndex(cm => cm.targetIndex === mm.target);
                        if (existingIndex >= 0) {
                            mapping.columnMappings[existingIndex] = {
                                ...mapping.columnMappings[existingIndex],
                                sourceIndex: mm.source,
                                sourceField: req.session.sourceAnalysis.dataHeaders[mm.source],
                                matchType: 'manual' // 更新为手动映射
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
                
                // 转换数据 - 处理所有行，标记被过滤的行
                const allTransformedRows = [];
                const filteredIndices = new Set(); // 记录被过滤的行索引
                
                // 如果有筛选，先找出被过滤的行索引
                if (filteredRows !== sourceRows) {
                    // 创建一个映射来快速查找
                    const filteredSet = new Set(filteredRows.map((row, idx) => {
                        // 使用 JSON 字符串作为唯一标识
                        return JSON.stringify(row);
                    }));
                    
                    sourceRows.forEach((row, idx) => {
                        const rowStr = JSON.stringify(row);
                        if (!filteredSet.has(rowStr)) {
                            filteredIndices.add(idx);
                        }
                    });
                }
                
                sourceRows.forEach((sourceRow, rowIndex) => {
                    const isFiltered = filteredIndices.has(rowIndex);
                    const targetRow = {};
                    
                    req.session.targetAnalysis.dataHeaders.forEach((targetHeader, targetIndex) => {
                        // 查找映射关系
                        const mappingInfo = mapping.columnMappings.find(m => m.targetIndex === targetIndex);
                        
                        if (mappingInfo && mappingInfo.sourceIndex !== undefined) {
                            let value = sourceRow[mappingInfo.sourceIndex];
                            
                            // 如果被过滤，不应用转换规则，目标值为空
                            if (!isFiltered) {
                                // 应用值转换规则
                                const ruleKey = `${mappingInfo.sourceIndex}_${targetIndex}`;
                                if (valueTransformRules[ruleKey] && Array.isArray(valueTransformRules[ruleKey])) {
                                    const rules = valueTransformRules[ruleKey];
                                    rules.forEach(rule => {
                                        value = applyValueTransformForOutput(value, rule);
                                    });
                                }
                            } else {
                                value = ''; // 被过滤的行，目标值为空
                            }
                            
                            targetRow[targetHeader] = value !== undefined && value !== null ? value : '';
                        } else {
                            // 没有映射的字段留空
                            targetRow[targetHeader] = '';
                        }
                    });
                    
                    // 添加过滤标记和原始索引
                    targetRow._isFiltered = isFiltered;
                    targetRow._originalIndex = rowIndex;
                    allTransformedRows.push(targetRow);
                });
                
                // 返回预览数据
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    previewData: {
                        source: {
                            headers: sourceHeaders,
                            rows: sourceRows.map((row, idx) => {
                                const obj = {};
                                sourceHeaders.forEach((h, i) => obj[h] = row[i] !== undefined ? row[i] : '');
                                // 添加过滤标记
                                obj._isFiltered = filteredIndices.has(idx);
                                obj._originalIndex = idx;
                                return obj;
                            })
                        },
                        target: {
                            headers: req.session.targetAnalysis.dataHeaders,
                            rows: allTransformedRows
                        },
                        // 筛选信息
                        filterInfo: {
                            isFiltered: !!(filterConfig && filterConfig.enabled && filterConfig.rules && filterConfig.rules.length > 0),
                            totalRows: sourceRows.length,
                            filteredRows: matchedRows,
                            hasFilteredData: matchedRows < sourceRows.length
                        }
                    },
                    // 返回当前实际生效的映射关系（包括自动映射和手动映射，排除已移除的）
                    activeMappings: mapping.columnMappings.map(m => ({
                        sourceIndex: m.sourceIndex,
                        targetIndex: m.targetIndex,
                        score: m.score,
                        matchType: m.matchType || 'auto'
                    })),
                    // 返回值转换规则信息
                    valueTransformRules: requestData.valueTransformRules || {},
                    statistics: {
                        totalRows: req.session.sourceAnalysis.dataRows.length, // 原始总行数
                        filteredRows: matchedRows, // 筛选后行数
                        previewRows: allTransformedRows.length, // 预览行数（所有行）
                        mappedFields: mapping.columnMappings.length,
                        isFiltered: !!(filterConfig && filterConfig.enabled && filterConfig.rules && filterConfig.rules.length > 0),
                        hasFilteredData: matchedRows < req.session.sourceAnalysis.dataRows.length // 是否有数据被过滤
                    }
                }));
                
                logger.info({ sessionId: req.sessionId, previewRows: allTransformedRows.length }, '数据预览完成');
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

module.exports = {
    startWebServer
};
