// 错误处理模块

// 错误类型定义
const ERROR_TYPES = {
    FILE_UPLOAD: 'FILE_UPLOAD',
    EXCEL_PARSE: 'EXCEL_PARSE',
    FIELD_MAPPING: 'FIELD_MAPPING',
    DATA_TRANSFORM: 'DATA_TRANSFORM',
    OUTPUT_WRITE: 'OUTPUT_WRITE',
    SYSTEM: 'SYSTEM'
};

// 错误码定义
const ERROR_CODES = {
    // 文件上传错误
    FILE_TOO_LARGE: 4001,
    INVALID_FILE_TYPE: 4002,
    FILE_READ_ERROR: 4003,
    FILE_PARSE_ERROR: 4004,
    
    // Excel 解析错误
    INVALID_EXCEL_FILE: 4101,
    EXCEL_FORMAT_ERROR: 4102,
    
    // 字段映射错误
    MAPPING_FAILED: 4201,
    REQUIRED_FIELD_MISSING: 4202,
    
    // 数据转换错误
    TRANSFORM_FAILED: 4301,
    
    // 输出写入错误
    OUTPUT_WRITE_ERROR: 4401,
    DISK_SPACE_ERROR: 4402,
    PERMISSION_ERROR: 4403,
    
    // 系统错误
    INTERNAL_ERROR: 5000
};

// 错误消息模板
const ERROR_MESSAGES = {
    FILE_TOO_LARGE: '文件大小超过限制（最大100MB）',
    INVALID_FILE_TYPE: '无效的文件类型，仅支持 .xlsx 和 .xls 格式',
    FILE_READ_ERROR: '文件读取失败',
    FILE_PARSE_ERROR: '文件解析失败',
    INVALID_EXCEL_FILE: '无效的 Excel 文件，请确保文件格式正确且可被 Excel 打开',
    EXCEL_FORMAT_ERROR: 'Excel 文件格式错误，请尝试重新保存文件',
    MAPPING_FAILED: '字段映射失败',
    REQUIRED_FIELD_MISSING: '必填字段缺失',
    TRANSFORM_FAILED: '数据转换失败',
    OUTPUT_WRITE_ERROR: '输出文件写入失败，请检查磁盘空间和文件权限',
    DISK_SPACE_ERROR: '磁盘空间不足',
    PERMISSION_ERROR: '权限不足，无法写入文件',
    INTERNAL_ERROR: '系统内部错误，请稍后重试或联系管理员'
};

// 自定义错误类
class AppError extends Error {
    constructor(type, code, message, details = null) {
        super(message);
        this.type = type;
        this.code = code;
        this.details = details;
        this.name = 'AppError';
    }
}

// 错误响应格式化
function formatErrorResponse(error) {
    if (error instanceof AppError) {
        return {
            success: false,
            error: {
                type: error.type,
                code: error.code,
                message: error.message,
                details: error.details
            }
        };
    } else {
        // 未知错误
        return {
            success: false,
            error: {
                type: ERROR_TYPES.SYSTEM,
                code: ERROR_CODES.INTERNAL_ERROR,
                message: ERROR_MESSAGES.INTERNAL_ERROR,
                details: error.message
            }
        };
    }
}

// 错误日志记录
function logError(error, context = {}) {
    const timestamp = new Date().toISOString();
    const errorInfo = {
        timestamp,
        context,
        error: {
            type: error.type || 'UNKNOWN',
            code: error.code || 'UNKNOWN',
            message: error.message,
            stack: error.stack
        }
    };
    
    console.error('ERROR:', JSON.stringify(errorInfo, null, 2));
}

// 错误处理中间件
function errorHandler(err, req, res, next) {
    logError(err, { url: req.url, method: req.method });
    const response = formatErrorResponse(err);
    res.writeHead(response.error.code >= 500 ? 500 : 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
}

// 创建错误
function createError(type, code, message, details = null) {
    return new AppError(type, code, message, details);
}

module.exports = {
    ERROR_TYPES,
    ERROR_CODES,
    ERROR_MESSAGES,
    AppError,
    formatErrorResponse,
    logError,
    errorHandler,
    createError
};
