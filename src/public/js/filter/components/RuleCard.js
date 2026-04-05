/**
 * 条件卡片组件
 * 整合字段选择器、操作符选择器、值输入框
 * @module filter/components/RuleCard
 */

// 注意：这些组件已通过 script 标签加载到全局作用域
// const FieldSelector = require('./FieldSelector');
// const OperatorSelector = require('./OperatorSelector');
// const ValueInput = require('./ValueInput');

class RuleCard {
    /**
     * 创建条件卡片实例
     * @param {Object} options - 配置选项
     * @param {Array} options.fields - 字段列表
     * @param {Array} options.operators - 操作符列表
     * @param {Object} options.rule - 筛选规则 {fieldIndex, operator, value}
     * @param {number} options.index - 条件索引
     * @param {boolean} options.isLast - 是否是最后一个条件
     * @param {Function} options.onChange - 条件变更回调
     * @param {Function} options.onDelete - 删除条件回调
     * @param {Function} options.onCombinationChange - 组合模式变更回调
     */
    constructor(options = {}) {
        this.fields = options.fields || [];
        this.operators = options.operators || [];
        this.rule = options.rule || { fieldIndex: null, operator: null, value: '' };
        this.index = options.index || 0;
        this.isLast = options.isLast !== false;
        this.totalRules = options.totalRules || 1; // 总规则数量
        this.onChange = options.onChange || (() => {});
        this.onDelete = options.onDelete || (() => {});
        this.onCombinationChange = options.onCombinationChange || (() => {});
        this.onMoveUp = options.onMoveUp || (() => {});
        this.onMoveDown = options.onMoveDown || (() => {});
        this.onDuplicate = options.onDuplicate || (() => {});
        
        this.element = null;
        this.fieldSelector = null;
        this.operatorSelector = null;
        this.valueInput = null;
    }

    /**
     * 渲染条件卡片
     * @returns {HTMLElement} 卡片 DOM 元素
     */
    render() {
        const card = document.createElement('div');
        card.className = 'filter-rule-card';
        card.dataset.index = this.index;
        
        // 渲染头部
        card.appendChild(this.renderHeader());
        
        // 渲染内容
        card.appendChild(this.renderContent());
        
        this.element = card;
        return card;
    }

    /**
     * 渲染卡片头部
     * @returns {HTMLElement}
     */
    renderHeader() {
        const header = document.createElement('div');
        header.className = 'filter-rule-card-header';
        
        // 组合模式选择（AND/OR）
        const combinationDiv = document.createElement('div');
        combinationDiv.className = 'filter-rule-combination';
        
        const label = document.createElement('span');
        label.textContent = '条件关系:';
        
        const select = document.createElement('select');
        select.innerHTML = `
            <option value="AND" ${this.rule.combinationMode === 'AND' ? 'selected' : ''}>AND (并且)</option>
            <option value="OR" ${this.rule.combinationMode === 'OR' ? 'selected' : ''}>OR (或者)</option>
        `;
        
        select.addEventListener('change', (e) => {
            this.rule.combinationMode = e.target.value;
            this.onCombinationChange(this.index, e.target.value);
        });
        
        combinationDiv.appendChild(label);
        combinationDiv.appendChild(select);
        
        // 操作按钮
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'filter-rule-actions';
        
        // 禁用/启用按钮
        const disableBtn = document.createElement('button');
        disableBtn.className = 'btn-disable-rule';
        disableBtn.textContent = this.rule.enabled === false ? '启用' : '禁用';
        disableBtn.addEventListener('click', () => {
            this.rule.enabled = this.rule.enabled === false ? true : false;
            disableBtn.textContent = this.rule.enabled === false ? '启用' : '禁用';
            card.classList.toggle('disabled', this.rule.enabled === false);
            this.onChange(this.index, this.rule);
        });
        
        // 上移按钮
        const moveUpBtn = document.createElement('button');
        moveUpBtn.className = 'btn-move-rule';
        moveUpBtn.textContent = '↑';
        moveUpBtn.title = '上移';
        moveUpBtn.disabled = this.index === 0; // 第一个条件不能上移
        moveUpBtn.addEventListener('click', () => {
            this.onMoveUp(this.index);
        });
        
        // 下移按钮
        const moveDownBtn = document.createElement('button');
        moveDownBtn.className = 'btn-move-rule';
        moveDownBtn.textContent = '↓';
        moveDownBtn.title = '下移';
        moveDownBtn.disabled = this.index === this.totalRules - 1; // 最后一个条件不能下移
        moveDownBtn.addEventListener('click', () => {
            this.onMoveDown(this.index);
        });
        
        // 复制按钮
        const duplicateBtn = document.createElement('button');
        duplicateBtn.className = 'btn-duplicate-rule';
        duplicateBtn.textContent = '📋';
        duplicateBtn.title = '复制条件';
        duplicateBtn.addEventListener('click', () => {
            this.onDuplicate(this.index, this.rule);
        });
        
        // 删除按钮
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete-rule';
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', () => {
            if (confirm('确定要删除此筛选条件吗？')) {
                this.onDelete(this.index);
            }
        });
        
        actionsDiv.appendChild(moveUpBtn);
        actionsDiv.appendChild(moveDownBtn);
        actionsDiv.appendChild(duplicateBtn);
        actionsDiv.appendChild(disableBtn);
        actionsDiv.appendChild(deleteBtn);
        
        header.appendChild(combinationDiv);
        header.appendChild(actionsDiv);
        
        return header;
    }

    /**
     * 渲染卡片内容
     * @returns {HTMLElement}
     */
    renderContent() {
        const content = document.createElement('div');
        content.className = 'filter-rule-content';
        
        // 字段选择器
        const fieldSelectorDiv = document.createElement('div');
        fieldSelectorDiv.className = 'filter-field-selector';
        this.fieldSelector = new FieldSelector({
            fields: this.fields,
            selectedField: this.rule.fieldIndex,
            onChange: (fieldIndex, field) => {
                this.rule.fieldIndex = fieldIndex;
                // 字段变更时，重置操作符和值
                this.rule.operator = null;
                this.rule.value = '';
                this.updateOperatorSelector(field);
                this.updateValueInput();
                this.onChange(this.index, this.rule);
            }
        });
        fieldSelectorDiv.appendChild(this.fieldSelector.render());
        
        // 操作符选择器
        const operatorSelectorDiv = document.createElement('div');
        operatorSelectorDiv.className = 'filter-operator-selector';
        const selectedField = this.fields.find(f => f.index === this.rule.fieldIndex);
        const operatorsForType = this.getOperatorsForField(selectedField);
        this.operatorSelector = new OperatorSelector({
            operators: operatorsForType,
            selectedOperator: this.rule.operator,
            onChange: (operator, op) => {
                this.rule.operator = operator;
                // 操作符变更时，清空值（因为不同操作符需要的值可能不同）
                this.rule.value = '';
                this.updateValueInput();
                this.onChange(this.index, this.rule);
            }
        });
        operatorSelectorDiv.appendChild(this.operatorSelector.render());
        
        // 值输入框
        const valueInputDiv = document.createElement('div');
        valueInputDiv.className = 'filter-value-input';
        this.valueInput = new ValueInput({
            operator: this.rule.operator,
            dataType: selectedField ? selectedField.dataType : 'STRING',
            value: this.rule.value,
            onChange: (value) => {
                this.rule.value = value;
                this.onChange(this.index, this.rule);
            }
        });
        valueInputDiv.appendChild(this.valueInput.render());
        
        // 占位符（保持网格布局）
        const placeholderDiv = document.createElement('div');
        
        content.appendChild(fieldSelectorDiv);
        content.appendChild(operatorSelectorDiv);
        content.appendChild(valueInputDiv);
        content.appendChild(placeholderDiv);
        
        return content;
    }

    /**
     * 根据字段获取可用的操作符
     * @param {Object} field - 字段信息
     * @returns {Array} 操作符列表
     */
    getOperatorsForField(field) {
        if (!field || !field.dataType) {
            return this.operators;
        }
        
        return this.operators.filter(op => {
            if (!op.supportedTypes) return true;
            return op.supportedTypes.includes(field.dataType);
        });
    }

    /**
     * 更新操作符选择器
     * @param {Object} field - 字段信息
     */
    updateOperatorSelector(field) {
        const operatorsForType = this.getOperatorsForField(field);
        this.operatorSelector.updateOperators(operatorsForType);
    }

    /**
     * 更新值输入框
     */
    updateValueInput() {
        const selectedField = this.fields.find(f => f.index === this.rule.fieldIndex);
        const dataType = selectedField ? selectedField.dataType : 'STRING';
        
        // 先清空 ValueInput 的值
        if (this.valueInput) {
            this.valueInput.value = '';
        }
        
        this.valueInput.updateOperator(this.rule.operator);
        this.valueInput.updateDataType(dataType);
        
        // 更新 DOM 元素
        const valueInputDiv = this.element ? this.element.querySelector('.filter-value-input') : null;
        if (valueInputDiv && this.valueInput.element) {
            // 清空并重新添加
            valueInputDiv.innerHTML = '';
            valueInputDiv.appendChild(this.valueInput.element);
        }
    }

    /**
     * 更新条件数据
     * @param {Object} rule - 新规则
     */
    updateRule(rule) {
        this.rule = { ...this.rule, ...rule };
        
        if (this.element) {
            this.element.innerHTML = '';
            this.render();
        }
    }

    /**
     * 设置是否为最后一个条件
     * @param {boolean} isLast
     */
    setIsLast(isLast) {
        this.isLast = isLast;
        if (this.element) {
            // 重新渲染以更新按钮显示
            const oldElement = this.element;
            const newElement = this.render();
            oldElement.parentNode.replaceChild(newElement, oldElement);
            this.element = newElement;
        }
    }

    /**
     * 获取当前规则
     * @returns {Object} 规则
     */
    getRule() {
        return { ...this.rule };
    }

    /**
     * 验证规则是否完整
     * @returns {boolean} 是否有效
     */
    isValid() {
        return (
            this.rule.fieldIndex !== null &&
            this.rule.operator !== null &&
            this.rule.value !== '' &&
            this.rule.value !== null
        );
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.RuleCard = RuleCard;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RuleCard;
}
