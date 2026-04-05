/**
 * 字段类型推断器
 * 根据字段值自动推断数据类型（日期、数值、布尔、字符串）
 * @module filter/typeInferencer
 */

/**
 * 字段类型推断器类
 */
class FieldTypeInferencer {
  /**
   * 推断字段类型
   * @param {*[]} values - 字段值列表
   * @returns {'STRING'|'NUMBER'|'DATE'|'BOOLEAN'} 推断的数据类型
   */
  infer(values) {
    if (!values || values.length === 0) {
      return 'STRING'; // 默认返回字符串
    }
    
    const sampleSize = Math.min(100, values.length);
    const sample = values.slice(0, sampleSize);
    
    // 统计各种类型的数量
    let dateCount = 0;
    let numberCount = 0;
    let booleanCount = 0;
    let emptyCount = 0;
    
    for (const value of sample) {
      if (value === null || value === undefined || value === '' || value === '-') {
        emptyCount++;
        continue;
      }
      
      if (this.isDate(value)) {
        dateCount++;
      } else if (this.isNumber(value)) {
        numberCount++;
      } else if (this.isBoolean(value)) {
        booleanCount++;
      }
    }
    
    // 计算非空值数量
    const nonEmptyCount = sampleSize - emptyCount;
    if (nonEmptyCount === 0) {
      return 'STRING';
    }
    
    // 判断主导类型（超过 60% 为非空值中的某种类型）
    const threshold = nonEmptyCount * 0.6;
    
    if (dateCount >= threshold) {
      return 'DATE';
    }
    if (numberCount >= threshold) {
      return 'NUMBER';
    }
    if (booleanCount >= threshold) {
      return 'BOOLEAN';
    }
    
    // 默认返回字符串
    return 'STRING';
  }
  
  /**
   * 判断是否为日期
   * @param {*} value - 值
   * @returns {boolean} 是否为日期
   */
  isDate(value) {
    // 快速检查：日期格式正则
    const dateRegex = /^\d{4}-\d{1,2}-\d{1,2}/;
    if (!dateRegex.test(String(value))) {
      return false;
    }
    
    // 尝试解析为 Date 对象
    const date = new Date(value);
    return !isNaN(date.getTime());
  }
  
  /**
   * 判断是否为数值
   * @param {*} value - 值
   * @returns {boolean} 是否为数值
   */
  isNumber(value) {
    if (typeof value === 'number') {
      return !isNaN(value) && isFinite(value);
    }
    
    // 字符串形式的数字
    const str = String(value).trim();
    if (str === '' || str === '-') {
      return false;
    }
    
    // 支持负数、小数、千分位
    const numRegex = /^-?\d{1,3}(,\d{3})*(\.\d+)?$/;
    if (numRegex.test(str)) {
      return true;
    }
    
    // 简单数字
    const simpleNumRegex = /^-?\d+(\.\d+)?$/;
    if (simpleNumRegex.test(str)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 判断是否为布尔值
   * @param {*} value - 值
   * @returns {boolean} 是否为布尔值
   */
  isBoolean(value) {
    if (typeof value === 'boolean') {
      return true;
    }
    
    const booleanValues = [
      'true', 'false',
      '是', '否',
      'yes', 'no',
      '对', '错',
      '有', '无',
      '1', '0'
    ];
    
    return booleanValues.includes(String(value).toLowerCase().trim());
  }
  
  /**
   * 将值转换为指定类型
   * @param {*} value - 原始值
   * @param {'STRING'|'NUMBER'|'DATE'|'BOOLEAN'} type - 目标类型
   * @returns {*} 转换后的值
   */
  convertValue(value, type) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    
    switch (type) {
      case 'NUMBER':
        return this.toNumber(value);
      case 'DATE':
        return this.toDate(value);
      case 'BOOLEAN':
        return this.toBoolean(value);
      case 'STRING':
      default:
        return String(value);
    }
  }
  
  /**
   * 转换为数值
   * @param {*} value - 值
   * @returns {number|null} 转换后的数值
   */
  toNumber(value) {
    if (typeof value === 'number') {
      return value;
    }
    
    const str = String(value).trim();
    if (str === '' || str === '-') {
      return null;
    }
    
    // 移除千分位
    const cleanStr = str.replace(/,/g, '');
    const num = Number(cleanStr);
    
    return isNaN(num) ? null : num;
  }
  
  /**
   * 转换为日期
   * @param {*} value - 值
   * @returns {Date|null} 转换后的日期
   */
  toDate(value) {
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }
    
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  
  /**
   * 转换为布尔值
   * @param {*} value - 值
   * @returns {boolean|null} 转换后的布尔值
   */
  toBoolean(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    
    const trueValues = ['true', '是', 'yes', '对', '有', '1'];
    const falseValues = ['false', '否', 'no', '错', '无', '0'];
    
    const str = String(value).toLowerCase().trim();
    
    if (trueValues.includes(str)) {
      return true;
    }
    if (falseValues.includes(str)) {
      return false;
    }
    
    return null;
  }
}

// 导出单例
const inferencer = new FieldTypeInferencer();

module.exports = {
  FieldTypeInferencer,
  inferencer
};
