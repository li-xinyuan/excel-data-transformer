/**
 * 数据筛选模块
 * 提供数据筛选功能的核心模块
 * @module filter
 */

// 导出类型定义
const {
  OPERATOR_METADATA,
  getOperatorMeta,
  getOperatorsForType,
  getOperatorLabel
} = require('./types');

// 导出工具类
const {
  FieldTypeInferencer,
  inferencer
} = require('./typeInferencer');

// 导出核心引擎
const {
  FilterEngine,
  filterEngine
} = require('./filterEngine');

// 导出数据过滤器
const {
  DataFilter,
  dataFilter
} = require('./dataFilter');

/**
 * 创建筛选器实例
 * @param {Object} [config] - 初始配置
 * @returns {Object} 筛选器 API
 */
function createFilter(config) {
  return {
    /**
     * 过滤数据
     * @param {{headers: string[], rows: *[][]}} data - 源数据
     * @returns {{headers: string[], rows: *[][], statistics: Object}} 过滤后的数据
     */
    filter(data) {
      return dataFilter.filter(data, config);
    },
    
    /**
     * 生成预览
     * @param {{headers: string[], rows: *[][]}} data - 源数据
     * @param {number} [previewSize] - 预览大小
     * @returns {Object} 预览结果
     */
    preview(data, previewSize) {
      return dataFilter.preview(data, config, previewSize);
    },
    
    /**
     * 更新配置
     * @param {Object} newConfig - 新配置
     */
    setConfig(newConfig) {
      config = { ...config, ...newConfig };
    },
    
    /**
     * 获取当前配置
     * @returns {Object} 当前配置
     */
    getConfig() {
      return config;
    },
    
    /**
     * 启用筛选
     */
    enable() {
      config.enabled = true;
    },
    
    /**
     * 禁用筛选
     */
    disable() {
      config.enabled = false;
    },
    
    /**
     * 添加规则
     * @param {Object} rule - 筛选规则
     */
    addRule(rule) {
      if (!config.rules) {
        config.rules = [];
      }
      if (config.rules.length < 10) {
        config.rules.push(rule);
      }
    },
    
    /**
     * 移除规则
     * @param {number} index - 规则索引
     */
    removeRule(index) {
      if (config.rules && index >= 0 && index < config.rules.length) {
        config.rules.splice(index, 1);
      }
    },
    
    /**
     * 清除所有规则
     */
    clearRules() {
      config.rules = [];
    },
    
    /**
     * 上移规则
     * @param {number} index - 规则索引
     */
    moveRuleUp(index) {
      if (index <= 0 || !config.rules || index >= config.rules.length) {
        return;
      }
      // 交换数组元素
      const temp = config.rules[index];
      config.rules[index] = config.rules[index - 1];
      config.rules[index - 1] = temp;
    },
    
    /**
     * 下移规则
     * @param {number} index - 规则索引
     */
    moveRuleDown(index) {
      if (index >= config.rules.length - 1 || !config.rules || index < 0) {
        return;
      }
      // 交换数组元素
      const temp = config.rules[index];
      config.rules[index] = config.rules[index + 1];
      config.rules[index + 1] = temp;
    },
    
    /**
     * 复制规则
     * @param {number} index - 规则索引
     * @param {Object} ruleToDuplicate - 要复制的规则
     * @returns {boolean} 是否成功复制
     */
    duplicateRule(index, ruleToDuplicate) {
      if (!config.rules || config.rules.length >= 10) {
        return false;
      }
      // 深拷贝规则
      const newRule = JSON.parse(JSON.stringify(ruleToDuplicate));
      // 插入到原规则后面
      config.rules.splice(index + 1, 0, newRule);
      return true;
    }
  };
}

/**
 * 推断字段类型
 * @param {*[]} values - 字段值列表
 * @returns {'STRING'|'NUMBER'|'DATE'|'BOOLEAN'} 数据类型
 */
function inferFieldType(values) {
  return inferencer.infer(values);
}

/**
 * 创建字段类型推断器实例
 * @returns {FieldTypeInferencer} 类型推断器实例
 */
function createFieldTypeInferencer() {
  return new FieldTypeInferencer();
}

/**
 * 验证筛选配置
 * @param {Object} config - 筛选配置
 * @returns {{valid: boolean, errors: string[]}} 验证结果
 */
function validateConfig(config) {
  const errors = [];
  
  if (!config) {
    errors.push('配置不能为空');
    return { valid: false, errors };
  }
  
  // 检查规则数量
  if (config.rules && config.rules.length > 10) {
    errors.push('最多支持 10 个筛选条件');
  }
  
  // 检查每条规则
  if (config.rules) {
    config.rules.forEach((rule, index) => {
      if (!rule.fieldIndex && rule.fieldIndex !== 0) {
        errors.push(`规则 ${index + 1}: 缺少字段索引`);
      }
      if (!rule.operator) {
        errors.push(`规则 ${index + 1}: 缺少操作符`);
      }
      
      // 检查值
      const meta = getOperatorMeta(rule.operator);
      if (meta && meta.requiresValue && (rule.value === undefined || rule.value === null)) {
        errors.push(`规则 ${index + 1}: 需要输入值`);
      }
      if (meta && meta.requiresValue2) {
        // 检查 value2 或者 value 数组的第二个元素
        const hasValue2 = rule.value2 !== undefined && rule.value2 !== null ||
                         (Array.isArray(rule.value) && rule.value.length >= 2);
        if (!hasValue2) {
          errors.push(`规则 ${index + 1}: 需要输入第二个值`);
        }
      }
    });
  }
  
  // 检查自定义表达式
  if (config.customExpression && config.customExpression.trim()) {
    // TODO: 表达式语法验证
    // 需要集成 expr-eval 库
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  // 常量
  OPERATOR_METADATA,
  MAX_RULES: 10,
  
  // 工具函数
  getOperatorMeta,
  getOperatorsForType,
  getOperatorLabel,
  inferFieldType,
  createFieldTypeInferencer,
  validateConfig,
  createFilter,
  
  // 类
  FieldTypeInferencer,
  FilterEngine,
  DataFilter,
  FilterConfigManager: require('./configManager'),
  
  // 单例
  inferencer,
  filterEngine,
  dataFilter
};
