// 修复的逻辑表达式解析器示例
class LogicEvaluator {
    constructor() {
        this.variables = {};
    }

    // 设置变量
    setVariable(name, value) {
        this.variables[name] = value;
    }

    // 解析条件表达式（修复版）
    parseCondition(condition) {
        // 替换变量引用 - 更安全的方式
        let expr = condition;
        
        // 按变量名长度从长到短排序，避免部分匹配
        const sortedVars = Object.entries(this.variables)
            .sort((a, b) => b[0].length - a[0].length);
        
        for (const [name, value] of sortedVars) {
            // 使用单词边界匹配
            const regex = new RegExp(`(?<!\\w)${name}(?!\\w)`, 'g');
            expr = expr.replace(regex, JSON.stringify(value));
        }

        // 安全的表达式求值
        try {
            // 使用 Function 构造器，传入变量作为参数
            const func = new Function('return ' + expr);
            return func();
        } catch (error) {
            console.error('表达式解析错误:', error, '表达式:', expr);
            return false;
        }
    }

    // 解析自然语言风格的逻辑规则
    parseNaturalLanguage(ruleText) {
        // 清理文本
        const cleanText = ruleText.trim().replace(/[“”‘’]/g, '"').replace(/[；；]/g, '');
        
        // 解析 "如果...则...否则..." 结构
        const ifRegex = /如果\s+(.+?)\s+则\s+(".*?"|'.*?'|\S+?)(?:\s+否则\s+(.+))?/;
        const match = cleanText.match(ifRegex);
        
        if (match) {
            const condition = match[1].trim();
            const trueValue = this.cleanValue(match[2]);
            const falseValue = match[3] ? this.cleanValue(match[3]) : null;
            
            // 递归解析否则部分
            if (falseValue && (falseValue.includes('如果') || falseValue.includes('如果'))) {
                const falseResult = this.parseNaturalLanguage(falseValue);
                return {
                    condition,
                    trueValue,
                    falseValue: falseResult
                };
            }
            
            return {
                condition,
                trueValue,
                falseValue
            };
        }
        
        return null;
    }

    // 清理值
    cleanValue(value) {
        return value.trim().replace(/^["']|["']$/g, '');
    }

    // 执行逻辑规则
    evaluate(rule) {
        if (typeof rule === 'string') {
            rule = this.parseNaturalLanguage(rule);
        }
        
        if (!rule) return null;
        
        const conditionResult = this.parseCondition(rule.condition);
        
        if (conditionResult) {
            return rule.trueValue;
        } else {
            if (typeof rule.falseValue === 'object' && rule.falseValue !== null) {
                // 递归计算
                return this.evaluate(rule.falseValue);
            }
            return rule.falseValue;
        }
    }
}

// 演示用法
const evaluator = new LogicEvaluator();

// 定义逻辑规则
const ruleText = "如果 出生日期 < '2000-01-01' 则 '上世纪出生' 否则 如果 出生日期 < '2010-01-01' 则 '00后' 否则 如果 出生日期 < '2020-01-01' 则 '10后' 否则 '02后'";

console.log('=== 自定义解析器演示 ===');
console.log('逻辑规则:', ruleText);

// 测试不同的出生日期
const testDates = ['1995-05-20', '2005-06-15', '2015-08-25', '2025-10-30'];

testDates.forEach(date => {
    evaluator.setVariable('出生日期', date);
    const result = evaluator.evaluate(ruleText);
    console.log(`${date} -> ${result}`);
});

console.log('\n=== 推荐使用 expr-eval 库 ===');
console.log('安装: npm install expr-eval');
console.log('示例代码:');
console.log(`
const { Parser } = require('expr-eval');
const parser = new Parser();

// 定义变量
const variables = { 出生日期: '2005-06-15' };

// 简单表达式
const expr1 = parser.parse('出生日期 < "2000-01-01"');
console.log(expr1.evaluate(variables)); // false

const expr2 = parser.parse('出生日期 < "2010-01-01"');
console.log(expr2.evaluate(variables)); // true

// 复杂的条件表达式
const getResult = (birthDate) => {
    const vars = { 出生日期: birthDate };
    if (parser.parse('出生日期 < "2000-01-01"').evaluate(vars)) {
        return '上世纪出生';
    } else if (parser.parse('出生日期 < "2010-01-01"').evaluate(vars)) {
        return '00后';
    } else if (parser.parse('出生日期 < "2020-01-01"').evaluate(vars)) {
        return '10后';
    } else {
        return '02后';
    }
};

console.log(getResult('1995-05-20')); // 上世纪出生
console.log(getResult('2005-06-15')); // 00后
console.log(getResult('2015-08-25')); // 10后
console.log(getResult('2025-10-30')); // 02后
`);
