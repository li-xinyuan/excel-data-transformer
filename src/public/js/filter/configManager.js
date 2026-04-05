/**
 * 筛选配置管理器
 * 统一管理筛选配置的序列化、验证、导出、导入和重置
 * @module filter/configManager
 */

class FilterConfigManager {
    /**
     * 创建配置管理器实例
     * @param {Object} options - 配置选项
     * @param {Object} options.validationRules - 验证规则
     * @param {Array} options.availableFields - 可用字段列表
     */
    constructor(options = {}) {
        this.currentConfig = null;
        this.configVersion = '1.0';
        this.validationRules = options.validationRules || {};
        this.availableFields = options.availableFields || [];
    }
    
    /**
     * 设置可用字段列表
     * @param {Array} fields - 字段列表
     */
    setAvailableFields(fields) {
        this.availableFields = fields;
    }
    
    /**
     * 配置序列化
     * @param {Object} config - 配置对象
     * @returns {string} JSON 字符串
     */
    serialize(config) {
        return JSON.stringify(config, null, 2);
    }
    
    /**
     * 配置反序列化
     * @param {string} jsonString - JSON 字符串
     * @returns {Object} 配置对象
     */
    deserialize(jsonString) {
        return JSON.parse(jsonString);
    }
    
    /**
     * 配置有效性检查
     * @param {Object} config - 配置对象
     * @returns {boolean} 是否有效
     */
    isValid(config) {
        const validation = this.validate(config);
        return validation.valid;
    }
    
    /**
     * 配置验证
     * @param {Object} config - 配置对象
     * @returns {Object} 验证结果 {valid, errors}
     */
    validate(config) {
        const errors = [];
        
        // 基础验证
        if (!config) {
            errors.push('配置不能为空');
            return { valid: false, errors };
        }
        
        // 版本处理
        if (!config.version) {
            config.version = this.configVersion;
        }
        
        // 规则验证
        if (config.rules && Array.isArray(config.rules)) {
            config.rules.forEach((rule, index) => {
                const ruleValidation = this.validateRule(rule, index);
                if (!ruleValidation.valid) {
                    errors.push(...ruleValidation.errors);
                }
            });
        }
        
        // 表达式验证（高级模式）
        if (config.advancedMode && config.expression) {
            const exprValidation = this.validateExpression(config.expression);
            if (!exprValidation.valid) {
                errors.push(exprValidation.error);
            }
        }
        
        // 字段索引验证
        if (this.availableFields && this.availableFields.length > 0) {
            const fieldValidation = this.validateFieldIndices(config);
            if (!fieldValidation.valid) {
                errors.push(...fieldValidation.errors);
            }
            
            // 操作符兼容性验证
            const opValidation = this.validateOperatorCompatibility(config);
            if (!opValidation.valid) {
                errors.push(...opValidation.errors);
            }
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings: []
        };
    }
    
    /**
     * 验证单条规则
     * @param {Object} rule - 规则对象
     * @param {number} index - 规则索引
     * @returns {Object} 验证结果
     */
    validateRule(rule, index) {
        const errors = [];
        
        // 字段索引验证
        if (rule.fieldIndex === undefined || rule.fieldIndex === null) {
            errors.push(`规则 #${index + 1}: 字段索引不能为空`);
        }
        
        // 操作符验证
        if (!rule.operator) {
            errors.push(`规则 #${index + 1}: 操作符不能为空`);
        } else {
            const validOperators = [
                'EQUAL', 'NOT_EQUAL',
                'GREATER_THAN', 'LESS_THAN',
                'GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL',
                'CONTAINS', 'NOT_CONTAINS',
                'STARTS_WITH', 'ENDS_WITH',
                'IN', 'NOT_IN',
                'BETWEEN',
                'IS_EMPTY', 'IS_NOT_EMPTY'
            ];
            if (!validOperators.includes(rule.operator)) {
                errors.push(`规则 #${index + 1}: 操作符 "${rule.operator}" 无效`);
            }
        }
        
        // 值验证（某些操作符需要值）
        if (!['IS_EMPTY', 'IS_NOT_EMPTY'].includes(rule.operator)) {
            if (rule.value === undefined || rule.value === null || rule.value === '') {
                errors.push(`规则 #${index + 1}: 值不能为空`);
            }
        }
        
        // enabled 字段验证
        if (rule.enabled === undefined) {
            rule.enabled = true;
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    /**
     * 验证字段索引
     * @param {Object} config - 配置对象
     * @returns {Object} 验证结果
     */
    validateFieldIndices(config) {
        const errors = [];
        
        if (config.rules && Array.isArray(config.rules)) {
            config.rules.forEach((rule, index) => {
                if (rule.fieldIndex < 0 || rule.fieldIndex >= this.availableFields.length) {
                    errors.push(`规则 #${index + 1}: 字段索引 ${rule.fieldIndex} 超出范围 (0-${this.availableFields.length - 1})`);
                }
            });
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    /**
     * 验证操作符兼容性
     * @param {Object} config - 配置对象
     * @returns {Object} 验证结果
     */
    validateOperatorCompatibility(config) {
        const errors = [];
        
        // 操作符与数据类型映射
        const operatorTypeMap = {
            // 数值操作符
            'GREATER_THAN': ['number', 'date'],
            'LESS_THAN': ['number', 'date'],
            'GREATER_THAN_OR_EQUAL': ['number', 'date'],
            'LESS_THAN_OR_EQUAL': ['number', 'date'],
            
            // 文本操作符
            'CONTAINS': ['string'],
            'NOT_CONTAINS': ['string'],
            'STARTS_WITH': ['string'],
            'ENDS_WITH': ['string'],
            
            // 通用操作符
            'EQUAL': ['string', 'number', 'date', 'boolean'],
            'NOT_EQUAL': ['string', 'number', 'date', 'boolean'],
            'IN': ['string', 'number'],
            'NOT_IN': ['string', 'number'],
            'BETWEEN': ['number', 'date'],
            'IS_EMPTY': ['string'],
            'IS_NOT_EMPTY': ['string']
        };
        
        if (config.rules && Array.isArray(config.rules)) {
            config.rules.forEach((rule, index) => {
                const fieldType = this.getFieldType(rule.fieldIndex);
                const validTypes = operatorTypeMap[rule.operator] || [];
                
                if (!validTypes.includes(fieldType)) {
                    errors.push(`规则 #${index + 1}: 操作符 "${rule.operator}" 不适用于 ${fieldType} 类型字段`);
                }
            });
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    /**
     * 获取字段类型
     * @param {number} fieldIndex - 字段索引
     * @returns {string} 字段类型
     */
    getFieldType(fieldIndex) {
        if (fieldIndex < 0 || fieldIndex >= this.availableFields.length) {
            return 'string';
        }
        
        const field = this.availableFields[fieldIndex];
        
        // 根据字段名推断类型
        const fieldName = (field.name || field).toLowerCase();
        
        if (fieldName.includes('date') || fieldName.includes('time')) {
            return 'date';
        }
        
        if (fieldName.includes('amount') || fieldName.includes('price') || 
            fieldName.includes('count') || fieldName.includes('num')) {
            return 'number';
        }
        
        if (fieldName.includes('flag') || fieldName.includes('is_') || 
            fieldName.includes('bool')) {
            return 'boolean';
        }
        
        return 'string';
    }
    
    /**
     * 验证表达式
     * @param {string} expression - 表达式字符串
     * @returns {Object} 验证结果
     */
    validateExpression(expression) {
        try {
            // 简单的语法检查
            if (!expression || typeof expression !== 'string') {
                return {
                    valid: false,
                    error: '表达式不能为空'
                };
            }
            
            // 检查括号匹配
            const openParens = (expression.match(/\(/g) || []).length;
            const closeParens = (expression.match(/\)/g) || []).length;
            if (openParens !== closeParens) {
                return {
                    valid: false,
                    error: '表达式括号不匹配'
                };
            }
            
            // TODO: 使用 expr-eval 进行更严格的验证
            // const Parser = require('expr-eval').Parser;
            // const parser = new Parser();
            // parser.parse(expression);
            
            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                error: `表达式语法错误：${error.message}`
            };
        }
    }
    
    /**
     * 重置配置
     * @returns {Object} 默认配置
     */
    reset() {
        return {
            version: this.configVersion,
            enabled: false,
            combinationMode: 'AND',
            rules: [],
            advancedMode: false,
            expression: null
        };
    }
    
    /**
     * 导出配置到文件
     * @param {Object} config - 配置对象
     * @param {string} filename - 文件名（可选）
     */
    exportConfig(config, filename) {
        const exportConfig = {
            version: this.configVersion,
            exportedAt: new Date().toISOString(),
            config: config
        };
        
        const blob = new Blob([this.serialize(exportConfig)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `筛选配置_${new Date().getTime()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    /**
     * 从文件导入配置
     * @param {File} file - 文件对象
     * @returns {Promise<Object>} 配置对象
     */
    importConfig(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const importData = this.deserialize(event.target.result);
                    
                    // 检查版本
                    if (!importData.version) {
                        reject(new Error('配置文件格式不正确：缺少版本信息'));
                        return;
                    }
                    
                    // 检查配置数据
                    if (!importData.config) {
                        reject(new Error('配置文件格式不正确：缺少配置数据'));
                        return;
                    }
                    
                    // 验证配置
                    const validation = this.validate(importData.config);
                    if (validation.valid) {
                        resolve(importData.config);
                    } else {
                        reject(new Error('配置验证失败：' + validation.errors.join(', ')));
                    }
                } catch (error) {
                    reject(new Error('配置文件解析失败：' + error.message));
                }
            };
            
            reader.onerror = () => {
                reject(new Error('文件读取失败'));
            };
            
            reader.readAsText(file);
        });
    }
    
    /**
     * 设置当前配置
     * @param {Object} config - 配置对象
     */
    setCurrentConfig(config) {
        this.currentConfig = config;
    }
    
    /**
     * 获取当前配置
     * @returns {Object} 配置对象
     */
    getCurrentConfig() {
        return this.currentConfig;
    }
}

module.exports = FilterConfigManager;
