/**
 * 数据筛选功能 - 类型定义
 * @module filter/types
 */

/**
 * 支持的操作符类型
 * @typedef {Object} FilterOperator
 * @property {'EQUAL'} EQUAL - 等于
 * @property {'NOT_EQUAL'} NOT_EQUAL - 不等于
 * @property {'GREATER_THAN'} GREATER_THAN - 大于
 * @property {'GREATER_EQUAL'} GREATER_EQUAL - 大于等于
 * @property {'LESS_THAN'} LESS_THAN - 小于
 * @property {'LESS_EQUAL'} LESS_EQUAL - 小于等于
 * @property {'CONTAINS'} CONTAINS - 包含
 * @property {'NOT_CONTAINS'} NOT_CONTAINS - 不包含
 * @property {'STARTS_WITH'} STARTS_WITH - 以...开头
 * @property {'ENDS_WITH'} ENDS_WITH - 以...结尾
 * @property {'IN'} IN - 在...中
 * @property {'NOT_IN'} NOT_IN - 不在...中
 * @property {'BETWEEN'} BETWEEN - 在...之间
 * @property {'IS_NULL'} IS_NULL - 为空
 * @property {'IS_NOT_NULL'} IS_NOT_NULL - 不为空
 */

/**
 * 数据类型
 * @typedef {'STRING'|'NUMBER'|'DATE'|'BOOLEAN'} DataType
 */

/**
 * 操作符元数据
 * @typedef {Object} OperatorMeta
 * @property {string} value - 操作符值
 * @property {string} label - 显示文本
 * @property {string} description - 描述
 * @property {boolean} requiresValue - 是否需要输入值
 * @property {boolean} requiresValue2 - 是否需要第二个值
 * @property {DataType[]} supportedTypes - 支持的数据类型
 */

/**
 * 单条筛选规则
 * @typedef {Object} FilterRule
 * @property {string} id - 规则唯一 ID
 * @property {number} fieldIndex - 字段索引
 * @property {string} fieldName - 字段名称
 * @property {FilterOperator} operator - 操作符
 * @property {*} [value] - 比较值（单个）
 * @property {*[]} [values] - 比较值列表（用于 IN/NOT_IN）
 * @property {*} [value2] - 比较值 2（用于 BETWEEN）
 * @property {'AND'|'OR'} logicOperator - 与下一条规则的逻辑关系
 * @property {boolean} enabled - 是否启用此规则
 */

/**
 * 筛选规则配置（顶层）
 * @typedef {Object} FilterConfig
 * @property {boolean} enabled - 是否启用筛选
 * @property {FilterRule[]} rules - 筛选规则列表
 * @property {'AND'|'OR'} combinationMode - 规则组合方式
 * @property {string} [customExpression] - 高级表达式（可选，用于复杂场景）
 */

/**
 * 筛选预览结果
 * @typedef {Object} FilterPreviewResult
 * @property {number} totalRows - 总行数
 * @property {number} matchedRows - 符合条件的行数
 * @property {number} filteredRows - 被过滤的行数
 * @property {number} matchRate - 匹配比例
 * @property {*[][]} previewData - 预览数据（前 5 行）
 * @property {string[]} previewHeaders - 预览列名
 * @property {number} executionTime - 执行时间（毫秒）
 * @property {string[]} [warnings] - 警告信息
 */

/**
 * 筛选执行结果
 * @typedef {Object} FilterExecutionResult
 * @property {boolean} success - 是否成功
 * @property {{headers: string[], rows: *[][]}} [filteredData] - 筛选后的数据
 * @property {{totalRows: number, matchedRows: number, filteredRows: number}} [statistics] - 统计信息
 * @property {string} [error] - 错误信息
 */

/**
 * 字段信息
 * @typedef {Object} FieldInfo
 * @property {number} index - 字段索引
 * @property {string} name - 字段名称
 * @property {DataType} type - 数据类型
 * @property {*[]} sample - 示例值（前 3 个）
 */

/**
 * 操作符元数据定义
 */
const OPERATOR_METADATA = [
  // 比较操作
  {
    value: 'EQUAL',
    label: '=',
    description: '等于',
    requiresValue: true,
    requiresValue2: false,
    supportedTypes: ['STRING', 'NUMBER', 'DATE', 'BOOLEAN']
  },
  {
    value: 'NOT_EQUAL',
    label: '≠',
    description: '不等于',
    requiresValue: true,
    requiresValue2: false,
    supportedTypes: ['STRING', 'NUMBER', 'DATE', 'BOOLEAN']
  },
  {
    value: 'GREATER_THAN',
    label: '>',
    description: '大于',
    requiresValue: true,
    requiresValue2: false,
    supportedTypes: ['NUMBER', 'DATE']
  },
  {
    value: 'GREATER_EQUAL',
    label: '≥',
    description: '大于等于',
    requiresValue: true,
    requiresValue2: false,
    supportedTypes: ['NUMBER', 'DATE']
  },
  {
    value: 'LESS_THAN',
    label: '<',
    description: '小于',
    requiresValue: true,
    requiresValue2: false,
    supportedTypes: ['NUMBER', 'DATE']
  },
  {
    value: 'LESS_EQUAL',
    label: '≤',
    description: '小于等于',
    requiresValue: true,
    requiresValue2: false,
    supportedTypes: ['NUMBER', 'DATE']
  },
  
  // 字符串操作
  {
    value: 'CONTAINS',
    label: '包含',
    description: '包含指定文本',
    requiresValue: true,
    requiresValue2: false,
    supportedTypes: ['STRING']
  },
  {
    value: 'NOT_CONTAINS',
    label: '不包含',
    description: '不包含指定文本',
    requiresValue: true,
    requiresValue2: false,
    supportedTypes: ['STRING']
  },
  {
    value: 'STARTS_WITH',
    label: '以...开头',
    description: '以指定文本开头',
    requiresValue: true,
    requiresValue2: false,
    supportedTypes: ['STRING']
  },
  {
    value: 'ENDS_WITH',
    label: '以...结尾',
    description: '以指定文本结尾',
    requiresValue: true,
    requiresValue2: false,
    supportedTypes: ['STRING']
  },
  
  // 集合操作
  {
    value: 'IN',
    label: '在...中',
    description: '在指定列表中',
    requiresValue: false,
    requiresValue2: false,
    supportedTypes: ['STRING', 'NUMBER', 'DATE']
  },
  {
    value: 'NOT_IN',
    label: '不在...中',
    description: '不在指定列表中',
    requiresValue: false,
    requiresValue2: false,
    supportedTypes: ['STRING', 'NUMBER', 'DATE']
  },
  
  // 范围操作
  {
    value: 'BETWEEN',
    label: '在...之间',
    description: '在两个值之间（包含边界）',
    requiresValue: true,
    requiresValue2: true,
    supportedTypes: ['NUMBER', 'DATE']
  },
  
  // 空值操作
  {
    value: 'IS_NULL',
    label: '为空',
    description: '字段值为空',
    requiresValue: false,
    requiresValue2: false,
    supportedTypes: ['STRING', 'NUMBER', 'DATE', 'BOOLEAN']
  },
  {
    value: 'IS_NOT_NULL',
    label: '不为空',
    description: '字段值不为空',
    requiresValue: false,
    requiresValue2: false,
    supportedTypes: ['STRING', 'NUMBER', 'DATE', 'BOOLEAN']
  }
];

/**
 * 获取操作符元数据
 * @param {string} operator - 操作符值
 * @returns {OperatorMeta|undefined} 操作符元数据
 */
function getOperatorMeta(operator) {
  return OPERATOR_METADATA.find(op => op.value === operator);
}

/**
 * 获取支持的操作符列表（根据数据类型过滤）
 * @param {DataType} dataType - 数据类型
 * @returns {OperatorMeta[]} 支持的操作符列表
 */
function getOperatorsForType(dataType) {
  if (!dataType) return OPERATOR_METADATA;
  return OPERATOR_METADATA.filter(op => 
    op.supportedTypes.includes(dataType)
  );
}

/**
 * 获取操作符标签
 * @param {FilterOperator} operator - 操作符
 * @returns {string} 操作符标签
 */
function getOperatorLabel(operator) {
  const meta = getOperatorMeta(operator);
  return meta ? meta.label : operator;
}

module.exports = {
  OPERATOR_METADATA,
  getOperatorMeta,
  getOperatorsForType,
  getOperatorLabel
};
