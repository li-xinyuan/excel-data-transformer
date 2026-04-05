/**
 * 数据过滤器
 * 根据筛选配置过滤数据
 * @module filter/dataFilter
 */

const { filterEngine } = require('./filterEngine');

/**
 * 数据过滤器类
 */
class DataFilter {
  /**
   * 创建数据过滤器实例
   */
  constructor() {
    this.previewSize = 100; // 预览数据大小
  }
  
  /**
   * 过滤数据（精确计算）
   * @param {{headers: string[], rows: *[][]}} data - 源数据
   * @param {Object} config - 筛选配置
   * @returns {{headers: string[], rows: *[][], statistics: Object}} 过滤后的数据
   */
  filter(data, config) {
    const startTime = Date.now();
    const { headers, rows } = data;
    
    // 精确计算：过滤所有行
    const filteredRows = rows.filter(row => 
      filterEngine.evaluate(row, config)
    );
    
    const executionTime = Date.now() - startTime;
    
    return {
      headers,
      rows: filteredRows,
      statistics: {
        totalRows: rows.length,
        matchedRows: filteredRows.length, // 精确值
        filteredRows: rows.length - filteredRows.length, // 精确值
        matchRate: rows.length > 0 ? (filteredRows.length / rows.length) : 0,
        executionTime
      }
    };
  }
  
  /**
   * 生成预览（精确计算）
   * @param {{headers: string[], rows: *[][]}} data - 源数据
   * @param {Object} config - 筛选配置
   * @param {number} [previewSize=100] - 预览数据大小
   * @returns {Object} 预览结果
   */
  preview(data, config, previewSize = this.previewSize) {
    const startTime = Date.now();
    const { headers, rows } = data;
    
    // 精确计算：过滤所有数据
    const allFiltered = rows.filter(row => 
      filterEngine.evaluate(row, config)
    );
    
    const matchedRows = allFiltered.length;
    const filteredRows = rows.length - matchedRows;
    const matchRate = matchedRows / rows.length;
    const executionTime = Date.now() - startTime;
    
    return {
      totalRows: rows.length,
      matchedRows, // 精确值
      filteredRows, // 精确值
      matchRate,
      previewData: allFiltered.slice(0, 5), // 返回前 5 行预览
      previewHeaders: headers,
      executionTime,
      sampleSize: rows.length, // 已处理全部数据
      isEstimate: false, // 精确计算，非估算
      warnings: this.generateWarnings(config, rows.length)
    };
  }
  
  /**
   * 生成警告信息
   * @param {Object} config - 筛选配置
   * @param {number} totalRows - 总行数
   * @returns {string[]} 警告信息列表
   */
  generateWarnings(config, totalRows) {
    const warnings = [];
    
    // 检查规则数量
    if (config.rules && config.rules.length > 8) {
      warnings.push('筛选条件较多，可能影响性能');
    }
    
    // 检查匹配率
    if (totalRows > 10000) {
      warnings.push('大数据集筛选可能需要较长时间');
    }
    
    // 检查自定义表达式
    if (config.customExpression && config.customExpression.trim()) {
      warnings.push('自定义表达式需要仔细验证，确保语法正确');
    }
    
    return warnings;
  }
  
  /**
   * 批量过滤（分页处理大数据集）
   * @param {{headers: string[], rows: *[][]}} data - 源数据
   * @param {Object} config - 筛选配置
   * @param {number} [pageSize=1000] - 每页大小
   * @returns {AsyncGenerator<{headers: string[], rows: *[][], statistics: Object}>} 异步生成器
   */
  async *filterBatch(data, config, pageSize = 1000) {
    const { headers, rows } = data;
    const totalPages = Math.ceil(rows.length / pageSize);
    
    for (let page = 0; page < totalPages; page++) {
      const start = page * pageSize;
      const end = Math.min(start + pageSize, rows.length);
      const pageRows = rows.slice(start, end);
      
      const filteredRows = pageRows.filter(row => 
        filterEngine.evaluate(row, config)
      );
      
      yield {
        headers,
        rows: filteredRows,
        statistics: {
          totalRows: pageRows.length,
          matchedRows: filteredRows.length,
          filteredRows: pageRows.length - filteredRows.length,
          page: page + 1,
          totalPages
        }
      };
      
      // 让出事件循环，避免阻塞 UI
      if (page % 10 === 0 && page < totalPages - 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  }
}

// 导出单例
const dataFilter = new DataFilter();

module.exports = {
  DataFilter,
  dataFilter
};
