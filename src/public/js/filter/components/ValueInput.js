/**
 * 值输入框组件
 * 根据操作符类型提供不同的输入方式（单值、多值、范围）
 * @module filter/components/ValueInput
 */

class ValueInput {
    /**
     * 创建值输入框实例
     * @param {Object} options - 配置选项
     * @param {string} options.operator - 当前操作符
     * @param {string} options.dataType - 字段数据类型
     * @param {string|Array} options.value - 当前值
     * @param {Function} options.onChange - 值变更回调
     */
    constructor(options = {}) {
        this.operator = options.operator || null;
        this.dataType = options.dataType || 'STRING';
        this.value = options.value !== undefined ? options.value : '';
        this.onChange = options.onChange || (() => {});
        this.element = null;
        this.inputType = this.getInputType();
    }

    /**
     * 渲染值输入框
     * @returns {HTMLElement} 输入框 DOM 元素
     */
    render() {
        const container = document.createElement('div');
        container.className = 'filter-value-input-container';
        
        this.inputType = this.getInputType();
        
        if (this.inputType === 'single') {
            container.appendChild(this.renderSingleInput());
        } else if (this.inputType === 'multi') {
            container.appendChild(this.renderMultiInput());
        } else if (this.inputType === 'range') {
            container.appendChild(this.renderRangeInput());
        }
        
        this.element = container;
        return container;
    }

    /**
     * 渲染单值输入框
     * @returns {HTMLElement}
     */
    renderSingleInput() {
        const input = document.createElement('input');
        input.type = this.getInputFieldType();
        input.className = 'filter-value-input-control';
        input.placeholder = this.getPlaceholder();
        input.value = this.value || '';
        
        input.addEventListener('input', (e) => {
            this.value = e.target.value;
            this.onChange(this.value);
        });
        
        return input;
    }

    /**
     * 渲染多值输入框（用于 IN/NOT_IN）
     * @returns {HTMLElement}
     */
    renderMultiInput() {
        const container = document.createElement('div');
        container.className = 'multi-value-input';
        
        const values = Array.isArray(this.value) ? this.value : (this.value ? this.value.split(/[\uFF0C,]/).map(v => v.trim()) : []);
        
        // 简化为单个输入框，用逗号分隔
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'filter-value-input-control';
        input.placeholder = '多个值用逗号分隔';
        input.value = Array.isArray(this.value) ? this.value.join(', ') : this.value;
        
        input.addEventListener('input', (e) => {
            const valueStr = e.target.value;
            // 支持中文逗号（U+FF0C）和英文逗号（U+002C）
            this.value = valueStr.split(/[\uFF0C,]/).map(v => v.trim()).filter(v => v);
            this.onChange(this.value);
        });
        
        container.appendChild(input);
        return container;
    }

    /**
     * 渲染范围输入框（用于 BETWEEN）
     * @returns {HTMLElement}
     */
    renderRangeInput() {
        const container = document.createElement('div');
        container.className = 'range-value-input';
        
        const values = Array.isArray(this.value) ? this.value : [this.value, ''];
        
        const input1 = document.createElement('input');
        input1.type = this.getInputFieldType();
        input1.className = 'filter-value-input-control';
        input1.placeholder = '最小值';
        input1.value = values[0] || '';
        
        const separator = document.createElement('span');
        separator.className = 'value-separator';
        separator.textContent = '至';
        
        const input2 = document.createElement('input');
        input2.type = this.getInputFieldType();
        input2.className = 'filter-value-input-control';
        input2.placeholder = '最大值';
        input2.value = values[1] || '';
        
        const updateValue = () => {
            this.value = [input1.value, input2.value];
            this.onChange(this.value);
        };
        
        input1.addEventListener('input', updateValue);
        input2.addEventListener('input', updateValue);
        
        container.appendChild(input1);
        container.appendChild(separator);
        container.appendChild(input2);
        
        return container;
    }

    /**
     * 获取输入类型（single/multi/range）
     * @returns {string} 输入类型
     */
    getInputType() {
        const multiOperators = ['IN', 'NOT_IN'];
        const rangeOperators = ['BETWEEN', 'NOT_BETWEEN'];
        
        if (multiOperators.includes(this.operator)) {
            return 'multi';
        } else if (rangeOperators.includes(this.operator)) {
            return 'range';
        } else {
            return 'single';
        }
    }

    /**
     * 获取输入框的 HTML type
     * @returns {string} HTML input type
     */
    getInputFieldType() {
        switch (this.dataType) {
            case 'NUMBER':
                return 'number';
            case 'DATE':
                return 'date';
            case 'BOOLEAN':
                return 'text'; // 布尔值用文本输入（true/false）
            default:
                return 'text';
        }
    }

    /**
     * 获取占位符文本
     * @returns {string} 占位符
     */
    getPlaceholder() {
        switch (this.dataType) {
            case 'NUMBER':
                return '请输入数值';
            case 'DATE':
                return '请选择日期';
            case 'BOOLEAN':
                return 'true 或 false';
            default:
                return '请输入文本';
        }
    }

    /**
     * 更新操作符
     * @param {string} operator - 新操作符
     */
    updateOperator(operator) {
        this.operator = operator;
        if (this.element) {
            this.element.innerHTML = '';
            this.render();
        }
    }

    /**
     * 更新数据类型
     * @param {string} dataType - 新数据类型
     */
    updateDataType(dataType) {
        this.dataType = dataType;
        if (this.element) {
            this.element.innerHTML = '';
            this.render();
        }
    }

    /**
     * 设置值
     * @param {string|Array} value - 值
     */
    setValue(value) {
        this.value = value;
        if (this.element) {
            this.element.innerHTML = '';
            this.render();
        }
    }

    /**
     * 获取当前值
     * @returns {string|Array} 当前值
     */
    getValue() {
        return this.value;
    }

    /**
     * 禁用输入框
     */
    disable() {
        if (this.element) {
            const inputs = this.element.querySelectorAll('input');
            inputs.forEach(input => input.disabled = true);
        }
    }

    /**
     * 启用输入框
     */
    enable() {
        if (this.element) {
            const inputs = this.element.querySelectorAll('input');
            inputs.forEach(input => input.disabled = false);
        }
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.ValueInput = ValueInput;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ValueInput;
}
