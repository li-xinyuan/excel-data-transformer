/**
 * 字段选择器组件
 * 用于选择筛选字段，带类型标识
 * @module filter/components/FieldSelector
 */

class FieldSelector {
    /**
     * 创建字段选择器实例
     * @param {Object} options - 配置选项
     * @param {Array} options.fields - 字段列表 [{index, name, dataType}]
     * @param {number} options.selectedField - 已选中的字段索引
     * @param {Function} options.onChange - 字段变更回调
     */
    constructor(options = {}) {
        this.fields = options.fields || [];
        this.selectedField = options.selectedField !== undefined ? options.selectedField : null;
        this.onChange = options.onChange || (() => {});
        this.element = null;
    }

    /**
     * 渲染字段选择器
     * @returns {HTMLElement} 选择器 DOM 元素
     */
    render() {
        const select = document.createElement('select');
        select.className = 'filter-field-selector-control';
        
        // 添加默认选项
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '请选择字段';
        select.appendChild(defaultOption);
        
        // 添加字段选项
        this.fields.forEach(field => {
            const option = document.createElement('option');
            option.value = field.index;
            option.textContent = `${this.getFieldTypeIcon(field.dataType)} ${field.name}`;
            
            if (field.index === this.selectedField) {
                option.selected = true;
            }
            
            select.appendChild(option);
        });
        
        // 绑定变更事件
        select.addEventListener('change', (e) => {
            const fieldIndex = e.target.value === '' ? null : parseInt(e.target.value);
            this.selectedField = fieldIndex;
            this.onChange(fieldIndex, this.getFieldByIndex(fieldIndex));
        });
        
        this.element = select;
        return select;
    }

    /**
     * 获取字段类型图标
     * @param {string} dataType - 数据类型
     * @returns {string} 图标字符
     */
    getFieldTypeIcon(dataType) {
        const icons = {
            'DATE': '📅',
            'NUMBER': '💰',
            'BOOLEAN': '✅',
            'STRING': '📝'
        };
        return icons[dataType] || '📝';
    }

    /**
     * 根据索引获取字段
     * @param {number} index - 字段索引
     * @returns {Object|null} 字段信息
     */
    getFieldByIndex(index) {
        return this.fields.find(f => f.index === index) || null;
    }

    /**
     * 更新字段列表
     * @param {Array} fields - 新字段列表
     */
    updateFields(fields) {
        this.fields = fields;
        if (this.element) {
            this.element.innerHTML = '';
            this.render();
        }
    }

    /**
     * 设置选中的字段
     * @param {number} fieldIndex - 字段索引
     */
    setSelectedField(fieldIndex) {
        this.selectedField = fieldIndex;
        if (this.element) {
            this.element.value = fieldIndex !== null ? String(fieldIndex) : '';
        }
    }

    /**
     * 获取当前选中的字段
     * @returns {number|null} 字段索引
     */
    getSelectedField() {
        return this.selectedField;
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
}

// 导出到全局作用域（浏览器环境）
if (typeof window !== 'undefined') {
    window.FieldSelector = FieldSelector;
}

// 导出到 CommonJS（Node.js 环境）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FieldSelector;
}
