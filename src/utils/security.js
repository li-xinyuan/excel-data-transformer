// 安全工具模块

const path = require('path');
const fs = require('fs');

// 验证文件类型
function validateFileType(filename, allowedExtensions) {
    const ext = path.extname(filename).toLowerCase();
    return allowedExtensions.includes(ext);
}

// 验证文件大小
function validateFileSize(size, maxSize) {
    return size <= maxSize;
}

// 防止路径遍历攻击
function sanitizePath(filePath) {
    // 检查空字符
    if (filePath.includes('\0')) {
        throw new Error('路径包含非法字符');
    }

    // 解析路径并获取规范化的路径
    const normalizedPath = path.normalize(filePath);

    // 确保路径不包含 .. 或其他路径遍历字符
    if (normalizedPath.includes('..')) {
        throw new Error('路径包含非法字符');
    }

    // 检查路径是否包含其他危险字符组合
    const dangerousPatterns = [/\.\./, /~/, /\//, /\\/];
    for (const pattern of dangerousPatterns) {
        if (pattern.test(normalizedPath) && normalizedPath !== path.normalize(normalizedPath)) {
            throw new Error('路径包含非法字符');
        }
    }

    return normalizedPath;
}

// 安全地构建文件路径
function safeJoin(...args) {
    const joinedPath = path.join(...args);
    const resolvedPath = path.resolve(joinedPath);
    
    // 确保路径不包含路径遍历字符
    const normalizedPath = path.normalize(resolvedPath);
    if (normalizedPath.includes('..')) {
        throw new Error('路径包含非法字符');
    }
    
    return resolvedPath;
}

// 验证输入数据
function validateInput(data, schema) {
    // 简单的输入验证
    for (const [key, rules] of Object.entries(schema)) {
        const value = data[key];
        
        if (rules.required && (value === undefined || value === null || value === '')) {
            throw new Error(`${key} 是必填项`);
        }
        
        if (value !== undefined && rules.type && typeof value !== rules.type) {
            throw new Error(`${key} 类型错误`);
        }
        
        if (value !== undefined && rules.minLength && value.length < rules.minLength) {
            throw new Error(`${key} 长度不足`);
        }
        
        if (value !== undefined && rules.maxLength && value.length > rules.maxLength) {
            throw new Error(`${key} 长度超出限制`);
        }
    }
    
    return true;
}

// 清理用户输入
function sanitizeInput(input) {
    if (typeof input === 'string') {
        // 移除潜在的危险字符
        return input.replace(/[<>"'&]/g, '');
    }
    return input;
}

// 验证Excel文件
function validateExcelFile(filePath) {
    try {
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            throw new Error('文件不存在');
        }
        
        // 检查文件大小
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
            throw new Error('文件为空');
        }
        
        // 检查文件扩展名
        const ext = path.extname(filePath).toLowerCase();
        if (!['.xlsx', '.xls'].includes(ext)) {
            throw new Error('无效的文件类型');
        }
        
        return true;
    } catch (error) {
        throw error;
    }
}

module.exports = {
    validateFileType,
    validateFileSize,
    sanitizePath,
    safeJoin,
    validateInput,
    sanitizeInput,
    validateExcelFile
};
