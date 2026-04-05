/**
 * 筛选评估引擎
 * 评估数据行是否满足筛选条件
 * @module filter/filterEngine
 */

const { inferencer } = require('./typeInferencer');

/**
 * 筛选评估引擎类
 */
class FilterEngine {
  /**
   * 创建筛选引擎实例
   */
  constructor() {
    this.maxRules = 10; // 最大规则数量
  }
  
  /**
   * 评估数据行是否满足筛选条件
   * @param {*[]} row - 数据行
   * @param {Object} config - 筛选配置
   * @returns {boolean} 是否满足条件
   */
  evaluate(row, config) {
    // 未启用筛选或无配置，返回 true（不过滤）
    if (!config || !config.enabled) {
      return true;
    }
    
    // 检查是否有自定义表达式（高级模式）
    if (config.customExpression && config.customExpression.trim()) {
      return this.evaluateExpression(row, config.customExpression, config.rules);
    }
    
    // 没有规则，返回 true
    const rules = config.rules || [];
    if (rules.length === 0) {
      return true;
    }
    
    // 根据组合模式评估
    if (config.combinationMode === 'OR') {
      // OR 模式：任一满足即可
      return rules.some(rule => {
        // enabled 默认为 true
        if (rule.enabled === false) return false;
        return this.evaluateRule(row, rule);
      });
    } else {
      // AND 模式：所有都要满足
      return rules.every(rule => {
        // enabled 默认为 true
        if (rule.enabled === false) return true;
        return this.evaluateRule(row, rule);
      });
    }
  }
  
  /**
   * 评估单条规则
   * @param {*[]} row - 数据行
   * @param {Object} rule - 筛选规则
   * @returns {boolean} 是否满足
   */
  evaluateRule(row, rule) {
    if (!rule) {
      return false;
    }
    
    // enabled 默认为 true
    if (rule.enabled === false) {
      return false;
    }
    
    const cellValue = row[rule.fieldIndex];
    
    // 空值处理
    if (cellValue === null || cellValue === undefined || cellValue === '' || cellValue === '-') {
      return this.evaluateNull(rule.operator);
    }
    
    // 根据操作符评估
    switch (rule.operator) {
      case 'EQUAL':
        return this.equals(cellValue, rule.value);
      
      case 'NOT_EQUAL':
        return !this.equals(cellValue, rule.value);
      
      case 'GREATER_THAN':
        return this.compare(cellValue, rule.value) > 0;
      
      case 'GREATER_THAN_OR_EQUAL':
        return this.compare(cellValue, rule.value) >= 0;
      
      case 'LESS_THAN':
        return this.compare(cellValue, rule.value) < 0;
      
      case 'LESS_THAN_OR_EQUAL':
        return this.compare(cellValue, rule.value) <= 0;
      
      case 'CONTAINS':
        return String(cellValue).includes(String(rule.value));
      
      case 'NOT_CONTAINS':
        return !String(cellValue).includes(String(rule.value));
      
      case 'STARTS_WITH':
        return String(cellValue).startsWith(String(rule.value));
      
      case 'ENDS_WITH':
        return String(cellValue).endsWith(String(rule.value));
      
      case 'IN':
        // value 是数组（来自多值输入框）
        const inValues = Array.isArray(rule.value) ? rule.value : [];
        // 使用宽松比较（处理类型转换）
        return inValues.some(v => this.compare(cellValue, v) === 0);
      
      case 'NOT_IN':
        const notInValues = Array.isArray(rule.value) ? rule.value : [];
        // 使用宽松比较（处理类型转换）
        return !notInValues.some(v => this.compare(cellValue, v) === 0);
      
      case 'BETWEEN':
        // value 是数组 [min, max]
        const betweenValues = Array.isArray(rule.value) ? rule.value : [rule.value, ''];
        return this.compare(cellValue, betweenValues[0]) >= 0 && 
               this.compare(cellValue, betweenValues[1]) <= 0;
      
      case 'IS_NULL':
        return true; // 前面已经处理了空值情况
      
      case 'IS_NOT_NULL':
        return false; // 前面已经处理了空值情况
      
      default:
        return true; // 未知操作符，默认通过
    }
  }
  
  /**
   * 评估空值操作符
   * @param {string} operator - 操作符
   * @returns {boolean} 评估结果
   */
  evaluateNull(operator) {
    switch (operator) {
      case 'IS_NULL':
        return true;
      case 'IS_NOT_NULL':
        return false;
      default:
        return false; // 其他操作符对空值返回 false
    }
  }
  
  /**
   * 值比较（考虑类型转换）
   * @param {*} a - 值 a
   * @param {*} b - 值 b
   * @returns {number} 比较结果（负数：a<b, 0: a=b, 正数：a>b）
   */
  compare(a, b) {
    // 日期比较
    if (this.isDate(a) || this.isDate(b)) {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateA - dateB;
    }
    
    // 数值比较
    const numA = inferencer.toNumber(a);
    const numB = inferencer.toNumber(b);
    if (numA !== null && numB !== null) {
      return numA - numB;
    }
    
    // 字符串比较
    return String(a).localeCompare(String(b));
  }
  
  /**
   * 值相等判断
   * @param {*} a - 值 a
   * @param {*} b - 值 b
   * @returns {boolean} 是否相等
   */
  equals(a, b) {
    return this.compare(a, b) === 0;
  }
  
  /**
   * 判断是否为日期
   * @param {*} value - 值
   * @returns {boolean} 是否为日期
   */
  isDate(value) {
    return inferencer.isDate(value);
  }
  
  /**
   * 评估自定义表达式（高级模式）
   * @param {*[]} row - 数据行
   * @param {string} expression - 表达式
   * @param {Object[]} rules - 规则列表（用于获取字段信息）
   * @returns {boolean} 评估结果
   */
  evaluateExpression(row, expression, rules) {
    try {
      // 使用 expr-eval 库（如果已加载）
      if (typeof exprParser !== 'undefined') {
        // 构建表达式上下文
        const context = {};
        rules.forEach(rule => {
          const fieldName = rule.fieldName.replace(/[^a-zA-Z0-9_]/g, '_');
          context[fieldName] = row[rule.fieldIndex];
        });
        
        // 解析并评估表达式
        const compiled = exprParser.parse(expression);
        return !!compiled.evaluate(context);
      }
      
      // 降级处理：简单表达式评估
      // TODO: 实现简单的表达式评估逻辑
      console.warn('自定义表达式需要加载 expr-eval 库，降级为可视化模式');
      return this.evaluate(row, { ...config, customExpression: null });
      
    } catch (error) {
      console.error('表达式评估失败:', error);
      return false;
    }
  }
}

// 导出单例
const filterEngine = new FilterEngine();

module.exports = {
  FilterEngine,
  filterEngine
};
