/**
 * 筛选配置面板
 * 整合所有条件卡片，管理筛选配置
 * @module filter/components/FilterPanel
 */

// 注意：RuleCard 已通过 script 标签加载到全局作用域
// const RuleCard = require('./RuleCard');

// 内联简化的配置管理器（避免 require 导致的浏览器兼容性问题）
class SimpleConfigManager {
    constructor(options = {}) {
        this.configVersion = '1.0';
        this.availableFields = options.availableFields || [];
    }
    
    setAvailableFields(fields) {
        this.availableFields = fields;
    }
    
    serialize(config) {
        return JSON.stringify(config, null, 2);
    }
    
    deserialize(jsonString) {
        return JSON.parse(jsonString);
    }
    
    validate(config) {
        const errors = [];
        const warnings = [];
        
        if (!config) {
            errors.push('配置不能为空');
            return { valid: false, errors, warnings };
        }
        if (!config.version) {
            config.version = this.configVersion;
        }
        
        // 规则验证
        if (config.rules && Array.isArray(config.rules)) {
            config.rules.forEach((rule, index) => {
                const ruleValidation = this.validateRule(rule, index);
                if (!ruleValidation.valid) {
                    errors.push(...ruleValidation.errors);
                } else if (ruleValidation.warnings) {
                    warnings.push(...ruleValidation.warnings);
                }
            });
        }
        
        // 表达式验证（高级模式）
        if (config.advancedMode && config.expression) {
            const exprValidation = this.validateExpression(config.expression);
            if (!exprValidation.valid) {
                errors.push(exprValidation.error);
            }
        }
        
        return { valid: errors.length === 0, errors, warnings };
    }
    
    validateRule(rule, index) {
        const errors = [];
        const warnings = [];
        
        // 字段索引验证
        if (rule.fieldIndex === undefined || rule.fieldIndex === null) {
            errors.push(`规则 #${index + 1}: 字段索引不能为空`);
        } else if (this.availableFields && this.availableFields.length > 0) {
            // 检查字段索引是否在当前字段列表中
            if (rule.fieldIndex < 0 || rule.fieldIndex >= this.availableFields.length) {
                errors.push(`规则 #${index + 1}: 字段索引 ${rule.fieldIndex} 超出范围 (0-${this.availableFields.length - 1})`);
            } else {
                // 验证字段名称是否匹配
                const fieldName = this.availableFields[rule.fieldIndex]?.name;
                if (fieldName && rule.fieldName && fieldName !== rule.fieldName) {
                    warnings.push(`规则 #${index + 1}: 字段名称不匹配（配置中为"${rule.fieldName}"，当前为"${fieldName}"）`);
                }
            }
        }
        
        // 操作符验证
        if (!rule.operator) {
            errors.push(`规则 #${index + 1}: 操作符不能为空`);
        } else {
            const validOperators = [
                'EQUAL', 'NOT_EQUAL',
                'GREATER_THAN', 'LESS_THAN',
                'GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL',
                'CONTAINS', 'NOT_CONTAINS',
                'STARTS_WITH', 'ENDS_WITH',
                'IN', 'NOT_IN',
                'BETWEEN',
                'IS_EMPTY', 'IS_NOT_EMPTY'
            ];
            if (!validOperators.includes(rule.operator)) {
                errors.push(`规则 #${index + 1}: 操作符 "${rule.operator}" 无效`);
            }
        }
        
        // 值验证
        if (!['IS_EMPTY', 'IS_NOT_EMPTY'].includes(rule.operator)) {
            if (rule.value === undefined || rule.value === null || rule.value === '') {
                errors.push(`规则 #${index + 1}: 值不能为空`);
            }
        }
        
        // enabled 字段验证
        if (rule.enabled === undefined) {
            rule.enabled = true;
        }
        
        return { valid: errors.length === 0, errors, warnings };
    }
    
    validateExpression(expression) {
        try {
            if (!expression || typeof expression !== 'string') {
                return {
                    valid: false,
                    error: '表达式不能为空'
                };
            }
            
            // 检查括号匹配
            const openParens = (expression.match(/\(/g) || []).length;
            const closeParens = (expression.match(/\)/g) || []).length;
            if (openParens !== closeParens) {
                return {
                    valid: false,
                    error: '表达式括号不匹配，请检查括号是否正确闭合'
                };
            }
            
            // 检查空表达式
            const trimmed = expression.trim();
            if (!trimmed) {
                return {
                    valid: false,
                    error: '表达式不能为空'
                };
            }
            
            // 检查非法字符
            if (/[;{}]/.test(trimmed)) {
                return {
                    valid: false,
                    error: '表达式包含非法字符（不允许使用 ; { }）'
                };
            }
            
            // TODO: 使用 expr-eval 进行更严格的验证
            // const Parser = require('expr-eval').Parser;
            // const parser = new Parser();
            // parser.parse(expression);
            
            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                error: `表达式语法错误：${error.message}`
            };
        }
    }
    
    reset() {
        return {
            version: this.configVersion,
            enabled: false,
            combinationMode: 'AND',
            rules: [],
            advancedMode: false,
            expression: null
        };
    }
    
    exportConfig(config, filename) {
        const exportData = {
            version: this.configVersion,
            exportedAt: new Date().toISOString(),
            config: config
        };
        const blob = new Blob([this.serialize(exportData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `筛选配置_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    importConfig(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importData = this.deserialize(event.target.result);
                    if (!importData.version) {
                        reject(new Error('配置文件格式不正确：缺少版本信息'));
                        return;
                    }
                    if (!importData.config) {
                        reject(new Error('配置文件格式不正确：缺少配置数据'));
                        return;
                    }
                    const validation = this.validate(importData.config);
                    if (validation.valid) {
                        resolve(importData.config);
                    } else {
                        reject(new Error('配置验证失败：' + validation.errors.join(', ')));
                    }
                } catch (error) {
                    reject(new Error('配置文件解析失败：' + error.message));
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file);
        });
    }
}

class FilterPanel {
    /**
     * 创建筛选配置面板实例
     * @param {Object} options - 配置选项
     * @param {Array} options.fields - 字段列表
     * @param {Object} options.filterConfig - 筛选配置
     * @param {Function} options.onConfigChange - 配置变更回调
     * @param {string} options.containerId - 容器 ID
     */
    constructor(options = {}) {
        this.fields = options.fields || [];
        this.filterConfig = options.filterConfig || {
            enabled: false,
            combinationMode: 'AND',
            rules: []
        };
        this.onConfigChange = options.onConfigChange || (() => {});
        this.containerId = options.containerId || 'filterPanelContainer';
        this.operators = options.operators || []; // 从外部传入操作符列表
        this.hidePreviewPanel = options.hidePreviewPanel || false; // 是否隐藏内部预览面板（预览弹窗内嵌模式）
        
        // 初始化配置管理器
        this.configManager = new SimpleConfigManager({
            availableFields: this.fields
        });
        
        this.element = null;
        this.ruleCards = [];
        this.multiSelectMode = false;
        this.selectedRuleIndices = new Set();
        this.isLoading = false;
        this.lastError = null;
        this.previewDebounceTimer = null;
        this.previewDebounceDelay = 500;
    }

    /**
     * 渲染筛选配置面板
     * @returns {HTMLElement} 面板 DOM 元素
     */
    render() {
        const panel = document.createElement('div');
        panel.className = 'filter-panel';
        
        // 渲染头部
        panel.appendChild(this.renderHeader());
        
        // 渲染条件列表
        const conditionsList = document.createElement('div');
        conditionsList.className = 'filter-conditions-list';
        conditionsList.id = 'filterConditionsList';
        
        if (this.filterConfig.rules.length > 0) {
            // 有规则时，渲染规则卡片
            this.ruleCards = this.filterConfig.rules.map((rule, index) => {
                return this.createRuleCard(rule, index);
            });
            
            this.ruleCards.forEach(card => {
                conditionsList.appendChild(card.render());
            });
        } else {
            // 没有规则时，显示空状态
            conditionsList.appendChild(this.renderEmptyState());
        }
        
        panel.appendChild(conditionsList);
        
        // 添加条件按钮（内嵌模式始终显示；独立模式仅在启用时显示）
        if (this.hidePreviewPanel || this.filterConfig.enabled) {
            panel.appendChild(this.renderAddRuleButton());
        }
        
        // 渲染预览面板（仅在非内嵌模式下显示）
        if (!this.hidePreviewPanel) {
            panel.appendChild(this.renderPreviewPanel());
        }
        
        this.element = panel;
        return panel;
    }

    /**
     * 渲染面板头部
     * @returns {HTMLElement}
     */
    renderHeader() {
        const header = document.createElement('div');
        header.className = 'filter-panel-header';
        
        const title = document.createElement('div');
        title.className = 'filter-panel-title';
        title.textContent = '数据筛选配置';
        
        const actions = document.createElement('div');
        actions.className = 'filter-panel-actions';
        
        // 启用/禁用筛选
        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'filter-enable-toggle';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = this.filterConfig.enabled;
        checkbox.addEventListener('change', (e) => {
            this.filterConfig.enabled = e.target.checked;
            
            // 启用/禁用时，更新空状态文本和添加按钮的显示
            const conditionsList = document.getElementById('filterConditionsList');
            if (conditionsList) {
                conditionsList.innerHTML = '';
                if (this.filterConfig.enabled && this.filterConfig.rules.length > 0) {
                    // 有规则时渲染规则卡片
                    this.ruleCards = this.filterConfig.rules.map((rule, index) => {
                        return this.createRuleCard(rule, index);
                    });
                    this.ruleCards.forEach(card => {
                        conditionsList.appendChild(card.render());
                    });
                } else {
                    // 显示空状态
                    conditionsList.appendChild(this.renderEmptyState());
                }
            }
            
            // 更新或添加按钮
            let addBtn = document.getElementById('filterAddRuleBtn');
            if (this.filterConfig.enabled) {
                // 启用时需要显示按钮
                if (!addBtn) {
                    // 按钮不存在，创建并添加
                    addBtn = this.renderAddRuleButton();
                    const conditionsListNextSibling = conditionsList ? conditionsList.nextSibling : null;
                    if (conditionsList && conditionsList.parentNode) {
                        conditionsList.parentNode.insertBefore(addBtn, conditionsListNextSibling);
                    }
                } else {
                    // 按钮存在，显示它
                    addBtn.style.display = 'flex';
                }
            } else {
                // 禁用时隐藏按钮
                if (addBtn) {
                    addBtn.style.display = 'none';
                }
            }
            
            this.notifyChange();
        });
        
        const toggleText = document.createElement('span');
        toggleText.textContent = '启用筛选';
        
        toggleLabel.appendChild(checkbox);
        toggleLabel.appendChild(toggleText);
        actions.appendChild(toggleLabel);
        
        // 配置管理按钮组（始终显示）
        const configActions = document.createElement('div');
        configActions.className = 'filter-panel-config-actions';
        configActions.style.display = 'flex';
        configActions.style.gap = '8px';
        configActions.style.marginLeft = 'auto';
        
        // 导出按钮
        const exportBtn = document.createElement('button');
        exportBtn.className = 'btn-config-action';
        exportBtn.textContent = '📤 导出';
        exportBtn.title = '导出筛选配置';
        exportBtn.addEventListener('click', () => this.exportConfig());
        
        // 导入按钮
        const importBtn = document.createElement('button');
        importBtn.className = 'btn-config-action';
        importBtn.textContent = '📥 导入';
        importBtn.title = '导入筛选配置';
        importBtn.addEventListener('click', () => this.importConfig());
        
        // 重置按钮
        const resetBtn = document.createElement('button');
        resetBtn.className = 'btn-config-action btn-reset';
        resetBtn.textContent = '🗑️ 重置';
        resetBtn.title = '重置筛选配置';
        resetBtn.addEventListener('click', () => this.resetConfig());
        
        configActions.appendChild(exportBtn);
        configActions.appendChild(importBtn);
        configActions.appendChild(resetBtn);
        actions.appendChild(configActions);
        
        // 隐藏的文件输入框（用于导入）
        if (!document.getElementById('filterConfigFileInput')) {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = 'filterConfigFileInput';
            fileInput.accept = '.json';
            fileInput.style.display = 'none';
            fileInput.addEventListener('change', (e) => this.handleFileImport(e));
            document.body.appendChild(fileInput);
        }
        
        // 批量操作按钮（只在启用筛选且有多个条件时显示）
        if (this.filterConfig.enabled && this.filterConfig.rules.length > 1) {
            const batchBtn = document.createElement('button');
            batchBtn.className = 'btn-batch-operation';
            batchBtn.textContent = this.multiSelectMode ? '完成批量操作' : '批量操作';
            batchBtn.addEventListener('click', () => {
                if (this.multiSelectMode) {
                    this.exitMultiSelectMode();
                } else {
                    this.enterMultiSelectMode();
                }
            });
            actions.appendChild(batchBtn);
        }
        
        header.appendChild(title);
        header.appendChild(actions);
        
        return header;
    }

    /**
     * 渲染空状态
     * @returns {HTMLElement}
     */
    renderEmptyState() {
        const emptyState = document.createElement('div');
        emptyState.className = 'filter-empty-state';
        
        const icon = document.createElement('div');
        icon.className = 'filter-empty-state-icon';
        icon.textContent = '🔍';
        
        const text = document.createElement('div');
        text.className = 'filter-empty-state-text';
        
        if (this.hidePreviewPanel) {
            // 内嵌模式：直接提示添加条件
            text.innerHTML = '还没有筛选条件<br/>点击下方"添加条件"按钮开始配置';
        } else if (this.filterConfig.enabled) {
            text.innerHTML = '还没有添加筛选条件<br/>点击下方"添加条件"按钮开始配置';
        } else {
            text.textContent = '筛选功能已禁用，勾选"启用筛选"开始配置条件';
        }
        
        emptyState.appendChild(icon);
        emptyState.appendChild(text);
        
        return emptyState;
    }

    /**
     * 渲染添加条件按钮
     * @returns {HTMLElement}
     */
    renderAddRuleButton() {
        const button = document.createElement('button');
        button.className = 'filter-add-rule-btn';
        button.id = 'filterAddRuleBtn';
        button.textContent = '添加条件';
        button.addEventListener('click', () => {
            this.addRule();
        });
        
        return button;
    }

    /**
     * 渲染预览面板
     * @returns {HTMLElement}
     */
    renderPreviewPanel() {
        const preview = document.createElement('div');
        preview.className = 'filter-preview-panel';
        preview.id = 'filterPreviewPanel';
        preview.style.display = 'none'; // 初始隐藏
        
        const title = document.createElement('div');
        title.className = 'filter-preview-title';
        title.textContent = '📊 筛选预览';
        
        const stats = document.createElement('div');
        stats.className = 'filter-preview-stats';
        stats.id = 'filterPreviewStats';
        
        preview.appendChild(title);
        preview.appendChild(stats);
        
        return preview;
    }

    /**
     * 创建条件卡片
     * @param {Object} rule - 规则
     * @param {number} index - 索引
     * @returns {RuleCard}
     */
    createRuleCard(rule, index) {
        const card = new RuleCard({
            fields: this.fields,
            operators: this.operators,
            rule: {
                ...rule,
                combinationMode: index === 0 ? this.filterConfig.combinationMode : rule.combinationMode,
                enabled: rule.enabled !== false // 默认启用
            },
            index: index,
            totalRules: this.filterConfig.rules.length,
            isLast: index === this.filterConfig.rules.length - 1,
            onChange: (idx, updatedRule) => {
                this.updateRule(idx, updatedRule);
            },
            onDelete: (idx) => {
                this.removeRule(idx);
            },
            onCombinationChange: (idx, mode) => {
                if (idx === 0) {
                    this.filterConfig.combinationMode = mode;
                }
                this.notifyChange();
            },
            onMoveUp: (idx) => {
                this.moveRuleUp(idx);
            },
            onMoveDown: (idx) => {
                this.moveRuleDown(idx);
            },
            onDuplicate: (idx, ruleToDuplicate) => {
                this.duplicateRule(idx, ruleToDuplicate);
            }
        });
        
        return card;
    }

    /**
     * 添加条件
     */
    addRule() {
        if (this.filterConfig.rules.length >= 10) {
            alert('最多支持 10 个筛选条件');
            return;
        }
        
        // 内嵌模式：添加规则时自动启用筛选
        if (this.hidePreviewPanel && !this.filterConfig.enabled) {
            this.filterConfig.enabled = true;
        }
        
        const newRule = {
            fieldIndex: null,
            operator: null,
            value: '',
            enabled: true,
            combinationMode: 'AND'
        };
        
        this.filterConfig.rules.push(newRule);
        
        const card = this.createRuleCard(newRule, this.filterConfig.rules.length - 1);
        
        // 更新最后一个条件的标记
        if (this.ruleCards.length > 0) {
            this.ruleCards[this.ruleCards.length - 1].setIsLast(false);
        }
        
        this.ruleCards.push(card);
        
        const list = document.getElementById('filterConditionsList');
        if (list) {
            // 清空列表（移除空状态）
            list.innerHTML = '';
            // 添加所有规则卡片
            this.ruleCards.forEach(c => {
                list.appendChild(c.render());
            });
        }
        
        this.notifyChange();
    }

    /**
     * 更新条件
     * @param {number} index - 条件索引
     * @param {Object} updatedRule - 更新后的规则
     */
    updateRule(index, updatedRule) {
        this.filterConfig.rules[index] = updatedRule;
        this.notifyChange();
    }

    /**
     * 上移条件
     * @param {number} index - 条件索引
     */
    moveRuleUp(index) {
        if (index <= 0) return; // 第一个条件不能上移
        
        // 交换数组元素
        const temp = this.filterConfig.rules[index];
        this.filterConfig.rules[index] = this.filterConfig.rules[index - 1];
        this.filterConfig.rules[index - 1] = temp;
        
        // 重新渲染
        this.refresh();
        this.notifyChange();
    }

    /**
     * 下移条件
     * @param {number} index - 条件索引
     */
    moveRuleDown(index) {
        if (index >= this.filterConfig.rules.length - 1) return; // 最后一个条件不能下移
        
        // 交换数组元素
        const temp = this.filterConfig.rules[index];
        this.filterConfig.rules[index] = this.filterConfig.rules[index + 1];
        this.filterConfig.rules[index + 1] = temp;
        
        // 重新渲染
        this.refresh();
        this.notifyChange();
    }

    /**
     * 复制条件
     * @param {number} index - 条件索引
     * @param {Object} ruleToDuplicate - 要复制的规则
     */
    duplicateRule(index, ruleToDuplicate) {
        if (this.filterConfig.rules.length >= 10) {
            alert('最多支持 10 个筛选条件');
            return;
        }
        
        // 深拷贝规则
        const newRule = JSON.parse(JSON.stringify(ruleToDuplicate));
        
        // 插入到原规则后面
        this.filterConfig.rules.splice(index + 1, 0, newRule);
        
        // 重新渲染
        this.refresh();
        this.notifyChange();
        
        showSuccess('条件已复制');
    }

    /**
     * 删除条件
     * @param {number} index - 条件索引
     */
    removeRule(index) {
        // 内嵌模式（预览弹窗中）：允许删除最后一条规则，删除后显示空状态
        // 独立模式：至少保留一条规则
        if (!this.hidePreviewPanel && this.filterConfig.rules.length <= 1) {
            alert('至少需要保留一个筛选条件');
            return;
        }
        
        this.filterConfig.rules.splice(index, 1);
        
        // 重新渲染所有卡片（或显示空状态）
        const list = document.getElementById('filterConditionsList');
        if (list) {
            list.innerHTML = '';
            
            if (this.filterConfig.rules.length === 0) {
                // 所有规则已删除，显示空状态
                list.appendChild(this.renderEmptyState());
                this.ruleCards = [];
                
                // 隐藏"添加条件"按钮（因为规则清空后需要先启用才能添加）
                const addBtn = document.getElementById('filterAddRuleBtn');
                if (addBtn && !this.filterConfig.enabled) {
                    addBtn.style.display = 'none';
                }
            } else {
                this.ruleCards = this.filterConfig.rules.map((rule, idx) => {
                    const card = this.createRuleCard(rule, idx);
                    list.appendChild(card.render());
                    return card;
                });
            }
        }
        
        this.notifyChange();
    }

    /**
     * 刷新面板
     */
    refresh() {
        if (!this.element) return;
        
        // 直接清空内容
        this.element.innerHTML = '';
        
        // 重新渲染各个部分并添加到元素中
        this.element.appendChild(this.renderHeader());
        
        // 条件列表
        const conditionsList = document.createElement('div');
        conditionsList.className = 'filter-conditions-list';
        conditionsList.id = 'filterConditionsList';
        
        if (this.filterConfig.rules.length > 0) {
            this.ruleCards = this.filterConfig.rules.map((rule, index) => {
                return this.createRuleCard(rule, index);
            });
            
            this.ruleCards.forEach(card => {
                conditionsList.appendChild(card.render());
            });
        } else {
            conditionsList.appendChild(this.renderEmptyState());
        }
        
        this.element.appendChild(conditionsList);
        
        // 添加条件按钮（内嵌模式始终显示；独立模式仅在启用时显示）
        if (this.hidePreviewPanel || this.filterConfig.enabled) {
            this.element.appendChild(this.renderAddRuleButton());
        }
        
        // 预览面板（仅在非内嵌模式下显示）
        if (!this.hidePreviewPanel) {
            this.element.appendChild(this.renderPreviewPanel());
        }
    }

    /**
     * 通知配置变更
     */
    notifyChange() {
        this.onConfigChange({ ...this.filterConfig });
        
        // 如果有有效的规则，触发预览
        const hasValidRules = this.filterConfig.rules.some(rule => 
            rule.fieldIndex !== null && 
            rule.operator !== null && 
            rule.value !== '' && 
            rule.value !== null
        );
        
        if (hasValidRules && this.filterConfig.enabled) {
            // 使用防抖预览
            this.schedulePreview();
        } else {
            this.hidePreview();
        }
    }

    /**
     * 隐藏预览
     */
    hidePreview() {
        const previewPanel = document.getElementById('filterPreviewPanel');
        if (previewPanel) {
            previewPanel.style.display = 'none';
        }
        
        // 隐藏表格
        const tableContainer = document.getElementById('filterPreviewTableContainer');
        if (tableContainer) {
            tableContainer.style.display = 'none';
        }
    }

    /**
     * 获取筛选配置
     * @returns {Object} 筛选配置
     */
    getFilterConfig() {
        return { ...this.filterConfig };
    }

    /**
     * 设置筛选配置
     * @param {Object} config - 新配置
     */
    setFilterConfig(config) {
        this.filterConfig = { ...config };
        this.refresh();
    }

    /**
     * 加载字段列表
     * @param {Array} fields - 字段列表
     */
    loadFields(fields) {
        this.fields = fields;
        this.refresh();
    }

    /**
     * 验证配置
     * @returns {Object} 验证结果
     */
    validate() {
        if (!this.filterConfig.enabled) {
            return { valid: true, errors: [] };
        }
        
        const errors = [];
        this.filterConfig.rules.forEach((rule, index) => {
            if (rule.enabled === false) return; // 跳过错用的规则
            
            if (rule.fieldIndex === null || rule.fieldIndex === undefined) {
                errors.push(`条件${index + 1}: 请选择字段`);
            }
            if (rule.operator === null || rule.operator === undefined) {
                errors.push(`条件${index + 1}: 请选择操作符`);
            }
            if (rule.value === '' || rule.value === null || rule.value === undefined) {
                errors.push(`条件${index + 1}: 请输入值`);
            }
        });
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    /**
     * 进入多选模式
     */
    enterMultiSelectMode() {
        this.multiSelectMode = true;
        this.selectedRuleIndices.clear();
        this.refresh();
    }
    
    /**
     * 退出多选模式
     */
    exitMultiSelectMode() {
        this.multiSelectMode = false;
        this.selectedRuleIndices.clear();
        this.refresh();
    }
    
    /**
     * 切换规则选中状态
     * @param {number} index - 规则索引
     */
    toggleRuleSelection(index) {
        if (this.selectedRuleIndices.has(index)) {
            this.selectedRuleIndices.delete(index);
        } else {
            this.selectedRuleIndices.add(index);
        }
        this.refresh();
    }
    
    /**
     * 全选所有规则
     */
    selectAllRules() {
        this.filterConfig.rules.forEach((_, index) => {
            this.selectedRuleIndices.add(index);
        });
        this.refresh();
    }
    
    /**
     * 取消全选
     */
    deselectAllRules() {
        this.selectedRuleIndices.clear();
        this.refresh();
    }
    
    /**
     * 批量删除选中的规则
     */
    batchDeleteSelectedRules() {
        if (this.selectedRuleIndices.size === 0) {
            alert('请先选择要删除的条件');
            return;
        }
        
        if (this.filterConfig.rules.length - this.selectedRuleIndices.size < 1) {
            alert('至少需要保留一个筛选条件');
            return;
        }
        
        if (!confirm(`确定要删除选中的 ${this.selectedRuleIndices.size} 个条件吗？`)) {
            return;
        }
        
        // 从后往前删除，避免索引变化
        const indicesToDelete = Array.from(this.selectedRuleIndices).sort((a, b) => b - a);
        indicesToDelete.forEach(index => {
            this.filterConfig.rules.splice(index, 1);
        });
        
        this.selectedRuleIndices.clear();
        this.multiSelectMode = false;
        this.refresh();
        this.notifyChange();
    }
    
    /**
     * 防抖预览
     */
    schedulePreview() {
        // 清除之前的定时器
        if (this.previewDebounceTimer) {
            clearTimeout(this.previewDebounceTimer);
        }
        
        // 设置新的定时器
        this.previewDebounceTimer = setTimeout(() => {
            this.fetchPreview();
        }, this.previewDebounceDelay);
    }
    
    /**
     * 获取预览数据
     */
    async fetchPreview() {
        if (!this.filterConfig.enabled) {
            return;
        }
        
        // 验证配置
        const validation = this.validate();
        if (!validation.valid) {
            return; // 配置无效时不获取预览
        }
        
        try {
            this.showLoading();
            
            const response = await fetch('/api/filter/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filterConfig: this.filterConfig,
                    previewSize: 100
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.preview) {
                this.updatePreview(data.preview);
                this.lastError = null;
            } else {
                this.showError(data.message || '预览失败');
            }
        } catch (error) {
            console.error('预览请求失败:', error);
            this.handleError(error);
        } finally {
            this.hideLoading();
        }
    }
    
    /**
     * 更新预览显示
     * @param {Object} previewData - 预览数据
     */
    updatePreview(previewData) {
        const previewPanel = document.getElementById('filterPreviewPanel');
        if (!previewPanel) return;
        
        previewPanel.style.display = 'block';
        
        const statsContainer = document.getElementById('filterPreviewStats');
        if (!statsContainer) return;
        
        // 更新统计信息
        statsContainer.innerHTML = `
            <div class="filter-preview-stat">
                <div class="filter-preview-stat-label">总行数</div>
                <div class="filter-preview-stat-value">${previewData.totalRows.toLocaleString()}</div>
            </div>
            <div class="filter-preview-stat">
                <div class="filter-preview-stat-label">符合条件</div>
                <div class="filter-preview-stat-value matched">${previewData.matchedRows.toLocaleString()}</div>
            </div>
            <div class="filter-preview-stat">
                <div class="filter-preview-stat-label">已过滤</div>
                <div class="filter-preview-stat-value filtered">${(previewData.totalRows - previewData.matchedRows).toLocaleString()}</div>
            </div>
            <div class="filter-preview-stat">
                <div class="filter-preview-stat-label">匹配率</div>
                <div class="filter-preview-stat-value rate">${(previewData.matchRate * 100).toFixed(1)}%</div>
            </div>
        `;
        
        // 添加执行时间提示
        try {
            const infoDiv = document.createElement('div');
            infoDiv.className = 'filter-preview-info';
            infoDiv.innerHTML = `
                <div class="filter-preview-execution-time">执行时间：${previewData.executionTime}ms</div>
            `;
            if (statsContainer.appendChild) {
                statsContainer.appendChild(infoDiv);
            }
        } catch (error) {
            // 忽略 DOM 操作错误（测试环境中可能出现）
            console.warn('更新预览信息失败:', error);
        }
        
        // 显示预览数据表格
        if (previewData.previewData && previewData.previewData.length > 0) {
            this.showPreviewTable(previewData);
        } else {
            // 没有数据时，隐藏表格
            this.hidePreviewTable();
        }
    }
    
    /**
     * 隐藏预览表格
     */
    hidePreviewTable() {
        const oldTable = document.getElementById('filterPreviewTableContainer');
        if (oldTable) {
            if (typeof oldTable.remove === 'function') {
                oldTable.remove();
            } else if (oldTable.parentNode) {
                oldTable.parentNode.removeChild(oldTable);
            } else {
                oldTable.style.display = 'none';
            }
        }
    }
    
    /**
     * 显示预览数据表格
     * @param {Object} previewData - 预览数据
     */
    showPreviewTable(previewData) {
        // 移除旧的表格
        const oldTable = document.getElementById('filterPreviewTableContainer');
        if (oldTable) {
            if (typeof oldTable.remove === 'function') {
                oldTable.remove();
            } else {
                // 测试环境中可能没有 remove 方法
                oldTable.parentNode = null;
            }
        }
        
        const tableContainer = document.createElement('div');
        tableContainer.id = 'filterPreviewTableContainer';
        tableContainer.className = 'filter-preview-table-container';
        
        const title = document.createElement('div');
        title.className = 'filter-preview-table-title';
        title.textContent = `预览数据（前 ${Math.min(previewData.previewData.length, 5)} 行）`;
        
        const table = document.createElement('table');
        table.className = 'filter-preview-table';
        
        // 表头
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        // 使用后端返回的真实字段名
        const headers = previewData.previewHeaders || [];
        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header || '-';
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // 表体
        const tbody = document.createElement('tbody');
        previewData.previewData.slice(0, 5).forEach(row => {
            const tr = document.createElement('tr');
            row.forEach(cell => {
                const td = document.createElement('td');
                td.textContent = cell !== null && cell !== undefined && cell !== '' ? cell : '-';
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        
        table.appendChild(tbody);
        
        tableContainer.appendChild(title);
        tableContainer.appendChild(table);
        
        // 插入到统计信息后面
        const statsContainer = document.getElementById('filterPreviewStats');
        if (statsContainer && statsContainer.parentNode) {
            statsContainer.parentNode.insertBefore(tableContainer, statsContainer.nextSibling);
        }
    }
    
    /**
     * 显示加载状态
     */
    showLoading() {
        this.isLoading = true;
        const previewPanel = document.getElementById('filterPreviewPanel');
        if (!previewPanel) return;
        
        let loadingDiv = document.getElementById('filterPreviewLoading');
        if (!loadingDiv) {
            loadingDiv = document.createElement('div');
            loadingDiv.id = 'filterPreviewLoading';
            loadingDiv.className = 'filter-preview-loading';
            previewPanel.insertBefore(loadingDiv, previewPanel.firstChild);
        }
        loadingDiv.style.display = 'block';
    }
    
    /**
     * 隐藏加载状态
     */
    hideLoading() {
        this.isLoading = false;
        const loadingDiv = document.getElementById('filterPreviewLoading');
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
        }
    }
    
    /**
     * 显示错误信息
     * @param {string} message - 错误信息
     */
    showError(message) {
        this.lastError = message;
        const previewPanel = document.getElementById('filterPreviewPanel');
        if (!previewPanel) return;
        
        let errorDiv = document.getElementById('filterPreviewError');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'filterPreviewError';
            errorDiv.className = 'filter-preview-error';
            previewPanel.appendChild(errorDiv);
        }
        
        errorDiv.innerHTML = `
            <div class="filter-preview-error-icon">❌</div>
            <div class="filter-preview-error-message">${message}</div>
            <button class="filter-preview-retry-btn" onclick="filterPanel.fetchPreview()">重试</button>
        `;
        errorDiv.style.display = 'block';
    }
    
    /**
     * 处理错误
     * @param {Error} error - 错误对象
     */
    handleError(error) {
        let message = '预览请求失败';
        
        if (error.message.includes('Failed to fetch')) {
            message = '无法连接到服务器，请检查网络连接';
        } else if (error.message.includes('HTTP 400')) {
            message = '筛选配置无效，请检查条件设置';
        } else if (error.message.includes('HTTP 500')) {
            message = '服务器错误，请稍后重试';
        } else if (error.message.includes('timeout')) {
            message = '预览请求超时，请重试';
        }
        
        this.showError(message);
    }
    
    /**
     * 销毁组件，清理定时器
     */
    destroy() {
        // 清理防抖定时器
        if (this.previewDebounceTimer) {
            clearTimeout(this.previewDebounceTimer);
            this.previewDebounceTimer = null;
        }
        
        // 清空调用栈引用
        this.element = null;
        this.ruleCards = [];
        this.selectedRuleIndices.clear();
        
        console.log('FilterPanel 组件已销毁');
    }
    
    /**
     * 导出筛选配置
     */
    exportConfig() {
        const exportData = {
            enabled: this.filterConfig.enabled,
            combinationMode: this.filterConfig.combinationMode,
            rules: this.filterConfig.rules,
            advancedMode: this.filterConfig.advancedMode || false,
            expression: this.filterConfig.expression || null
        };
        
        this.configManager.exportConfig(exportData, `筛选配置_${Date.now()}.json`);
        
        if (typeof ErrorToast !== 'undefined') {
            ErrorToast.show('配置已导出', 'success');
        } else {
            console.log('配置已导出');
        }
    }
    
    /**
     * 导入筛选配置
     */
    importConfig() {
        const fileInput = document.getElementById('filterConfigFileInput');
        if (fileInput) {
            fileInput.click();
        }
    }
    
    /**
     * 处理文件导入
     * @param {Event} event - 文件选择事件
     */
    async handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const config = await this.configManager.importConfig(file);
            
            // 验证配置
            const validation = this.configManager.validate(config);
            
            // 如果有严重错误，拒绝导入
            if (!validation.valid) {
                throw new Error('配置验证失败：' + validation.errors.join(', '));
            }
            
            // 更新配置
            this.filterConfig = config;
            
            // 更新配置管理器中的字段列表
            this.configManager.setAvailableFields(this.fields);
            
            // 重新渲染
            this.refresh();
            
            // 通知配置变更
            this.notifyChange();
            
            // 显示验证结果
            if (validation.warnings && validation.warnings.length > 0) {
                const message = '配置已导入，但有 ' + validation.warnings.length + ' 个警告：\n' + 
                    validation.warnings.join('\n');
                if (typeof ErrorToast !== 'undefined') {
                    ErrorToast.show('配置已导入（有警告）', 'warning');
                }
                console.warn(message);
            } else {
                if (typeof ErrorToast !== 'undefined') {
                    ErrorToast.show('配置已导入', 'success');
                }
            }
        } catch (error) {
            if (typeof ErrorToast !== 'undefined') {
                ErrorToast.show('导入失败：' + error.message, 'error');
            } else {
                console.error('导入失败:', error);
            }
        }
        
        // 清空 file input
        event.target.value = '';
    }
    
    /**
     * 重置筛选配置
     */
    resetConfig() {
        // 确认提示
        const confirmed = confirm('确定要重置筛选配置吗？所有条件将被清除。');
        if (!confirmed) return;
        
        // 重置配置
        this.filterConfig = this.configManager.reset();
        
        // 清空规则卡片数组
        this.ruleCards = [];
        
        // 重新渲染
        this.refresh();
        
        // 通知配置变更
        this.notifyChange();
        
        // 确保筛选面板保持展开状态
        const filterSection = document.getElementById('filterSection');
        const filterContent = filterSection ? filterSection.querySelector('.filter-section-content') : null;
        const filterCollapseIcon = document.getElementById('filterCollapseIcon');
        
        if (filterSection && filterContent) {
            filterSection.style.display = 'block';
            filterContent.style.display = 'block';
            if (filterCollapseIcon) {
                filterCollapseIcon.textContent = '▼';
            }
        }
        
        if (typeof ErrorToast !== 'undefined') {
            ErrorToast.show('配置已重置', 'success');
        } else {
            console.log('配置已重置');
        }
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.FilterPanel = FilterPanel;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FilterPanel;
}
