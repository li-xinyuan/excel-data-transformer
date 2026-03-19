// 简单的逻辑表达式解析器示例
class LogicEvaluator {
    constructor() {
        this.variables = {};
    }

    // 设置变量
    setVariable(name, value) {
        this.variables[name] = value;
    }

    // 解析条件表达式
    parseCondition(condition) {
        // 替换变量引用
        let expr = condition;
        for (const [name, value] of Object.entries(this.variables)) {
            const regex = new RegExp(`\\b${name}\\b`, 'g');
            expr = expr.replace(regex, JSON.stringify(value));
        }

        // 安全的表达式求值
        try {
            // 使用 Function 构造器代替 eval，更安全
            const func = new Function('return ' + expr);
            return func();
        } catch (error) {
            console.error('表达式解析错误:', error);
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
            const condition = match[1];
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

// 设置出生日期变量
evaluator.setVariable('出生日期', '2005-06-15');

// 定义逻辑规则
const ruleText = "如果 出生日期 < '2000-01-01' 则 '上世纪出生' 否则 如果 出生日期 < '2010-01-01' 则 '00后' 否则 如果 出生日期 < '2020-01-01' 则 '10后' 否则 '02后'";

console.log('逻辑规则:', ruleText);
console.log('出生日期:', '2005-06-15');
console.log('计算结果:', evaluator.evaluate(ruleText));

// 测试不同的出生日期
console.log('\n测试不同日期:');
const testDates = ['1995-05-20', '2005-06-15', '2015-08-25', '2025-10-30'];

testDates.forEach(date => {
    evaluator.setVariable('出生日期', date);
    console.log(`${date} -> ${evaluator.evaluate(ruleText)}`);
});

// 使用 expr-eval 库的示例（如果安装了）
console.log('\n--- 使用 expr-eval 库示例 ---');
console.log('安装命令: npm install expr-eval');
console.log(`
// 示例代码:
const { Parser } = require('expr-eval');
const parser = new Parser();
const expr = parser.parse('出生日期 < "2000-01-01"');
console.log(expr.evaluate({ 出生日期: '1995-05-20' })); // true
`);
