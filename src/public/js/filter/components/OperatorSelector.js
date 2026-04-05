/**
 * 操作符选择器组件
 * 根据字段类型动态显示可用的操作符
 * @module filter/components/OperatorSelector
 */

class OperatorSelector {
    /**
     * 创建操作符选择器实例
     * @param {Object} options - 配置选项
     * @param {Array} options.operators - 操作符列表 [{value, label, description}]
     * @param {string} options.selectedOperator - 已选中的操作符
     * @param {Function} options.onChange - 操作符变更回调
     */
    constructor(options = {}) {
        this.operators = options.operators || [];
        this.selectedOperator = options.selectedOperator || null;
        this.onChange = options.onChange || (() => {});
        this.element = null;
    }

    /**
     * 渲染操作符选择器
     * @returns {HTMLElement} 选择器 DOM 元素
     */
    render() {
        const select = document.createElement('select');
        select.className = 'filter-operator-selector-control';
        
        // 添加默认选项
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '请选择操作符';
        select.appendChild(defaultOption);
        
        // 添加操作符选项
        this.operators.forEach(op => {
            const option = document.createElement('option');
            option.value = op.value;
            option.textContent = `${op.label} ${op.description ? '- ' + op.description : ''}`;
            option.title = op.description || '';
            
            if (op.value === this.selectedOperator) {
                option.selected = true;
            }
            
            select.appendChild(option);
        });
        
        // 绑定变更事件
        select.addEventListener('change', (e) => {
            const operator = e.target.value === '' ? null : e.target.value;
            this.selectedOperator = operator;
            this.onChange(operator, this.getOperatorByValue(operator));
        });
        
        this.element = select;
        return select;
    }

    /**
     * 根据值获取操作符
     * @param {string} value - 操作符值
     * @returns {Object|null} 操作符信息
     */
    getOperatorByValue(value) {
        return this.operators.find(op => op.value === value) || null;
    }

    /**
     * 更新操作符列表
     * @param {Array} operators - 新操作符列表
     */
    updateOperators(operators) {
        this.operators = operators;
        this.selectedOperator = null;
        if (this.element) {
            // 直接更新现有 select 元素的选项，而不是重新渲染
            this.element.innerHTML = '';
            
            // 添加默认选项
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '请选择操作符';
            this.element.appendChild(defaultOption);
            
            // 添加操作符选项
            this.operators.forEach(op => {
                const option = document.createElement('option');
                option.value = op.value;
                option.textContent = `${op.label} ${op.description ? '- ' + op.description : ''}`;
                option.title = op.description || '';
                this.element.appendChild(option);
            });
        }
    }

    /**
     * 设置选中的操作符
     * @param {string} operator - 操作符值
     */
    setSelectedOperator(operator) {
        this.selectedOperator = operator;
        if (this.element) {
            this.element.value = operator || '';
        }
    }

    /**
     * 获取当前选中的操作符
     * @returns {string|null} 操作符值
     */
    getSelectedOperator() {
        return this.selectedOperator;
    }

    /**
     * 禁用选择器
     */
    disable() {
        if (this.element) {
            this.element.disabled = true;
        }
    }

    /**
     * 启用选择器
     */
    enable() {
        if (this.element) {
            this.element.disabled = false;
        }
    }

    /**
     * 根据字段类型过滤操作符
     * @param {string} dataType - 字段类型
     * @param {Array} allOperators - 所有操作符
     */
    filterByDataType(dataType, allOperators) {
        if (!dataType) {
            this.updateOperators(allOperators);
            return;
        }
        
        const filtered = allOperators.filter(op => {
            if (!op.supportedTypes) return true;
            return op.supportedTypes.includes(dataType);
        });
        
        this.updateOperators(filtered);
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.OperatorSelector = OperatorSelector;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OperatorSelector;
}
