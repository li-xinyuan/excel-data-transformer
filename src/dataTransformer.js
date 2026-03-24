const XLSX = require('xlsx');
const { Parser } = require('expr-eval');
const { logger } = require('./utils/logger');

// 字符串处理函数
function applyStringTransform(value, rule) {
    if (value === undefined || value === null) return value;
    
    let result = String(value);
    
    switch (rule.operation) {
        case 'substring':
            if (rule.params) {
                const [start, length] = rule.params.split(',').map(p => parseInt(p.trim()));
                if (!isNaN(start)) {
                    result = length !== undefined && !isNaN(length) 
                        ? result.substring(start, start + length) 
                        : result.substring(start);
                }
            }
            break;
        case 'replace':
            if (rule.params) {
                const [search, replace] = rule.params.split(',').map(p => p.trim());
                if (search) {
                    result = result.replace(new RegExp(search, 'g'), replace || '');
                }
            }
            break;
        case 'trim':
            result = result.trim();
            break;
        case 'uppercase':
            result = result.toUpperCase();
            break;
        case 'lowercase':
            result = result.toLowerCase();
            break;
        case 'extract':
            if (rule.params) {
                try {
                    const regex = new RegExp(rule.params);
                    const match = result.match(regex);
                    if (match) {
                        result = match[1] !== undefined ? match[1] : match[0];
                    } else {
                        result = '';
                    }
                } catch (e) {
                    logger.warn({ error: e.message }, '正则提取失败');
                }
            }
            break;
    }

    return result;
}

// 日期转换函数
function applyDateTransform(value, rule) {
    if (value === undefined || value === null) return value;
    
    try {
        let date;
        if (typeof value === 'number') {
            if (value <= 0) return value;
            date = new Date(Date.UTC(1899, 11, 30, 0, 0, 0) + value * 24 * 60 * 60 * 1000);
        } else {
            const parsedDate = new Date(value);
            if (isNaN(parsedDate.getTime())) return value;
            date = parsedDate;
        }
        
        if (!date || isNaN(date.getTime())) return value;
        
        if (rule.targetFormat) {
            return formatDate(date, rule.targetFormat);
        }
        
        return date;
    } catch (error) {
        return value;
    }
}

// 日期格式化函数
function formatDate(date, format) {
    if (!date || !(date instanceof Date)) return '';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}

// 数值处理函数
function applyNumberTransform(value, rule) {
    if (value === undefined || value === null) return value;
    
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    
    let result;
    
    switch (rule.operation) {
        case 'round':
            result = Math.round(num);
            break;
        case 'floor':
            result = Math.floor(num);
            break;
        case 'ceil':
            result = Math.ceil(num);
            break;
        case 'fixed':
            const decimals = rule.params ? parseInt(rule.params) : 2;
            result = num.toFixed(decimals);
            break;
        default:
            result = num;
    }
    
    return result;
}

// 逻辑运算函数
function applyLogicTransform(value, rule, row) {
    if (value === undefined || value === null) return value;
    
    try {
        // 构建变量对象，使用 col0, col1 等引用当前行的字段值
        const variables = {};
        row.forEach((val, index) => {
            variables[`col${index}`] = val;
        });
        
        // 解析逻辑表达式
        const parser = new Parser();
        const expr = parser.parse(rule.expression);
        
        // 执行逻辑表达式
        const result = expr.evaluate(variables);
        
        // 直接返回表达式的计算结果
        return result;
    } catch (error) {
        console.error('逻辑表达式解析错误:', error);
        return result;
    }
}

// 值转换统一函数（用于 buildOutputRows）
function applyValueTransformForOutput(value, rule) {
    if (value === undefined || value === null) return value;
    
    if (rule.type === 'simple') {
        // 简单替换
        if (String(rule.source) === String(value)) {
            return rule.target;
        }
        return value;
    } else if (rule.type === 'string') {
        // 字符串处理
        return applyStringTransform(value, rule);
    } else if (rule.type === 'date') {
        // 日期转换
        return applyDateTransform(value, rule);
    } else if (rule.type === 'number') {
        // 数值处理
        return applyNumberTransform(value, rule);
    } else if (rule.type === 'logic') {
        // 逻辑运算
        return applyLogicTransform(value, rule, [value]);
    }
    
    return value;
}



function transformData(source, target, mapping, valueRules) {
    const result = {
        headerValues: [],
        dataRows: []
    };
    
    target.headerKeyValues.forEach(hkv => {
        result.headerValues.push({
            row: hkv.row,
            col: hkv.col,
            key: hkv.key,
            value: hkv.value
        });
    });
    
    const sourceIndexMap = {};
    mapping.columnMappings.forEach(m => {
        sourceIndexMap[m.targetIndex] = m.sourceIndex;
    });
    
    console.log(`  源数据行数: ${source.dataRows.length}`);
    console.log(`  目标列数: ${target.dataHeaders.length}`);
    console.log(`  字段映射数: ${mapping.columnMappings.length}`);
    logger.info({ sourceRows: source.dataRows.length, targetCols: target.dataHeaders.length, mappingCount: mapping.columnMappings.length }, 'Transform started');
    if (valueRules && Object.keys(valueRules).length > 0) {
        console.log(`  值转换规则数: ${Object.keys(valueRules).length}`);
    }
    
    source.dataRows.forEach((row, rowIdx) => {
        const newRow = [];
        
        target.dataHeaders.forEach((th, tIdx) => {
            const autoCol = mapping.autoGeneratedColumns.find(c => c.targetIndex === tIdx);
            if (autoCol) {
                newRow.push(rowIdx + 1);
                return;
            }
            
            const calcCol = mapping.calculatedColumns.find(c => c.targetIndex === tIdx);
            if (calcCol) {
                newRow.push('');
                return;
            }
            
            const sIdx = sourceIndexMap[tIdx];
            if (sIdx !== undefined && sIdx >= 0 && sIdx < row.length && row[sIdx] !== undefined) {
                let value = row[sIdx];
                
                    // 应用值转换规则
                if (valueRules) {
                    const ruleKey = `${sIdx}_${tIdx}`;
                    const rules = valueRules[ruleKey];
                    if (rules && rules.length > 0) {
                        for (const rule of rules) {
                            if (rule.type === 'simple') {
                                // 简单替换
                                if (String(rule.source) === String(value)) {
                                    value = rule.target;
                                    break;
                                }
                            } else if (rule.type === 'string') {
                                // 字符串处理
                                value = applyStringTransform(value, rule);
                            } else if (rule.type === 'date') {
                                // 日期转换
                                value = applyDateTransform(value, rule);
                            } else if (rule.type === 'number') {
                                // 数值处理
                                value = applyNumberTransform(value, rule);
                            } else if (rule.type === 'logic') {
                                // 逻辑运算
                                value = applyLogicTransform(value, rule, row);
                            }
                        }
                    }
                }
                
                newRow.push(value);
            } else {
                newRow.push('');
            }
        });
        
        result.dataRows.push(newRow);
    });
    
    return result;
}

function buildOutputRows(target, transformedData, mapping, originalTargetData) {
    const rows = [];
    const targetHeaders = target.dataHeaders || [];
    const columnHeaderRows = target.columnHeaderRows || [];
    
    console.log('buildOutputRows params:', {
        targetHeaders: targetHeaders.length,
        columnHeaderRows: columnHeaderRows.length,
        originalTargetData: originalTargetData ? originalTargetData.length : 'undefined',
        transformedData: transformedData ? 'exists' : 'undefined'
    });
    
    if (!originalTargetData || !Array.isArray(originalTargetData)) {
        console.error('originalTargetData is not an array:', originalTargetData);
        originalTargetData = [];
    }
    
    const maxCol = Math.max(...originalTargetData.map(row => row ? row.length : 0), targetHeaders.length);
    
    const lastHeaderRow = columnHeaderRows.length > 0 
        ? Math.max(...columnHeaderRows) 
        : (target.dataStartRow > 0 ? target.dataStartRow - 1 : 0);
    
    console.log(`  最后标题行：${lastHeaderRow}`);
    console.log(`  转换数据行数：${transformedData.dataRows ? transformedData.dataRows.length : 0}`);
    logger.debug({ lastHeaderRow, dataRows: transformedData.dataRows ? transformedData.dataRows.length : 0 }, 'Building output rows');
    
    for (let row = 0; row <= lastHeaderRow; row++) {
        if (row === target.totalRow) continue;
        
        const rowData = new Array(maxCol).fill('');
        const originalRow = originalTargetData[row] || [];
        
        // 只复制表头行的原始内容（如标题、说明文字等），不复制数据
        for (let col = 0; col < originalRow.length; col++) {
            // 如果是表头行（在数据开始行之前），复制原始内容
            // 如果是数据行位置，保持为空
            if (row < target.dataStartRow) {
                rowData[col] = originalRow[col] !== undefined && originalRow[col] !== null 
                    ? originalRow[col]
                    : '';
            }
        }
        
        rows.push(rowData);
    }
    
    const totalRowPosition = target.totalRow >= 0 ? target.totalRow : -1;
    const isTotalRowBeforeData = totalRowPosition >= 0 && totalRowPosition > lastHeaderRow;
    
    console.log(`  合计行位置: ${totalRowPosition >= 0 ? '第' + (totalRowPosition + 1) + '行' : '未找到'}`);
    console.log(`  合计行在数据行${isTotalRowBeforeData ? '之前' : '之后'}`);
    
    if (isTotalRowBeforeData && totalRowPosition >= 0) {
        const totalData = new Array(maxCol).fill('');
        const originalRow = originalTargetData[totalRowPosition] || [];
        for (let col = 0; col < originalRow.length; col++) {
            totalData[col] = originalRow[col] !== undefined && originalRow[col] !== null 
                ? originalRow[col]
                : '';
        }
        rows.push(totalData);
        console.log(`  添加合计行(数据行之前): 第${totalRowPosition + 1}行`);
    }
    
    transformedData.dataRows.forEach((row, idx) => {
        const rowData = new Array(maxCol).fill('');
        
        // 根据映射关系填充数据
        mapping.columnMappings.forEach(m => {
            if (m.sourceIndex !== undefined && m.targetIndex !== undefined) {
                let sourceValue = row[m.sourceIndex];
                // 源字段为空时，目标字段也设置为空
                if (sourceValue !== undefined && sourceValue !== null) {
                    // 应用值转换规则
                    if (m.valueTransformRules && Array.isArray(m.valueTransformRules)) {
                        m.valueTransformRules.forEach(rule => {
                            sourceValue = applyValueTransformForOutput(sourceValue, rule);
                        });
                    }
                    rowData[m.targetIndex] = sourceValue;
                } else {
                    rowData[m.targetIndex] = '';
                }
            }
        });
        
        rows.push(rowData);
    });
    
    if (!isTotalRowBeforeData && totalRowPosition >= 0) {
        const totalData = new Array(maxCol).fill('');
        const originalRow = originalTargetData[totalRowPosition] || [];
        for (let col = 0; col < originalRow.length; col++) {
            totalData[col] = originalRow[col] !== undefined && originalRow[col] !== null 
                ? originalRow[col]
                : '';
        }
        rows.push(totalData);
        console.log(`  添加合计行(数据行之后): 第${totalRowPosition + 1}行`);
    }
    
    if (target.endRow >= 0) {
        for (let row = target.endRow; row < originalTargetData.length; row++) {
            const rowData = new Array(maxCol).fill('');
            const originalRow = originalTargetData[row] || [];
            for (let col = 0; col < originalRow.length; col++) {
                rowData[col] = originalRow[col] !== undefined && originalRow[col] !== null
                    ? originalRow[col]
                    : '';
            }
            rows.push(rowData);
        }
        console.log(`  添加结束行及之后内容: 从第${target.endRow + 1}行开始`);
    }
    
    return rows;
}

function writeOutputFile(outputRows, targetSheetName, outputPath, targetAnalysis) {
    try {
        const newWs = XLSX.utils.aoa_to_sheet(outputRows);
        
        if (targetAnalysis.totalRow >= 0 && targetAnalysis.totalRowFormulas.length > 0) {
            const actualRowIdx = outputRows.findIndex((row, idx) => {
                const firstCell = String(row[0] || '').toLowerCase();
                return firstCell.includes('合计') || firstCell.includes('总计') || firstCell.includes('小计');
            });
            
            if (actualRowIdx >= 0) {
                targetAnalysis.totalRowFormulas.forEach(formula => {
                    const cellRef = XLSX.utils.encode_cell({ r: actualRowIdx, c: formula.col });
                    if (!newWs[cellRef]) {
                        newWs[cellRef] = { t: 'n', v: 0 };
                    }
                    newWs[cellRef].f = formula.formula;
                    delete newWs[cellRef].v;
                });
            }
        }
        
        const newWb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWb, newWs, targetSheetName);
        XLSX.writeFile(newWb, outputPath, { compression: true });
        
        return newWb;
    } catch (error) {
        // 检查错误类型
        if (error.code === 'ENOENT') {
            error.message = '输出目录不存在，请确保目录路径正确';
        } else if (error.code === 'EACCES') {
            error.message = '权限不足，无法写入文件';
        } else if (error.code === 'ENOSPC') {
            error.message = '磁盘空间不足';
        }
        throw error;
    }
}

module.exports = {
    transformData,
    buildOutputRows,
    writeOutputFile,
    applyStringTransform,
    applyDateTransform,
    applyNumberTransform,
    applyValueTransformForOutput,
    formatDate
};
