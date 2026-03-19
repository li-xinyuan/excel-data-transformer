const { applyStringTransform, applyDateTransform, applyNumberTransform, formatDate } = require('../src/dataTransformer');

describe('dataTransformer', () => {
    describe('applyStringTransform', () => {
        test('should handle substring operation', () => {
            const value = 'Hello World';
            const rule = { operation: 'substring', params: '0,5' };
            
            const result = applyStringTransform(value, rule);
            expect(result).toBe('Hello');
        });

        test('should handle substring with only start', () => {
            const value = 'Hello World';
            const rule = { operation: 'substring', params: '6' };
            
            const result = applyStringTransform(value, rule);
            expect(result).toBe('World');
        });

        test('should handle replace operation', () => {
            const value = 'Hello World';
            const rule = { operation: 'replace', params: 'World,Node.js' };
            
            const result = applyStringTransform(value, rule);
            expect(result).toBe('Hello Node.js');
        });

        test('should handle trim operation', () => {
            const value = '  Hello  ';
            const rule = { operation: 'trim' };
            
            const result = applyStringTransform(value, rule);
            expect(result).toBe('Hello');
        });

        test('should handle uppercase operation', () => {
            const value = 'hello';
            const rule = { operation: 'uppercase' };
            
            const result = applyStringTransform(value, rule);
            expect(result).toBe('HELLO');
        });

        test('should handle lowercase operation', () => {
            const value = 'HELLO';
            const rule = { operation: 'lowercase' };
            
            const result = applyStringTransform(value, rule);
            expect(result).toBe('hello');
        });

        test('should handle null/undefined values', () => {
            expect(applyStringTransform(null, { operation: 'trim' })).toBeNull();
            expect(applyStringTransform(undefined, { operation: 'trim' })).toBeUndefined();
        });
    });

    describe('applyDateTransform', () => {
        test('should convert Excel date number to formatted string', () => {
            const excelDate = 45321;
            const rule = { targetFormat: 'YYYY-MM-DD' };
            
            const result = applyDateTransform(excelDate, rule);
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        test('should parse date string to Date object', () => {
            const dateStr = '2024-01-15';
            const rule = {};
            
            const result = applyDateTransform(dateStr, rule);
            expect(result).toBeInstanceOf(Date);
        });

        test('should format date with custom format', () => {
            const dateStr = '2024-01-15';
            const rule = { targetFormat: 'YYYY/MM/DD' };
            
            const result = applyDateTransform(dateStr, rule);
            expect(result).toBe('2024/01/15');
        });

        test('should return original value for invalid date', () => {
            const invalidValue = 'not a date';
            const rule = { targetFormat: 'YYYY-MM-DD' };
            
            const result = applyDateTransform(invalidValue, rule);
            expect(result).toBe('not a date');
        });
    });

    describe('applyNumberTransform', () => {
        test('should handle round operation', () => {
            const value = 3.7;
            const rule = { operation: 'round' };
            
            const result = applyNumberTransform(value, rule);
            expect(result).toBe(4);
        });

        test('should handle floor operation', () => {
            const value = 3.9;
            const rule = { operation: 'floor' };
            
            const result = applyNumberTransform(value, rule);
            expect(result).toBe(3);
        });

        test('should handle ceil operation', () => {
            const value = 3.1;
            const rule = { operation: 'ceil' };
            
            const result = applyNumberTransform(value, rule);
            expect(result).toBe(4);
        });

        test('should handle fixed operation', () => {
            const value = 3.14159;
            const rule = { operation: 'fixed', params: '2' };
            
            const result = applyNumberTransform(value, rule);
            expect(result).toBe('3.14');
        });

        test('should return original value for non-numeric input', () => {
            const value = 'not a number';
            const rule = { operation: 'round' };
            
            const result = applyNumberTransform(value, rule);
            expect(result).toBe('not a number');
        });

        test('should handle null/undefined values', () => {
            expect(applyNumberTransform(null, { operation: 'round' })).toBeNull();
            expect(applyNumberTransform(undefined, { operation: 'round' })).toBeUndefined();
        });
    });

    describe('formatDate', () => {
        test('should format date with YYYY-MM-DD', () => {
            const date = new Date('2024-01-15T10:30:00');
            
            const result = formatDate(date, 'YYYY-MM-DD');
            expect(result).toBe('2024-01-15');
        });

        test('should format date with time', () => {
            const date = new Date('2024-01-15T10:30:45');
            
            const result = formatDate(date, 'YYYY-MM-DD HH:mm:ss');
            expect(result).toBe('2024-01-15 10:30:45');
        });

        test('should return empty string for invalid date', () => {
            expect(formatDate(null, 'YYYY-MM-DD')).toBe('');
            expect(formatDate(undefined, 'YYYY-MM-DD')).toBe('');
            expect(formatDate('invalid', 'YYYY-MM-DD')).toBe('');
        });

        test('should pad single digit month and day', () => {
            const date = new Date('2024-01-05T03:05:07');
            
            const result = formatDate(date, 'YYYY-MM-DD HH:mm:ss');
            expect(result).toBe('2024-01-05 03:05:07');
        });
    });
});
