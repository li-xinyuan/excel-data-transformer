const XLSX = require('xlsx');
const config = require('./config');

function analyzeSourceFile(data) {
    if (!data || data.length === 0) {
        return {
            totalRows: 0,
            columnHeaderRow: -1,
            dataHeaders: [],
            dataStartRow: -1,
            dataEndRow: -1,
            dataRows: [],
            allRows: [],
            totalRow: -1,
            totalRowData: null
        };
    }

    const result = {
        totalRows: data.length,
        columnHeaderRow: -1,
        dataHeaders: [],
        dataStartRow: -1,
        dataEndRow: -1,
        dataRows: [],
        allRows: data,
        totalRow: -1,
        totalRowData: null
    };
    
    const headerKeywords = config.excel.headerKeywords;
    const nameColKeywords = config.excel.nameColumnKeywords;
    
    for (let row = 0; row < Math.min(data.length, 20); row++) {
        const rowData = data[row] || [];
        const nonEmptyCells = rowData.filter(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
        
        if (nonEmptyCells.length === 0) continue;
        
        if (result.columnHeaderRow === -1) {
            const hasHeaderKeywords = nonEmptyCells.some(cell => {
                const str = String(cell).toLowerCase();
                return headerKeywords.some(kw => str.includes(kw));
            });
            
            const isAllText = nonEmptyCells.every(cell => {
                const str = String(cell);
                return str.length < 50 && !str.match(/^[\d,\.]+$/);
            });
            
            const nextRowHasData = row + 1 < data.length && 
                (data[row + 1] || []).some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
            
            if (hasHeaderKeywords && isAllText && nextRowHasData && nonEmptyCells.length >= 3) {
                result.columnHeaderRow = row;
                result.dataHeaders = rowData.map(h => String(h || '').trim());
                result.dataStartRow = row + 1;
            }
        }
    }
    
    let nameColIndex = -1;
    if (result.dataHeaders.length > 0) {
        for (let i = 0; i < result.dataHeaders.length; i++) {
            const header = String(result.dataHeaders[i] || '').toLowerCase();
            if (nameColKeywords.some(kw => header.includes(kw))) {
                nameColIndex = i;
                break;
            }
        }
    }
    
    if (result.dataStartRow > 0) {
        for (let row = result.dataStartRow; row < data.length; row++) {
            const rowData = data[row] || [];
            const nonEmptyCells = rowData.filter(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
            
            if (nonEmptyCells.length === 0) continue;
            
            const firstCell = String(nonEmptyCells[0] || '').toLowerCase();
            const hasTotalKeyword = firstCell.includes('合计') || firstCell.includes('总计') || firstCell.includes('小计');
            
            if (hasTotalKeyword) {
                result.totalRow = row;
                result.totalRowData = rowData;
                continue;
            }
            
            const isEndRow = nonEmptyCells.some(cell => {
                const str = String(cell);
                return str.includes('结束') || str.includes('说明');
            });
            
            if (isEndRow) {
                result.dataEndRow = row;
                break;
            }
            
            const hasAnyTotalKeyword = nonEmptyCells.some(cell => {
                const str = String(cell || '').toLowerCase();
                return str.includes('合计') || str.includes('总计') || str.includes('小计');
            });
            
            if (hasAnyTotalKeyword && nameColIndex >= 0) {
                const nameValue = rowData[nameColIndex];
                if (!nameValue || String(nameValue).trim() === '') {
                    result.totalRow = row;
                    result.totalRowData = rowData;
                    continue;
                }
            }
            
            result.dataRows.push(rowData);
        }
        
        if (result.dataEndRow === -1) {
            result.dataEndRow = data.length - 1;
        }
    }
    
    return result;
}

function analyzeTargetTemplate(data, ws) {
    const result = {
        totalRows: data.length,
        titleRow: -1,
        titleText: '',
        headerKeyValues: [],
        columnHeaderRows: [],
        dataHeaders: [],
        dataStartRow: -1,
        dataEndRow: -1,
        dataRows: [],
        totalRow: -1,
        endRow: -1,
        allRows: data,
        worksheet: ws,
        totalRowFormulas: []
    };
    
    for (let row = 0; row < Math.min(data.length, 15); row++) {
        const rowData = data[row] || [];
        const nonEmptyCells = rowData.filter(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
        
        if (nonEmptyCells.length === 0) continue;
        
        if (result.titleRow === -1 && nonEmptyCells.length <= 3) {
            const hasTitle = nonEmptyCells.some(cell => {
                const str = String(cell);
                return str.includes('清单') || str.includes('表') || str.includes('单') || 
                       str.includes('编号') || str.includes('BOC');
            });
            if (hasTitle) {
                result.titleRow = row;
                result.titleText = nonEmptyCells.map(c => String(c)).join(' ');
                continue;
            }
        }
        
        const hasColon = rowData.some(cell => {
            const str = String(cell || '');
            return (str.includes('：') || str.includes(':')) && str.length < 20;
        });
        
        if (hasColon) {
            for (let col = 0; col < rowData.length; col++) {
                const cell = String(rowData[col] || '');
                if ((cell.includes('：') || cell.includes(':')) && cell.length < 20) {
                    const key = cell.replace(/[：:]/g, '').replace(/\*/g, '').trim();
                    const value = rowData[col + 1] || '';
                    if (key && key.length > 0 && key.length < 20) {
                        result.headerKeyValues.push({
                            row: row,
                            col: col,
                            key: key,
                            value: String(value).trim()
                        });
                    }
                }
            }
        }
        
        if (result.totalRow === -1) {
            const firstCell = String(nonEmptyCells[0] || '').toLowerCase();
            const hasTotalKeyword = firstCell.includes('合计') || firstCell.includes('总计') || firstCell.includes('小计');
            
            if (hasTotalKeyword && nonEmptyCells.length >= 2 && nonEmptyCells.length <= 15) {
                result.totalRow = row;
                
                if (ws) {
                    for (let col = 0; col < rowData.length; col++) {
                        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
                        const cell = ws[cellRef];
                        if (cell && cell.f) {
                            result.totalRowFormulas.push({
                                col: col,
                                formula: cell.f,
                                cellRef: cellRef
                            });
                        }
                    }
                }
            }
        }
    }
    
    const columnKeywords = config.excel.columnKeywords;
    
    for (let row = 0; row < Math.min(data.length, 15); row++) {
        if (row === result.totalRow) continue;
        
        const rowData = data[row] || [];
        const nonEmptyCells = rowData.filter(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
        
        if (nonEmptyCells.length < 3) continue;
        
        const hasColonInRow = nonEmptyCells.some(cell => {
            const str = String(cell || '');
            return (str.includes('：') || str.includes(':')) && str.length < 20;
        });
        
        if (hasColonInRow) continue;
        
        const firstCell = String(rowData[0] || '').toLowerCase();
        const isTotalRow = firstCell.includes('合计') || firstCell.includes('总计') || firstCell.includes('小计');
        const isEndRow = firstCell.includes('结束') || firstCell.includes('说明');
        
        if (isTotalRow || isEndRow) continue;
        
        const hasColumnKeywords = nonEmptyCells.slice(0, 5).some(cell => {
            const str = String(cell).toLowerCase();
            return columnKeywords.some(kw => str.includes(kw));
        });
        
        const isAllShortText = nonEmptyCells.slice(0, 10).every(cell => {
            const str = String(cell);
            return str.length < 30 && !str.match(/^\d+\.?\d*$/);
        });
        
        if (hasColumnKeywords && isAllShortText && nonEmptyCells.length >= 3) {
            result.columnHeaderRows.push(row);
        }
    }
    
    if (result.columnHeaderRows.length > 0) {
        const lastHeaderRow = result.columnHeaderRows[result.columnHeaderRows.length - 1];
        const headerRowData = data[lastHeaderRow] || [];
        result.dataHeaders = headerRowData.map(h => String(h || '').trim());
        result.dataStartRow = lastHeaderRow + 1;
    }
    
    if (result.totalRow >= 0 && result.totalRow >= result.dataStartRow) {
        result.dataStartRow = result.totalRow + 1;
    }
    
    if (result.dataStartRow > 0) {
        for (let row = result.dataStartRow; row < data.length; row++) {
            if (row === result.totalRow) continue;
            
            const rowData = data[row] || [];
            const nonEmptyCells = rowData.filter(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
            
            if (nonEmptyCells.length === 0) continue;
            
            const firstCell = String(nonEmptyCells[0] || '').toLowerCase();
            const isEndRow = firstCell.includes('结束') || firstCell.includes('说明');
            
            if (isEndRow) {
                result.endRow = row;
                break;
            }
            
            result.dataRows.push(rowData);
        }
        
        result.dataEndRow = result.endRow > 0 ? result.endRow - 1 : data.length - 1;
    }
    
    return result;
}

module.exports = {
    analyzeSourceFile,
    analyzeTargetTemplate
};
