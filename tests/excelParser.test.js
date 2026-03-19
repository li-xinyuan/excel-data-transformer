const { analyzeSourceFile, analyzeTargetTemplate } = require('../src/excelParser');

describe('excelParser', () => {
    describe('analyzeSourceFile', () => {
        test('should detect header row correctly', () => {
            const data = [
                ['姓名', '年龄', '地址'],
                ['张三', '25', '北京'],
                ['李四', '30', '上海']
            ];
            
            const result = analyzeSourceFile(data);
            
            expect(result.columnHeaderRow).toBe(0);
            expect(result.dataHeaders).toEqual(['姓名', '年龄', '地址']);
            expect(result.dataStartRow).toBe(1);
        });

        test('should detect header with keywords', () => {
            const data = [
                ['姓名', '年龄', '金额'],
                ['张三', '25', '100'],
                ['李四', '30', '200']
            ];
            
            const result = analyzeSourceFile(data);
            
            expect(result.columnHeaderRow).toBe(0);
            expect(result.dataHeaders).toEqual(['姓名', '年龄', '金额']);
        });

        test('should handle data without header keywords', () => {
            const data = [
                ['张三', '25'],
                ['李四', '30']
            ];
            
            const result = analyzeSourceFile(data);
            
            expect(result.columnHeaderRow).toBe(-1);
        });

        test('should handle data with header keywords', () => {
            const data = [
                ['姓名', '年龄', '金额'],
                ['张三', '25']
            ];
            
            const result = analyzeSourceFile(data);
            
            expect(result.dataHeaders.length).toBeGreaterThan(0);
        });
    });

    describe('analyzeTargetTemplate', () => {
        test('should detect title row', () => {
            const data = [
                ['保险清单'],
                ['姓名', '金额'],
                ['张三', '100']
            ];
            const ws = {};
            
            const result = analyzeTargetTemplate(data, ws);
            
            expect(result.titleRow).toBe(0);
            expect(result.titleText).toBe('保险清单');
        });

        test('should detect header key values', () => {
            const data = [
                ['企业名称:', '测试公司'],
                ['日期:', '2024-01-01'],
                ['姓名', '金额'],
                ['张三', '100']
            ];
            const ws = {};
            
            const result = analyzeTargetTemplate(data, ws);
            
            expect(result.headerKeyValues.length).toBe(2);
            expect(result.headerKeyValues[0].key).toBe('企业名称');
            expect(result.headerKeyValues[0].value).toBe('测试公司');
        });

        test('should detect data headers', () => {
            const data = [
                ['清单'],
                ['姓名', '证件号码', '缴费金额'],
                ['张三', '110101199001011234', '1000']
            ];
            const ws = {};
            
            const result = analyzeTargetTemplate(data, ws);
            
            expect(result.dataHeaders).toEqual(['姓名', '证件号码', '缴费金额']);
        });

        test('should identify column header rows with keywords', () => {
            const data = [
                ['清单'],
                ['姓名', '金额', '类型'],
                ['张三', '100', 'A']
            ];
            const ws = {};
            
            const result = analyzeTargetTemplate(data, ws);
            
            expect(result.columnHeaderRows.length).toBeGreaterThan(0);
        });

        test('should handle empty data', () => {
            const data = [];
            const ws = {};
            
            const result = analyzeTargetTemplate(data, ws);
            
            expect(result.totalRows).toBe(0);
        });
    });
});
