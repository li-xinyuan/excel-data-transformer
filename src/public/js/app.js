        // ========== 调试日志（生产环境设为 false） ==========
        const APP_DEBUG = false;
        function log(...args) { if (APP_DEBUG) log('[app]', ...args); }
        function warn(...args) { if (APP_DEBUG) warn('[app]', ...args); }

        
        // ========== 带超时和重试的 fetch 封装 ==========
        const FETCH_TIMEOUT = 60000;
        const FETCH_MAX_RETRIES = 2;
        
        async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);
            try {
                const response = await fetch(url, { ...options, signal: controller.signal });
                clearTimeout(timer);
                return response;
            } catch (error) {
                clearTimeout(timer);
                if (error.name === 'AbortError') {
                    throw new Error('请求超时（' + (timeout / 1000) + '秒），服务器响应过慢');
                }
                throw error;
            }
        }
        
        async function fetchWithRetry(url, options = {}, maxRetries = FETCH_MAX_RETRIES) {
            let lastError;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    return await fetchWithTimeout(url, options);
                } catch (error) {
                    lastError = error;
                    const isNetworkError = error.message.includes('Failed to fetch') || 
                                          error.message.includes('NetworkError') ||
                                          error.name === 'TypeError';
                    const isTimeoutError = error.message.includes('请求超时');
                    
                    if (isNetworkError || isTimeoutError) {
                        if (attempt < maxRetries) {
                            warn('[fetch] 第' + (attempt + 1) + '次请求失败: ' + error.message + '，正在重试... (' + (attempt + 2) + '/' + (maxRetries + 1) + ')');
                            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                            continue;
                        }
                    }
                    throw error;
                }
            }
            throw lastError;
        }

// Session 管理
        let sessionId = null;
        let sourceFileAnalysis = null;
        
        // 从 Cookie 中获取 Session ID
        function getSessionIdFromCookie() {
            const cookies = document.cookie.split(';').reduce((acc, cookie) => {
                const [key, value] = cookie.trim().split('=');
                acc[key] = value;
                return acc;
            }, {});
            return cookies['sessionId'];
        }
        
        // 初始化 Session
        function initSession() {
            sessionId = getSessionIdFromCookie();
            if (sessionId) {
                log('恢复 Session:', sessionId);
            }
        }
        
        // ========== 配置变动追踪 ==========
        let configDirty = false;
        let savedConfigSnapshot = null;

        function snapshotCurrentConfig() {
            if (!previewData) return null;
            const finalMappings = [];
            (previewData.mappings || [])
                .filter(m => !removedMappings.some(r => r.targetIndex === m.targetIndex))
                .filter(m => !manualMappings.some(mm => mm.target === m.targetIndex))
                .forEach(m => {
                    finalMappings.push({
                        sourceIndex: m.sourceIndex,
                        targetIndex: m.targetIndex,
                        sourceField: m.sourceField || previewData.sourceHeaders[m.sourceIndex],
                        targetField: m.targetField || previewData.targetHeaders[m.targetIndex],
                    });
                });
            manualMappings.forEach(m => {
                finalMappings.push({
                    sourceIndex: m.source,
                    targetIndex: m.target,
                    sourceField: m.sourceField || previewData.sourceHeaders[m.source],
                    targetField: m.targetField || previewData.targetHeaders[m.target],
                });
            });
            const cleanedRules = {};
            Object.keys(valueTransformRules).forEach(key => {
                const rules = valueTransformRules[key];
                if (rules && rules.length > 0) cleanedRules[key] = rules;
            });
            return JSON.stringify({
                mappings: finalMappings.sort((a, b) => a.targetIndex - b.targetIndex || a.sourceIndex - b.sourceIndex),
                valueTransformRules: cleanedRules,
                defaultValues: { ...defaultValues },
                logicRules: { ...logicRules },
                filterConfig: window.filterConfig ? JSON.parse(JSON.stringify(window.filterConfig)) : null,
            });
        }

        function markConfigDirty() {
            const currentSnapshot = snapshotCurrentConfig();
            const isSameAsSaved = savedConfigSnapshot !== null && currentSnapshot === savedConfigSnapshot;
            const shouldBeDirty = !isSameAsSaved;
            if (configDirty !== shouldBeDirty) {
                configDirty = shouldBeDirty;
                updateSaveButtonState();
                log('[config]', shouldBeDirty ? '标记为未保存' : '自动恢复为已保存（与上次保存一致）');
            }
        }

        function markConfigSaved() {
            savedConfigSnapshot = snapshotCurrentConfig();
            if (configDirty) {
                configDirty = false;
                updateSaveButtonState();
                log('[config] 标记为已保存，已记录快照');
            }
        }

        function updateSaveButtonState() {
            const mainBtn = document.getElementById('saveConfigBtn');
            const previewFilterBtn = document.querySelector('#dataPreviewModalNew .filter-save-btn, #previewFilterPanel button[onclick*="saveFilterToConfig"]');
            
            [mainBtn, previewFilterBtn].forEach(btn => {
                if (!btn) return;
                if (configDirty) {
                    btn.classList.add('config-dirty');
                    btn.classList.remove('config-clean');
                } else {
                    btn.classList.remove('config-dirty');
                    btn.classList.add('config-clean');
                }
            });
        }

        // ========== 数据预览功能 ==========
        let currentPreviewData = null;
        let currentPreviewTab = 'source';
        let currentActiveMappings = [];
        let previewValueTransformRules = {}; // 存储预览数据的值转换规则
        let currentRowIndex = 0; // 当前显示的行号（源数据和目标数据和目标数据共用，从 0 开始）
        let problemRows = []; // 存储有必填字段缺失的行号列表
        let showOnlyFilteredRows = false; // 是否只显示筛选后的行
        
        // ========== 数据筛选功能 ==========
        window.filterPanel = null; // 筛选面板实例（全局变量）
        let sourceFields = []; // 源字段列表
        
        // ========== Day 7: 常量定义 ==========
        const DAY7_CONSTANTS = {
            // 缓存配置
            FIELD_CACHE_TTL: 5 * 60 * 1000, // 字段列表缓存 TTL：5 分钟
            
            // Toast 配置
            TOAST_DURATION: {
                success: 2000,
                error: 5000,
                warning: 4000
            },
            
            // 加载提示
            LOADING_MESSAGES: {
                loadingFields: '正在加载字段列表...',
                initializingPanel: '正在初始化筛选面板...',
                loadingPreview: '正在加载预览...'
            },
            
            // 错误类型
            ERROR_TYPES: {
                NETWORK: 'Failed to fetch',
                TIMEOUT: 'timeout',
                HTTP_400: 'HTTP 400',
                HTTP_404: 'HTTP 404',
                HTTP_500: 'HTTP 500',
                HTTP_503: 'HTTP 503'
            }
        };
        
        // 字段列表缓存（5 分钟 TTL）
        const fieldCache = {
            data: null,
            timestamp: 0,
            ttl: DAY7_CONSTANTS.FIELD_CACHE_TTL,
            
            get() {
                if (this.data && Date.now() - this.timestamp < this.ttl) {
                    return this.data;
                }
                return null;
            },
            
            set(data) {
                this.data = data;
                this.timestamp = Date.now();
            },
            
            clear() {
                this.data = null;
                this.timestamp = 0;
            }
        };
        
        // 计算有必填字段缺失的行
        function calculateProblemRows(previewData, mappings) {
            const problems = [];
            const targetHeaders = previewData.target.headers;
            let targetRows = previewData.target.rows;
            
            // 如果勾选了"只显示筛选后的数据"，过滤掉被过滤的行
            const filterInfo = previewData.filterInfo || {};
            if (showOnlyFilteredRows && filterInfo.isFiltered) {
                targetRows = targetRows.filter(row => !row._isFiltered);
            }
            
            // 找出所有必填字段的索引
            const requiredFieldIndices = [];
            targetHeaders.forEach((h, i) => {
                if (h.endsWith('*')) {
                    requiredFieldIndices.push(i);
                }
            });
            
            // 如果没有必填字段，返回空数组
            if (requiredFieldIndices.length === 0) {
                return problems;
            }
            
            // 遍历每一行，检查必填字段是否有值
            targetRows.forEach((row, rowIdx) => {
                let hasProblem = false;
                for (const idx of requiredFieldIndices) {
                    const header = targetHeaders[idx];
                    const value = row[header];
                    if (value === '' || value === null || value === undefined) {
                        hasProblem = true;
                        break;
                    }
                }
                if (hasProblem) {
                    problems.push(rowIdx);
                }
            });
            
            return problems;
        }
        
        // 跳转到上一个/下一个问题行
        function gotoProblemRow(direction) {
            if (problemRows.length === 0) return;

            let targetIdx = -1;

            if (direction === 'prev') {
                for (let i = problemRows.length - 1; i >= 0; i--) {
                    if (problemRows[i] < currentRowIndex) {
                        targetIdx = problemRows[i];
                        break;
                    }
                }
            } else {
                for (let i = 0; i < problemRows.length; i++) {
                    if (problemRows[i] > currentRowIndex) {
                        targetIdx = problemRows[i];
                        break;
                    }
                }
            }

            if (targetIdx !== -1) {
                currentRowIndex = targetIdx;

                const previewContent = document.getElementById('previewContent');
                if (previewContent) {
                    previewContent.innerHTML = renderComparisonView();
                }
                updatePreviewRowDisplay();
            }
        }
        
        // 显示数据预览
        async function showDataPreview() {
            if (!previewData || !sourceFile || !targetFile) {
                showError('请先上传文件并建立映射关系');
                return;
            }
            
            const previewBtn = document.getElementById('previewBtn');
            if (previewBtn) previewBtn.disabled = true;
            previewBtn.textContent = '⏳ 加载中...';
            
            try {
                // 调用预览接口
                const transformRules = getValueTransformRules();
                log('[Preview] 准备发送的转换规则:', JSON.stringify(transformRules, null, 2));
                log('[Preview] 手动映射:', manualMappings);
                log('[Preview] 移除的映射:', removedMappings);
                
                const response = await fetchWithRetry('/api/preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mappings: previewData.mappings,
                        manualMappings: manualMappings,
                        removedMappings: removedMappings,
                        valueTransformRules: transformRules,
                        previewRows: 10,
                        filterConfig: window.filterConfig || null // 添加筛选配置
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    currentPreviewData = result.previewData;
                    // 保存筛选信息
                    currentPreviewData.filterInfo = result.previewData.filterInfo || {};
                    // 使用后端返回的实际映射关系
                    currentActiveMappings = result.activeMappings || [];
                    // 保存值转换规则
                    previewValueTransformRules = result.valueTransformRules || {};
                    // 重置行号为第 1 行
                    currentRowIndex = 0;
                    // 计算有必填字段缺失的行（基于筛选后的数据）
                    problemRows = calculateProblemRows(result.previewData, result.activeMappings);
                    
                    // 使用统一的统计信息更新函数
                    updatePreviewStats(result);
                    
                    // 渲染预览内容
                    const previewContentEl = document.getElementById('previewContent');
                    if (previewContentEl) {
                        previewContentEl.innerHTML = renderComparisonView();
                    }
                    
                    // 重置筛选面板状态（收起侧边栏）
                    previewFilterExpanded = false;
                    const sidebar = document.getElementById('previewFilterSidebar');
                    const trigger = document.getElementById('previewFilterTrigger');
                    const divider = document.getElementById('previewDivider');
                    if (sidebar) sidebar.style.display = 'none';
                    if (divider) divider.style.display = 'none';
                    if (trigger) {
                        updateFilterTriggerBadge();
                    }
                    
                    // 清空预览筛选容器（首次展开时再初始化）
                    const previewFilterContainer = document.getElementById('previewFilterPanelContainer');
                    if (previewFilterContainer) {
                        previewFilterContainer.innerHTML = '';
                    }
                    window.previewFilterPanel = null;
                    
                    // 打开弹窗
                    document.getElementById('dataPreviewModalNew').style.display = 'flex';
                    
                    // 渲染完成后，从行号输入框同步顶部统计栏的"预览行数"
                    setTimeout(() => {
                        const rowInput = document.getElementById('rowIndex');
                        const previewRowEl = document.getElementById('previewRowNumber');
                        if (rowInput && previewRowEl) {
                            const inputVal = rowInput.value;
                            if (inputVal) {
                                const totalRows = currentPreviewData?.filterInfo?.totalRows 
                                    || currentPreviewData?.source?.rows?.length || '?';
                                previewRowEl.textContent = `${inputVal} / ${totalRows}`;
                            }
                        }
                    }, 0);
                    
                    // 诊断日志：测量模态框各层实际尺寸
                    setTimeout(() => {
                        const modal = document.getElementById('dataPreviewModalNew');
                        const content = document.getElementById('previewModalContent');
                        const header = document.getElementById('previewModalHeader');
                        const body = document.getElementById('previewModalBody');
                        const footer = content?.querySelector('.preview-modal-footer');
                        const buttons = footer?.querySelectorAll('button');
                        
                        console.group('📐 模态框尺寸诊断 v2');
                        log('viewport:', { w: window.innerWidth, h: window.innerHeight });
                        if (modal) {
                            const mr = modal.getBoundingClientRect();
                            log('.modal (外罩):', { w: mr.width.toFixed(0), h: mr.height.toFixed(0), 
                                computedOverflow: getComputedStyle(modal).overflow,
                                computedPadding: getComputedStyle(modal).padding });
                        }
                        if (content) {
                            const cr = content.getBoundingClientRect();
                            log('#previewModalContent:', { w: cr.width.toFixed(0), h: cr.height.toFixed(0),
                                top: cr.top.toFixed(0), bottom: cr.bottom.toFixed(0),
                                computedMaxH: getComputedStyle(content).maxHeight,
                                computedHeight: getComputedStyle(content).height,
                                computedMinH: getComputedStyle(content).minHeight });
                        }
                        if (header) {
                            const hr = header.getBoundingClientRect();
                            log('.header:', { h: hr.height.toFixed(0), top: hr.top.toFixed(0) });
                        }
                        if (body) {
                            const br = body.getBoundingClientRect();
                            log('.body:', { h: br.height.toFixed(0), top: br.top.toFixed(0), bottom: br.bottom.toFixed(0) });
                        }
                        if (footer) {
                            const fr = footer.getBoundingClientRect();
                            log('.footer:', { 
                                h: fr.height.toFixed(0), top: fr.top.toFixed(0), bottom: fr.bottom.toFixed(0),
                                overflow: getComputedStyle(footer).overflow,
                                inViewport: fr.bottom <= window.innerHeight ? '✅' : '❌ 差' + (fr.bottom - window.innerHeight).toFixed(0) + 'px'
                            });
                            const cr = content?.getBoundingClientRect();
                            if (cr) {
                                log('  footer vs content bottom:', fr.bottom.toFixed(0) + ' vs ' + cr.bottom.toFixed(0),
                                    fr.bottom > cr.bottom ? '❌ 溢出 ' + (fr.bottom - cr.bottom).toFixed(0) + 'px' : '✅');
                            }
                        }
                        if (buttons && buttons.length > 0) {
                            buttons.forEach((btn, i) => {
                                const br = btn.getBoundingClientRect();
                                const cs = getComputedStyle(btn);
                                log(`  button[${i}] "${btn.textContent.trim()}":`, {
                                    w: br.width.toFixed(0), h: br.height.toFixed(0),
                                    top: br.top.toFixed(0), bottom: br.bottom.toFixed(0),
                                    lineHeight: cs.lineHeight, fontSize: cs.fontSize,
                                    padding: cs.padding, overflow: cs.overflow,
                                    visible: br.bottom <= window.innerHeight ? '✅' : '❌ 差' + (br.bottom - window.innerHeight).toFixed(0) + 'px'
                                });
                            });
                        }
                        console.groupEnd();
                    }, 500);
                } else {
                    showError('预览失败：' + (result.error || '未知错误'));
                }
            } catch (error) {
                console.error('预览失败:', error);
                let errorMsg = '未知错误';
                if (typeof error === 'object') {
                    errorMsg = error.message || error.error || JSON.stringify(error);
                } else if (typeof error === 'string') {
                    errorMsg = error;
                }
                
                // 针对网络错误提供更友好的提示
                if (errorMsg.includes('Failed to fetch') || 
                    errorMsg.includes('NetworkError') ||
                    errorMsg.includes('TypeError')) {
                    errorMsg = '网络连接失败，可能原因：\n' +
                              '• 长时间未操作导致连接断开\n' +
                              '• 服务器未启动或已停止\n' +
                              '\n建议：刷新页面后重试';
                } else if (errorMsg.includes('请求超时')) {
                    errorMsg = '请求超时，服务器响应过慢，请稍后重试';
                }
                
                showError('预览失败：' + errorMsg);
            } finally {
                if (previewBtn) {
                    previewBtn.disabled = false;
                    previewBtn.textContent = '👀 预览转换结果';
                }
            }
        }
        
        // 关闭数据预览
        function closeDataPreview() {
            document.getElementById('dataPreviewModalNew').style.display = 'none';
            currentPreviewData = null;
        }
        
        // ========== 预览弹窗内嵌筛选面板 ==========
        
        let previewFilterExpanded = false; // 筛选面板是否展开
        
        // 更新筛选触发按钮的状态（高亮 + 条数角标）
        function updateFilterTriggerBadge() {
            const trigger = document.getElementById('previewFilterTrigger');
            const badge = document.getElementById('previewFilterBadge');
            if (!trigger || !badge) return;
            
            const fc = window.filterConfig;
            const ruleCount = (fc && fc.rules && Array.isArray(fc.rules)) ? fc.rules.length : 0;
            
            if (ruleCount > 0) {
                trigger.classList.add('active');
                badge.textContent = ruleCount > 99 ? '99+' : String(ruleCount);
                badge.style.display = 'inline-block';
                trigger.title = `已配置 ${ruleCount} 条筛选条件，点击查看/编辑`;
            } else {
                trigger.classList.remove('active');
                badge.style.display = 'none';
                trigger.title = '展开/收起数据筛选面板';
            }
        }
        
        // ========== 预览弹窗筛选面板：展开/收起 ==========
        
        async function togglePreviewFilterPanel() {
            const trigger = document.getElementById('previewFilterTrigger');
            const sidebar = document.getElementById('previewFilterSidebar');
            const divider = document.getElementById('previewDivider');
            
            if (!trigger || !sidebar) return;
            
            previewFilterExpanded = !previewFilterExpanded;
            
            if (previewFilterExpanded) {
                // 展开：显示侧边栏 + 分隔线，竖向按钮激活
                sidebar.style.display = 'flex';
                sidebar.style.flexDirection = 'column';
                divider.style.display = 'block';
                trigger.classList.add('active');
                
                // 动态计算侧边栏高度（= 主体区域可用高度）
                const modalBody = document.getElementById('previewModalBody');
                if (modalBody) {
                    const bodyRect = modalBody.getBoundingClientRect();
                    sidebar.style.height = bodyRect.height + 'px';
                }
                
                // 首次展开时初始化筛选面板
                const container = document.getElementById('previewFilterPanelContainer');
                if (container && container.children.length === 0) {
                    await initPreviewFilterPanel();
                }
                
                // 展开后 DOM 布局变化，延迟重绘连线（等浏览器完成 reflow）
                setTimeout(() => {
                    if (currentActiveMappings && currentActiveMappings.length > 0) {
                        drawComparisonConnections(currentActiveMappings);
                    }
                }, 300);
                
            } else {
                // 收起：隐藏侧边栏和分隔线，恢复默认状态
                sidebar.style.display = 'none';
                divider.style.display = 'none';
                trigger.classList.remove('active');
                
                // 收起后同样需要重绘连线
                setTimeout(() => {
                    if (currentActiveMappings && currentActiveMappings.length > 0) {
                        drawComparisonConnections(currentActiveMappings);
                    }
                }, 300);
            }
        }
        
        // ========== 分隔线拖拽调整宽度 ==========
        
        let isDraggingDivider = false;
        let dragStartX = 0;
        let dragStartWidth = 0;
        let dragHintEl = null;
        
        function startDividerDrag(e) {
            e.preventDefault();
            const sidebar = document.getElementById('previewFilterSidebar');
            if (!sidebar || sidebar.style.display === 'none') return;
            
            isDraggingDivider = true;
            dragStartX = e.clientX;
            dragStartWidth = sidebar.getBoundingClientRect().width;
            
            const divider = document.getElementById('previewDivider');
            if (divider) divider.classList.add('dragging');
            
            // 创建全局遮罩（防止文字选中/其他事件干扰）
            dragHintEl = document.createElement('div');
            dragHintEl.className = 'divider-drag-hint';
            document.body.appendChild(dragHintEl);
            
            document.addEventListener('mousemove', handleDividerDrag);
            document.addEventListener('mouseup', endDividerDrag);
        }
        
        function handleDividerDrag(e) {
            if (!isDraggingDivider) return;
            
            const delta = e.clientX - dragStartX;
            let newWidth = dragStartWidth + delta;
            
            // 限制范围: 320px ~ 550px
            newWidth = Math.max(320, Math.min(550, newWidth));
            
            const sidebar = document.getElementById('previewFilterSidebar');
            if (sidebar) {
                sidebar.style.width = newWidth + 'px';
            }
        }
        
        function endDividerDrag(e) {
            if (!isDraggingDivider) return;
            isDraggingDivider = false;
            
            const divider = document.getElementById('previewDivider');
            if (divider) divider.classList.remove('dragging');
            
            if (dragHintEl && dragHintEl.parentNode) {
                dragHintEl.parentNode.removeChild(dragHintEl);
            }
            dragHintEl = null;
            
            document.removeEventListener('mousemove', handleDividerDrag);
            document.removeEventListener('mouseup', endDividerDrag);
            
            // 拖动结束后重绘连线（宽度已变化）
            setTimeout(() => {
                if (currentActiveMappings && currentActiveMappings.length > 0) {
                    drawComparisonConnections(currentActiveMappings);
                }
            }, 100);
        }
        
        // ========== 初始化筛选面板（在预览弹窗内） ==========
        
        async function initPreviewFilterPanel() {
            const container = document.getElementById('previewFilterPanelContainer');
            if (!container) return;
            
            container.innerHTML = '<div style="text-align: center; padding: 30px; color: #999;">⏳ 正在加载字段列表...</div>';
            
            try {
                if (!window.filterConfig) {
                    window.filterConfig = { enabled: false, combinationMode: 'AND', rules: [] };
                }
                
                let fields = sourceFields;
                if (!fields || fields.length === 0) {
                    const loaded = await loadSourceFields();
                    if (!loaded || !sourceFields || sourceFields.length === 0) {
                        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #e74c3c;">⚠️ 无法加载源字段列表</div>';
                        return;
                    }
                    fields = sourceFields;
                }
                
                window.previewFilterPanel = new FilterPanel({
                    fields: fields,
                    filterConfig: window.filterConfig,
                    containerId: 'previewFilterPanelContainer',
                    operators: window.FILTER_OPERATORS || [],
                    hidePreviewPanel: true,
                    onConfigChange: async (config) => {
                        window.filterConfig = config;
                        log('[预览筛选] 配置已更新:', config);
                        updateFilterTriggerBadge();
                        markConfigDirty();
                        await refreshPreviewWithFilter();
                    }
                });
                
                container.innerHTML = '';
                container.appendChild(window.previewFilterPanel.render());
                log('[预览] 筛选面板已初始化');
                
            } catch (error) {
                console.error('[预览] 筛选面板初始化失败:', error);
                container.innerHTML = `<div style="text-align: center; padding: 20px; color: #e74c3c;">❌ 初始化失败: ${error.message}</div>`;
            }
        }
        
        // ========== 实时联动：筛选变更后刷新预览 ==========
        
        let previewRefreshTimer = null;
        async function refreshPreviewWithFilter() {
            if (previewRefreshTimer) clearTimeout(previewRefreshTimer);
            
            const statsEl = document.getElementById('previewStatistics');
            if (statsEl) statsEl.innerHTML = '<span style="color: #409eff;">⏳ 正在应用筛选条件...</span>';
            
            previewRefreshTimer = setTimeout(async () => {
                try {
                    if (!currentPreviewData) return;
                    
                    const transformRules = getValueTransformRules();
                    const response = await fetchWithRetry('/api/preview', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            mappings: previewData.mappings,
                            manualMappings: manualMappings,
                            removedMappings: removedMappings,
                            valueTransformRules: transformRules,
                            previewRows: 10,
                            filterConfig: window.filterConfig || null
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        currentPreviewData = result.previewData;
                        currentPreviewData.filterInfo = result.previewData.filterInfo || {};
                        currentActiveMappings = result.activeMappings || [];
                        previewValueTransformRules = result.valueTransformRules || {};
                        
                        currentRowIndex = 0;
                        problemRows = calculateProblemRows(result.previewData, result.activeMappings);
                        
                        updatePreviewStats(result);
                        
                        const previewContentEl = document.getElementById('previewContent');
                        if (previewContentEl) previewContentEl.innerHTML = renderComparisonView();
                        
                        log('[预览] 已根据筛选条件刷新数据');
                    }
                } catch (error) {
                    console.error('[预览] 刷新失败:', error);
                    if (statsEl) statsEl.innerHTML = '<span style="color: #e74c3c;">❌ 刷新失败，请重试</span>';
                }
            }, 500);
        }
        
        function updatePreviewStats(result) {
            const statsEl = document.getElementById('previewStatistics');
            if (!statsEl) return;
            
            const filterInfo = result.previewData?.filterInfo || {};
            const isFiltered = filterInfo.isFiltered;
            const hasFilteredData = filterInfo.hasFilteredData;
            const totalRows = filterInfo.totalRows || result.statistics?.totalRows || 0;
            const filteredRows = filterInfo.filteredRows || result.statistics?.filteredRows || totalRows;
            const displayRows = isFiltered ? filteredRows : totalRows;
            
            if (isFiltered && !showOnlyFilteredRows) showOnlyFilteredRows = true;
            
            const currentRow = currentPreviewData?.source?.rows?.[currentRowIndex];
            const actualRowIndex = currentRow?._originalIndex !== undefined ? currentRow._originalIndex : currentRowIndex;
            
            log('[updatePreviewStats] 行号诊断', {
                currentRowIndex,
                actualRowIndex,
                currentRow: currentRow ? { _originalIndex: currentRow._originalIndex, _isFiltered: currentRow._isFiltered } : null,
                sourceRowsLength: currentPreviewData?.source?.rows?.length,
                totalRows, filteredRows, displayRows, isFiltered
            });
            
            statsEl.innerHTML = `
                <div class="preview-stat-item" style="display: inline-block; margin-right: 15px;">
                    ${isFiltered ? '筛选后行数' : '总行数'}：<strong>${displayRows.toLocaleString()}</strong>
                    ${isFiltered ? `<span style="color: #999; font-size: 12px; margin-left: 4px;">(原始 ${totalRows.toLocaleString()} 行)</span>` : ''}
                </div>
                ${hasFilteredData ? `
                <div class="preview-stat-item" style="display: inline-flex; align-items: center; margin-right: 15px;">
                    <label style="display: inline-flex; align-items: center; cursor: pointer; font-size: 13px;">
                        <input type="checkbox" id="showOnlyFiltered" style="margin-right: 5px;" ${showOnlyFilteredRows ? 'checked' : ''} onchange="toggleFilteredView()">
                        只显示筛选后的数据
                    </label>
                </div>
                ` : ''}
                <div class="preview-stat-item" style="display: inline-block; margin-right: 15px;">
                    预览行数：<strong id="previewRowNumber">${actualRowIndex + 1} / ${totalRows}</strong>
                </div>
                <div class="preview-stat-item" style="display: inline-block; margin-right: 15px;">
                    已映射字段：<strong>${result.statistics?.mappedFields || 0}</strong>
                </div>
                ${problemRows.length > 0 ? `<div class="preview-stat-item" style="display: inline-block; color: #e74c3c;">必填缺失行：<strong>${problemRows.length}</strong></div>` : ''}
            `;
        }
        
        // ========== 筛选条件校验 + 保存到配置 ==========
        
        function validateFilterConfig(config) {
            if (!config || !config.enabled) return { valid: true, errors: [] };
            
            const errors = [];
            const rules = config.rules || [];
            const fields = sourceFields || [];
            
            if (rules.length === 0) {
                return { valid: true, errors: [] }; // 没有规则不算错误
            }
            
            rules.forEach((rule, idx) => {
                const ruleNum = idx + 1;
                
                // 检查字段是否选择
                if (rule.fieldIndex === null || rule.fieldIndex === undefined || rule.fieldIndex === '') {
                    errors.push(`条件${ruleNum}：未选择筛选字段`);
                    return;
                }
                
                // 检查操作符是否选择
                if (!rule.operator) {
                    errors.push(`条件${ruleNum}（${fields[rule.fieldIndex]?.name || '未知字段'}）：未选择操作符`);
                    return;
                }
                
                // 根据操作符检查值
                const needsValue = !['IS_NULL', 'IS_NOT_NULL'].includes(rule.operator);
                
                if (needsValue) {
                    const hasValue = rule.value !== undefined && rule.value !== null && String(rule.value).trim() !== '';
                    
                    if (!hasValue) {
                        const fieldName = fields[rule.fieldIndex]?.name || '未知字段';
                        errors.push(`条件${ruleNum}（${fieldName} ${getOperatorLabel(rule.operator)}）：未填写筛选值`);
                        return;
                    }
                    
                    // BETWEEN 需要两个值
                    if (rule.operator === 'BETWEEN') {
                        const vals = Array.isArray(rule.value) ? rule.value : String(rule.value).split(',').map(v => v.trim());
                        if (vals.length < 2 || (!vals[0] && vals[0] !== 0) || (!vals[1] && vals[1] !== 0)) {
                            const fieldName = fields[rule.fieldIndex]?.name || '未知字段';
                            errors.push(`条件${ruleNum}（${fieldName} 在...之间）：需要填写两个值，用逗号分隔`);
                            return;
                        }
                    }
                    
                    // IN / NOT_IN 至少一个值
                    if ((rule.operator === 'IN' || rule.operator === 'NOT_IN')) {
                        const valStr = Array.isArray(rule.value) ? rule.value.join(',') : String(rule.value);
                        const vals = valStr.split(/[,，\uFF0C]/).map(v => v.trim()).filter(v => v);
                        if (vals.length === 0) {
                            const fieldName = fields[rule.fieldIndex]?.name || '未知字段';
                            errors.push(`条件${ruleNum}（${fieldName} 在...之中）：需要至少一个值`);
                            return;
                        }
                    }
                }
            });
            
            return { valid: errors.length === 0, errors };
        }
        
        function getOperatorLabel(operator) {
            const labels = {
                'EQUAL': '=', 'NOT_EQUAL': '≠', 'GREATER_THAN': '>', 'LESS_THAN': '<',
                'GREATER_THAN_OR_EQUAL': '≥', 'LESS_THAN_OR_EQUAL': '≤',
                'CONTAINS': '包含', 'NOT_CONTAINS': '不包含',
                'STARTS_WITH': '开头是', 'ENDS_WITH': '结尾是',
                'IN': '在...之中', 'NOT_IN': '不在...之中',
                'BETWEEN': '在...之间',
                'IS_NULL': '为空', 'IS_NOT_NULL': '不为空'
            };
            return labels[operator] || operator;
        }
        
        async function saveFilterToConfig() {
            const config = window.filterConfig;
            if (!config) {
                alert('没有可保存的筛选配置');
                return;
            }
            
            // 校验筛选条件
            const validation = validateFilterConfig(config);
            if (!validation.valid) {
                alert('筛选条件不完整，请检查：\n\n' + validation.errors.join('\n'));
                return;
            }
            
            // 如果没有任何规则且未启用，提示用户
            if (!config.enabled || (config.rules && config.rules.length === 0)) {
                alert('当前没有配置任何筛选条件。\n\n请先添加筛选条件后再保存。');
                return;
            }
            
            // 检查是否有已加载的配置
            if (!currentLoadedConfig) {
                alert('请先在主界面保存映射配置，然后再保存筛选条件。');
                return;
            }
            
            // 将筛选条件合并到当前配置中
            currentLoadedConfig.filterConfig = { ...config };
            window.filterConfig = currentLoadedConfig.filterConfig;
            
            try {
                // 通过 localStorage 保存（与主界面保存逻辑一致）
                const allConfigs = getConfigs();
                const idx = allConfigs.findIndex(c => c.name === currentLoadedConfig.name);
                if (idx >= 0) {
                    allConfigs[idx] = { ...currentLoadedConfig };
                } else {
                    allConfigs.push({ ...currentLoadedConfig });
                }
                saveConfigs(allConfigs);
                
                alert('✅ 筛选条件已成功保存到配置！\n\n配置名称：' + (currentLoadedConfig.name || '(未命名)'));
                updateFilterTriggerBadge();
                markConfigSaved();
            } catch (error) {
                console.error('[筛选] 保存配置失败:', error);
                alert('❌ 保存失败：' + error.message);
            }
        }
        
        // 切换是否只显示筛选后的数据
        function toggleFilteredView() {
            const checkbox = document.getElementById('showOnlyFiltered');
            if (checkbox) {
                showOnlyFilteredRows = checkbox.checked;
                currentRowIndex = 0;
                problemRows = calculateProblemRows(currentPreviewData, currentActiveMappings);
                const previewContent = document.getElementById('previewContent');
                if (previewContent && currentPreviewData) {
                    previewContent.innerHTML = renderComparisonView();
                }
                updatePreviewStatistics();
                updatePreviewRowDisplay();
            }
        }
        
        // 更新统计信息显示
        function updatePreviewStatistics() {
            const statsEl = document.getElementById('previewStatistics');
            if (statsEl && currentPreviewData) {
                const filterInfo = currentPreviewData.filterInfo || {};
                const totalRows = filterInfo.totalRows || currentPreviewData.source.rows.length;
                const filteredRows = filterInfo.filteredRows || totalRows;
                const isFiltered = filterInfo.isFiltered;

                const displayRows = showOnlyFilteredRows && isFiltered ? filteredRows : totalRows;

                const rowIndexInput = document.getElementById('rowIndex');
                if (rowIndexInput) {
                    rowIndexInput.max = displayRows;
                }

                statsEl.innerHTML = `
                    <div class="preview-stat-item">
                        ${showOnlyFilteredRows && isFiltered ? '筛选后行数' : '总行数'}：<strong>${displayRows}</strong>
                        ${showOnlyFilteredRows && isFiltered ? `<span style="color: #666; font-size: 12px; margin-left: 5px;">(原始：${totalRows}行)</span>` : ''}
                    </div>
                    ${filterInfo.hasFilteredData ? `
                    <div class="preview-stat-item" style="margin-left: 10px;">
                        <label style="display: inline-flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" id="showOnlyFiltered" style="margin-right: 5px;" ${showOnlyFilteredRows ? 'checked' : ''} onchange="toggleFilteredView()">
                            只显示筛选后的数据
                        </label>
                    </div>
                    ` : ''}
                    <div class="preview-stat-item">预览行数：<strong id="previewRowNumber"></strong></div>
                    <div class="preview-stat-item">已映射字段：<strong>${currentActiveMappings.length}</strong></div>
                    ${problemRows.length > 0 ? `<div class="preview-stat-item" style="color: #e74c3c;">必填缺失行：<strong>${problemRows.length}</strong></div>` : ''}
                `;
            }
        }
        
        // 切换预览标签页
        function switchPreviewTab(tab) {
            currentPreviewTab = tab;
            
            // 更新标签样式
            document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
            
            // 渲染内容
            renderPreviewContent(tab);
        }
        
        // 监听窗口 resize，重新绘制连线
        window.addEventListener('resize', () => {
            if (currentPreviewTab === 'comparison' && currentPreviewData) {
                // 使用后端返回的实际映射关系
                setTimeout(() => drawComparisonConnections(currentActiveMappings), 100);
            }
        });
        
        // 渲染预览内容
        function renderPreviewContent(tab) {
            const container = document.getElementById('previewContent');
            if (!container || !currentPreviewData) return;
            
            let html = '';
            
            if (tab === 'source') {
                html = renderPreviewTable(
                    currentPreviewData.source.headers,
                    currentPreviewData.source.rows,
                    'source'
                );
            } else if (tab === 'target') {
                html = renderPreviewTable(
                    currentPreviewData.target.headers,
                    currentPreviewData.target.rows,
                    'target'
                );
            } else if (tab === 'comparison') {
                html = renderComparisonView();
            }
            
            container.innerHTML = html;
        }
        
        // 渲染预览表格
        function renderPreviewTable(headers, rows, type) {
            if (!headers || !rows || rows.length === 0) {
                return '<p style="text-align: center; color: #999; padding: 40px;">暂无数据</p>';
            }
            
            let html = `<table class="preview-table">
                <thead>
                    <tr>
                        <th style="width: 50px;">#</th>
                        ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((row, idx) => `
                        <tr>
                            <td style="color: #999; text-align: center;">${idx + 1}</td>
                            ${headers.map(h => `<td>${escapeHtml(row[h] !== undefined ? row[h] : '')}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
            
            return html;
        }
        
        // 渲染对比视图
        function renderComparisonView() {
            if (!currentPreviewData) return '';
            
            const sourceHeaders = currentPreviewData.source.headers;
            const targetHeaders = currentPreviewData.target.headers;
            let sourceRows = currentPreviewData.source.rows;
            let targetRows = currentPreviewData.target.rows;
            
            // 如果勾选了"只显示筛选后的数据"，过滤掉被过滤的行
            const filterInfo = currentPreviewData.filterInfo || {};
            if (showOnlyFilteredRows && filterInfo.isFiltered) {
                sourceRows = sourceRows.filter(row => !row._isFiltered);
                targetRows = targetRows.filter(row => !row._isFiltered);
            }
            
            // 使用后端返回的实际映射关系
            const activeMappings = currentActiveMappings;
            
            // 确保行号在有效范围内
            if (currentRowIndex >= sourceRows.length) {
                currentRowIndex = Math.max(0, sourceRows.length - 1);
            }
            const currentRow = sourceRows[currentRowIndex] || {};
            const currentTargetRow = targetRows[currentRowIndex] || {};
            
            // 获取实际行号（源数据中的行号）
            const actualRowIndex = currentRow._originalIndex !== undefined ? currentRow._originalIndex : currentRowIndex;
            
            // 计算显示的总行数（用于行号输入框的 max）
            const displayTotalRows = sourceRows.length;
            const originalTotalRows = filterInfo.totalRows || currentPreviewData.source.rows.length;
            
            let html = `<div class="comparison-container" id="comparisonContainer" style="position: relative;">
                <div id="comparisonScrollArea" style="overflow-x: auto; position: relative;">
                <div style="display: flex; flex-direction: column; gap: 15px; min-width: max-content;" id="comparisonContentInner">
                
                <!-- 源数据表格（上） -->
                <div class="comparison-panel" style="display: flex; align-items: flex-start; gap: 10px;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                        <div class="row-nav-label">📥 源数据</div>
                        <div class="row-nav-btns">
                            ${(() => {
                                const canGoUp = currentRowIndex > 0;
                                const canGoDown = currentRowIndex < sourceRows.length - 1;
                                const canGoProblemUp = problemRows.some(idx => idx < currentRowIndex);
                                const canGoProblemDown = problemRows.some(idx => idx > currentRowIndex);
                                return `
                            <div class="row-nav-row">
                                <button class="row-nav-btn${canGoUp ? '' : ' disabled'}" onclick="changeRow(-1)" title="上一行" ${canGoUp ? '' : 'disabled'}>▲</button>
                                <button class="row-nav-btn row-nav-btn--problem${canGoProblemUp ? '' : ' disabled'}" onclick="gotoProblemRow('prev')" title="上一个必填缺失行" ${canGoProblemUp ? '' : 'disabled'}>▲</button>
                            </div>
                            <input type="number" id="rowIndex" value="${actualRowIndex + 1}" min="1" max="${displayTotalRows}" onchange="gotoRow(this.value)" class="row-nav-input" />
                            <div class="row-nav-row">
                                <button class="row-nav-btn${canGoDown ? '' : ' disabled'}" onclick="changeRow(1)" title="下一行" ${canGoDown ? '' : 'disabled'}>▼</button>
                                <button class="row-nav-btn row-nav-btn--problem${canGoProblemDown ? '' : ' disabled'}" onclick="gotoProblemRow('next')" title="下一个必填缺失行" ${canGoProblemDown ? '' : 'disabled'}>▼</button>
                            </div>
                                `;
                            })()}
                        </div>
                        <div class="row-nav-total">/${originalTotalRows}</div>
                        <div class="row-nav-hint">红色箭头跳转必填缺失行</div>
                    </div>
                    <table class="preview-table" id="sourcePreviewTable">
                        <thead>
                            <tr>
                                ${sourceHeaders.map((h, i) => 
                                    `<th data-index="${i}" id="source-th-${i}" style="writing-mode: vertical-lr; min-width: 30px; max-width: 40px; padding: 8px 4px;">${escapeHtml(h)}</th>`
                                ).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="${currentRow._isFiltered ? 'text-decoration: line-through; color: #999; background-color: #f5f5f5;' : ''}">
                                ${sourceHeaders.map((h, i) =>
                                    `<td data-index="${i}" id="source-td-${i}" style="writing-mode: vertical-lr; min-width: 30px; max-width: 40px; padding: 8px 4px; ${currentRow._isFiltered ? 'text-decoration: line-through; color: #999;' : ''}">${escapeHtml(currentRow[h] !== undefined ? currentRow[h] : '')}</td>`
                                ).join('')}
                            </tr>
                        </tbody>
                    </table>
                </div>
                
                <!-- 连线箭头（上下分隔） -->
                <div class="comparison-arrow" style="text-align: center; padding: 5px 0;">↓</div>
                
                <!-- 目标数据表格（下） -->
                <div class="comparison-panel" style="display: flex; align-items: flex-start; gap: 10px;">
                    <div style="writing-mode: vertical-lr; font-weight: 600; color: #666; font-size: 14px; padding: 10px 5px;">📤 目标数据</div>
                    <table class="preview-table" id="targetPreviewTable">
                        <thead>
                            <tr>
                                ${targetHeaders.map((h, i) => {
                                    const isRequired = h.endsWith('*');
                                    const mapping = currentActiveMappings.find(m => m.targetIndex === i);
                                    const displayValue = currentTargetRow[h] !== undefined ? currentTargetRow[h] : '';
                                    const isEmptyValue = displayValue === '' || displayValue === null || displayValue === undefined;
                                    const isRequiredAndEmpty = isRequired && isEmptyValue;
                                    const thStyle = isRequiredAndEmpty 
                                        ? 'writing-mode: vertical-lr; min-width: 30px; max-width: 40px; padding: 8px 4px; background-color: #ffcccc; border: 2px solid #e74c3c;'
                                        : 'writing-mode: vertical-lr; min-width: 30px; max-width: 40px; padding: 8px 4px;';
                                    return `<th data-index="${i}" id="target-th-${i}" style="${thStyle}" title="${isRequiredAndEmpty ? '必填字段值为空' : ''}">${escapeHtml(h)}</th>`;
                                }).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="${currentRow._isFiltered ? 'background-color: #f5f5f5;' : ''}">
                                ${targetHeaders.map((h, i) => {
                                    const mapping = currentActiveMappings.find(m => m.targetIndex === i);
                                    const rules = mapping ? previewValueTransformRules[`${mapping.sourceIndex}_${i}`] : null;
                                    const validRules = rules ? rules.filter(isValidTransformRule) : [];
                                    const hasTransformRules = validRules.length > 0;
                                    const displayValue = currentRow._isFiltered ? '' : (currentTargetRow[h] !== undefined ? currentTargetRow[h] : '');
                                    return `<td data-index="${i}" id="target-td-${i}" style="writing-mode: vertical-lr; min-width: 30px; max-width: 40px; padding: 8px 4px; ${currentRow._isFiltered ? 'color: #ccc;' : ''} ${hasTransformRules && !currentRow._isFiltered ? 'background-color: #fff3cd;' : ''}">${escapeHtml(displayValue)}</td>`;
                                }).join('')}
                            </tr>
                        </tbody>
                    </table>
                </div>
                </div>
                </div>

                <!-- SVG 连线层（绝对定位，覆盖整个 comparisonContainer） -->
                <svg class="connection-layer" id="comparisonConnectionLayer"
                     style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; display: block; overflow: visible;">
                </svg>
            </div>`;
            
            // 延迟绘制连线（等 DOM 渲染完成）
            setTimeout(() => drawComparisonConnections(activeMappings), 100);
            
            return html;
        }
        
        // 应用值转换规则
        function applyTransformRules(value, rules) {
            if (!rules || rules.length === 0 || value === undefined || value === null || value === '') {
                return value;
            }
            
            let result = value;
            rules.forEach(rule => {
                switch (rule.operation) {
                    case 'substring': {
                        const params = (rule.params || '0,5').split(',');
                        const start = parseInt(params[0]) || 0;
                        const length = parseInt(params[1]) || result.length;
                        result = String(result).substring(start, start + length);
                        break;
                    }
                    case 'replace': {
                        const params = (rule.params || '').split(',');
                        if (params.length >= 2) {
                            const search = params[0];
                            const replace = params[1];
                            result = String(result).split(search).join(replace);
                        }
                        break;
                    }
                    case 'trim':
                        result = String(result).trim();
                        break;
                    case 'uppercase':
                        result = String(result).toUpperCase();
                        break;
                    case 'lowercase':
                        result = String(result).toLowerCase();
                        break;
                    case 'round':
                        result = Math.round(parseFloat(result) || 0);
                        break;
                }
            });
            return result;
        }
        
        // 获取值转换规则
        function getValueTransformRules() {
            // 返回全局存储的值转换规则
            return valueTransformRules || {};
        }
        
        // 更新预览按钮状态
        function updatePreviewButton() {
            const previewBtn = document.getElementById('previewBtn');
            if (previewBtn) {
                previewBtn.disabled = !(sourceFile && targetFile && previewData);
            }
        }
        
        // 切换行号
        function changeRow(delta) {
            const sourceRows = currentPreviewData?.source?.rows || [];
            if (sourceRows.length === 0) return;

            const newIndex = currentRowIndex + delta;
            if (newIndex >= 0 && newIndex < sourceRows.length) {
                currentRowIndex = newIndex;
                const previewContent = document.getElementById('previewContent');
                if (previewContent) {
                    previewContent.innerHTML = renderComparisonView();
                }
                updatePreviewRowDisplay();
            }
        }
        
        // 智能定位：找到距离输入行号最近的满足筛选条件的行
        // 返回值：始终是 sourceRows（当前显示数组）的索引
        function findNearestValidRow(inputRowNum) {
            const allRows = currentPreviewData?.source?.rows || [];
            if (allRows.length === 0) return -1;

            const num = parseInt(inputRowNum);
            if (isNaN(num) || num < 1) return 0;

            const targetOriginalIndex = Math.min(num - 1, allRows.length - 1);

            const filterInfo = currentPreviewData?.filterInfo || {};
            const isFilterActive = showOnlyFilteredRows && filterInfo.isFiltered;

            if (!isFilterActive) {
                return targetOriginalIndex;
            }

            const validRows = [];
            for (let i = 0; i < allRows.length; i++) {
                if (!allRows[i]._isFiltered) {
                    validRows.push({ originalIndex: i, filteredIndex: validRows.length });
                }
            }

            if (validRows.length === 0) return -1;

            let found = null;
            for (const row of validRows) {
                if (row.originalIndex >= targetOriginalIndex) {
                    found = row;
                    break;
                }
            }

            if (!found) {
                found = validRows[validRows.length - 1];
            }

            log(`[findNearestValidRow] 输入:${num}, 目标原始索引:${targetOriginalIndex}, 找到→原始行${found.originalIndex + 1}(过滤后第${found.filteredIndex + 1}个)`);

            return found.filteredIndex;
        }

        // 跳转到指定行号
        function gotoRow(rowNum) {
            const sourceRows = currentPreviewData?.source?.rows || [];
            if (sourceRows.length === 0) return;

            const actualIndex = findNearestValidRow(rowNum);
            if (actualIndex === -1) {
                warn('[gotoRow] 无满足筛选条件的数据');
                return;
            }

            currentRowIndex = actualIndex;

            const previewContent = document.getElementById('previewContent');
            if (previewContent) {
                previewContent.innerHTML = renderComparisonView();
            }
            updatePreviewRowDisplay();
        }
        
        // 统一更新"预览行数"显示（行号选择器 + 顶部统计栏，始终一致）
        function updatePreviewRowDisplay() {
            const rowInput = document.getElementById('rowIndex');
            const previewRowEl = document.getElementById('previewRowNumber');
            if (!rowInput || !previewRowEl) return;
            
            const displayNum = rowInput.value || '1';
            const totalRows = currentPreviewData?.filterInfo?.totalRows 
                || currentPreviewData?.source?.rows?.length || '?';
            
            // 更新顶部统计栏的"预览行数"
            previewRowEl.textContent = `${displayNum} / ${totalRows}`;
        }
        
        // 绘制对比视图的连线
        // SVG 现在是 #comparisonContainer 的直接子元素（position:absolute; width:100%; height:100%）
        // 坐标系以 #comparisonContainer 的左上角为原点
        function drawComparisonConnections(mappings) {
            const svg = document.getElementById('comparisonConnectionLayer');
            const container = document.getElementById('comparisonContainer');
            
            if (!svg || !container) {
                warn('[drawConnections] SVG或容器未找到', { svg: !!svg, container: !!container });
                return;
            }
            
            const containerRect = container.getBoundingClientRect();
            
            log('[drawConnections] 开始绘制', {
                mappingsCount: mappings.length,
                containerRect: { w: containerRect.width, h: containerRect.height, left: containerRect.left, top: containerRect.top },
                svgSize: { w: svg.clientWidth, h: svg.clientHeight }
            });
            
            // 清空旧连线
            svg.innerHTML = '';

            const sourceTableBody = document.querySelector('#sourcePreviewTable tbody');
            const isCurrentRowFiltered = sourceTableBody && sourceTableBody.querySelector('tr')?.style.textDecoration?.includes('line-through');
            if (isCurrentRowFiltered) {
                log('[drawConnections] 当前行被过滤，跳过绘制');
                return;
            }
            // 过滤掉已移除的映射
            const activeMappings = mappings.filter(m => 
                !removedMappings.some(rm => rm.targetIndex === m.targetIndex)
            );
            
            log('[drawConnections] 有效映射数:', activeMappings.length);
            
            let drawnCount = 0;
            
            activeMappings.forEach(mapping => {
                const sourceTd = document.getElementById(`source-td-${mapping.sourceIndex}`);
                const targetTh = document.getElementById(`target-th-${mapping.targetIndex}`);
                
                if (!sourceTd || !targetTh) {
                    warn('[drawConnections] 找不到元素', {
                        sourceId: `source-td-${mapping.sourceIndex}`,
                        targetId: `target-th-${mapping.targetIndex}`,
                        hasSource: !!sourceTd,
                        hasTarget: !!targetTh
                    });
                    return;
                }
                
                // 使用 getBoundingClientRect 计算相对于 container 的坐标
                const sourceRect = sourceTd.getBoundingClientRect();
                const targetRect = targetTh.getBoundingClientRect();
                
                // 坐标 = 元素视口坐标 - 容器视口坐标
                const x1 = sourceRect.left - containerRect.left + sourceRect.width / 2;
                const y1 = sourceRect.top - containerRect.top + sourceRect.height;
                
                const x2 = targetRect.left - containerRect.left + targetRect.width / 2;
                const y2 = targetRect.top - containerRect.top;
                
                log(`[drawConnections] 映射 ${mapping.sourceIndex}→${mapping.targetIndex}:`, {
                    x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1),
                    sourceSize: `${sourceRect.width.toFixed(0)}x${sourceRect.height.toFixed(0)}`,
                    targetSize: `${targetRect.width.toFixed(0)}x${targetRect.height.toFixed(0)}`
                });
                
                // 根据匹配类型确定颜色和样式
                let color = '#F44336';
                let strokeWidth = 2;
                let strokeDasharray = '2,2';
                
                if (mapping.matchType === 'manual') {
                    color = '#2196f3'; strokeWidth = 3; strokeDasharray = '';
                } else if (mapping.score === 100) {
                    color = '#4CAF50'; strokeWidth = 3; strokeDasharray = '';
                } else if (mapping.score >= 80) {
                    color = '#FF9800'; strokeWidth = 2; strokeDasharray = '5,5';
                } else {
                    color = '#F44336'; strokeWidth = 2; strokeDasharray = '2,2';
                }
                
                // 绘制贝塞尔曲线路径
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const controlY1 = y1 + (y2 - y1) * 0.3;
                const controlY2 = y1 + (y2 - y1) * 0.7;
                path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${controlY1}, ${x2} ${controlY2}, ${x2} ${y2}`);
                path.setAttribute('stroke', color);
                path.setAttribute('stroke-width', strokeWidth.toString());
                path.setAttribute('stroke-dasharray', strokeDasharray);
                path.setAttribute('fill', 'none');
                path.setAttribute('opacity', '0.7');
                svg.appendChild(path);
                
                // 起点圆点（源数据单元格底部）
                const startCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                startCircle.setAttribute('cx', String(x1));
                startCircle.setAttribute('cy', String(y1));
                startCircle.setAttribute('r', '4');
                startCircle.setAttribute('fill', color);
                startCircle.setAttribute('opacity', '0.8');
                svg.appendChild(startCircle);
                
                // 获取值转换规则
                const rules = previewValueTransformRules[`${mapping.sourceIndex}_${mapping.targetIndex}`];
                const validRules = rules ? rules.filter(isValidTransformRule) : [];
                
                // 终点圆点（目标表头顶部）
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', String(x2));
                circle.setAttribute('cy', String(y2));
                circle.setAttribute('r', '4');
                circle.setAttribute('fill', color);
                circle.setAttribute('opacity', '0.8');
                svg.appendChild(circle);
                
                // 如果有转换规则，显示齿轮图标
                if (validRules.length > 0) {
                    const midX = (x1 + x2) / 2;
                    const midY = (y1 + y2) / 2;
                    const foreignObj = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
                    foreignObj.setAttribute('x', String(midX - 10));
                    foreignObj.setAttribute('y', String(midY - 10));
                    foreignObj.setAttribute('width', '20');
                    foreignObj.setAttribute('height', '20');
                    foreignObj.style.pointerEvents = 'none';
                    const iconDiv = document.createElement('div');
                    iconDiv.style.cssText = 'width:20px;height:20px;background:#fff3cd;border:2px solid #ff9800;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;';
                    iconDiv.textContent = '⚙';
                    foreignObj.appendChild(iconDiv);
                    svg.appendChild(foreignObj);
                }
                
                drawnCount++;
            });
            
            log(`[drawConnections] 完成，共绘制 ${drawnCount} 条连线`);
        }
        
        // ========== 控制面板拖拽功能 ==========
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        let currentX = 0;
        let currentY = 0;
        
        const controlsPanel = document.getElementById('controlsPanel');
        const dragHandle = document.getElementById('dragHandle');
        
        if (dragHandle && controlsPanel) {
            dragHandle.addEventListener('mousedown', (e) => {
                isDragging = true;
                controlsPanel.classList.add('dragging');
                
                const rect = controlsPanel.getBoundingClientRect();
                dragOffsetX = e.clientX - rect.left;
                dragOffsetY = e.clientY - rect.top;
                
                e.preventDefault();
                e.stopPropagation();
            });
            
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                
                const newX = e.clientX - dragOffsetX;
                const newY = e.clientY - dragOffsetY;
                
                // 限制在视口范围内
                const maxX = window.innerWidth - controlsPanel.offsetWidth;
                const maxY = window.innerHeight - controlsPanel.offsetHeight;
                
                currentX = Math.max(0, Math.min(newX, maxX));
                currentY = Math.max(0, Math.min(newY, maxY));
                
                controlsPanel.style.left = currentX + 'px';
                controlsPanel.style.top = currentY + 'px';
                controlsPanel.style.bottom = 'auto';
                controlsPanel.style.transform = 'none';
            });
            
            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    controlsPanel.classList.remove('dragging');
                    
                    // 保存位置到 localStorage
                    localStorage.setItem('controlsPanelPosition', JSON.stringify({
                        x: currentX,
                        y: currentY
                    }));
                }
            });
            
            // 恢复保存的位置
            const savedPosition = localStorage.getItem('controlsPanelPosition');
            if (savedPosition) {
                try {
                    const pos = JSON.parse(savedPosition);
                    currentX = pos.x;
                    currentY = pos.y;
                    controlsPanel.style.left = currentX + 'px';
                    controlsPanel.style.top = currentY + 'px';
                    controlsPanel.style.bottom = 'auto';
                    controlsPanel.style.transform = 'none';
                } catch (e) {
                    console.error('恢复控制面板位置失败:', e);
                }
            }
        }
        
        // 从响应头获取 Session ID
        function updateSessionFromResponse(response) {
            const newSessionId = response.headers.get('X-Session-Id');
            if (newSessionId && newSessionId !== sessionId) {
                sessionId = newSessionId;
                log('更新 Session:', sessionId);
            }
        }
        
        let sourceFile = null;
        let targetFile = null;
        let previewData = null;
        let manualMappings = [];
        let uploadAbortController = null;
        let removedMappings = [];
        let currentLoadedConfig = null;
        let selectedSourceField = null;
        let fieldElements = { source: {}, target: {} };
        let valueTransformRules = {};
        let defaultValues = {};  // 目标字段默认值 { targetIndex: defaultValue }
        let logicRules = {};     // 目标字段逻辑规则 { targetIndex: logicRuleObject }
        let currentTransformField = null;
        let sourceSampleData = null;
        let configHasChanges = false;
        
        // 初始化 Session
        initSession();
        
        function updateSteps() {
            const step1 = document.getElementById('step1');
            const step2 = document.getElementById('step2');
            const step3 = document.getElementById('step3');
            const step4 = document.getElementById('step4');
            const sourcePanel = document.querySelector('.source-panel');
            const targetPanel = document.querySelector('.target-panel');
            const sourceDropZone = document.getElementById('sourceDropZone');
            const targetDropZone = document.getElementById('targetDropZone');
            const quickGuideText = document.getElementById('quickGuideText');
            const mainContent = document.getElementById('mainContent');
            const mappingHint = document.querySelector('.mapping-hint');
            
            step1.classList.remove('active', 'completed');
            step2.classList.remove('active', 'completed');
            step3.classList.remove('active', 'completed');
            step4.classList.remove('active', 'completed');
            
            // 移除闪烁效果
            if (mappingHint) mappingHint.classList.remove('blink');
            
            sourcePanel.classList.remove('highlight-panel');
            targetPanel.classList.remove('highlight-panel');
            sourceDropZone.classList.remove('highlight');
            targetDropZone.classList.remove('highlight');
            mainContent.classList.remove('has-overlay');
            
            if (currentLoadedConfig && previewData) {
                step1.classList.add('completed');
                step2.classList.add('completed');
                
                const mappedTargetIndices = new Set();
                (previewData.mappings || []).forEach(m => {
                    if (!removedMappings.some(r => r.targetIndex === m.targetIndex)) {
                        mappedTargetIndices.add(m.targetIndex);
                    }
                });
                manualMappings.forEach(m => mappedTargetIndices.add(m.target));
                
                let unmappedRequiredCount = 0;
                document.querySelectorAll('.target-panel .field-item').forEach(el => {
                    if (el.dataset.isRequired === 'true' && !mappedTargetIndices.has(parseInt(el.dataset.index))) {
                        unmappedRequiredCount++;
                    }
                });
                
                if (unmappedRequiredCount > 0) {
                    step3.classList.add('active');
                    quickGuideText.textContent = `还有 ${unmappedRequiredCount} 个必填字段未映射，请继续建立映射关系后再执行转换。`;
                    document.getElementById('transformBtn').classList.remove('pulse');
                    // 添加闪烁效果
                    if (mappingHint) mappingHint.classList.add('blink');
                } else {
                    step3.classList.add('completed');
                    quickGuideText.textContent = '所有必填字段已映射完成，点击"开始转换"按钮执行数据转换。';
                    document.getElementById('transformBtn').classList.add('pulse');
                }
            } else if (sourceFile && targetFile && previewData) {
                const mappedTargetIndices = new Set();
                (previewData.mappings || []).forEach(m => {
                    if (!removedMappings.some(r => r.targetIndex === m.targetIndex)) {
                        mappedTargetIndices.add(m.targetIndex);
                    }
                });
                manualMappings.forEach(m => mappedTargetIndices.add(m.target));
                
                let unmappedRequiredCount = 0;
                document.querySelectorAll('.target-panel .field-item').forEach(el => {
                    if (el.dataset.isRequired === 'true' && !mappedTargetIndices.has(parseInt(el.dataset.index))) {
                        unmappedRequiredCount++;
                    }
                });
                
                step1.classList.add('completed');
                step2.classList.add('completed');
                
                if (unmappedRequiredCount > 0) {
                    step3.classList.add('active');
                    quickGuideText.textContent = `还有 ${unmappedRequiredCount} 个必填字段未映射，请继续建立映射关系后再执行转换。`;
                    document.getElementById('transformBtn').classList.remove('pulse');
                    // 添加闪烁效果
                    if (mappingHint) mappingHint.classList.add('blink');
                } else {
                    step3.classList.add('completed');
                    quickGuideText.textContent = '所有必填字段已映射完成，点击"开始转换"按钮执行数据转换。';
                    document.getElementById('transformBtn').classList.add('pulse');
                }
            } else if (sourceFile) {
                step1.classList.add('completed');
                step2.classList.add('active');
                targetPanel.classList.add('highlight-panel');
                targetDropZone.classList.add('highlight');
                mainContent.classList.add('has-overlay');
                quickGuideText.textContent = '请上传目标模板文件。这是您希望将数据转换成的目标格式，包含需要填写的字段列。';
            } else if (targetFile) {
                step1.classList.add('active');
                step2.classList.add('completed');
                sourcePanel.classList.add('highlight-panel');
                sourceDropZone.classList.add('highlight');
                mainContent.classList.add('has-overlay');
                quickGuideText.textContent = '请上传您需要转换的源数据文件，该文件应包含目标模板所需的所有字段列。支持拖拽或点击选择文件上传。';
            } else {
                step1.classList.add('active');
                sourcePanel.classList.add('highlight-panel');
                sourceDropZone.classList.add('highlight');
                mainContent.classList.add('has-overlay');
                quickGuideText.textContent = '请上传您需要转换的源数据文件，该文件应包含目标模板所需的所有字段列。支持拖拽或点击选择文件上传。';
            }
            
            // 更新预览按钮状态
            updatePreviewButton();
        }
        
        function removeFile(type) {
            try {
                const dropZoneId = type === 'source' ? 'sourceDropZone' : 'targetDropZone';
                const dropZone = document.getElementById(dropZoneId);
                
                if (!dropZone) {
                    console.error('dropZone not found:', dropZoneId);
                    return;
                }
                
                const fileInfo = dropZone.nextElementSibling;
                const tableContainerId = type === 'source' ? 'sourceTableContainer' : 'targetTableContainer';
                const tableContainer = document.getElementById(tableContainerId);
                
                if (type === 'source') {
                    sourceFile = null;
                    sourceSampleData = null;
                    sourceFileAnalysis = null;
                    
                    // 重置筛选面板状态（面板UI在预览弹窗中，此处只重置数据）
                    const filterPanelContainer = document.getElementById('filterPanelContainer');
                    if (filterPanelContainer) {
                        filterPanelContainer.innerHTML = '';
                    }
                    // 重置筛选面板实例和配置
                    window.filterPanel = null;
                    window.filterConfig = { enabled: false, combinationMode: 'AND', rules: [] };
                    sourceFields = [];
                } else {
                    targetFile = null;
                }
                
                if (!sourceFile || !targetFile) {
                    previewData = null;
                    manualMappings = [];
                    removedMappings = [];
                    selectedSourceField = null;
                    valueTransformRules = {};
                    defaultValues = {};
                    logicRules = {};
                    currentLoadedConfig = null;
                    markConfigSaved();
                    
                    const statsPanel = document.getElementById('statsPanel');
                    const sourceStatsPanel = document.getElementById('sourceStatsPanel');
                    const controlsPanel = document.getElementById('controlsPanel');
                    const mappingToolbar = document.getElementById('mappingToolbar');
                    const transformBtn = document.getElementById('transformBtn');
                    const saveConfigBtn = document.getElementById('saveConfigBtn');
                    
                    if (statsPanel) statsPanel.style.display = 'none';
                    if (sourceStatsPanel) sourceStatsPanel.style.display = 'none';
                    if (controlsPanel) controlsPanel.style.display = 'none';
                    if (mappingToolbar) mappingToolbar.style.display = 'none';
                    if (transformBtn) transformBtn.disabled = true;
                    if (saveConfigBtn) saveConfigBtn.disabled = true;
                    
                    const canvas = document.getElementById('mappingCanvas');
                    if (canvas) {
                        canvas.innerHTML = '';
                    }
                    
                    document.querySelectorAll('.transform-indicator').forEach(el => el.remove());
                }
                
                dropZone.style.display = 'flex';
                
                if (fileInfo && fileInfo.classList.contains('file-info')) {
                    fileInfo.remove();
                }
                
                // 重置文件输入框的值，允许重新选择同一个文件
                const fileInputId = type === 'source' ? 'sourceFileInput' : 'targetFileInput';
                const fileInput = document.getElementById(fileInputId);
                if (fileInput) {
                    fileInput.value = '';
                }
                
                if (tableContainer) {
                    tableContainer.classList.remove('visible');
                    const fieldListId = type === 'source' ? 'sourceFields' : 'targetFields';
                    const fieldList = document.getElementById(fieldListId);
                    if (fieldList) {
                        fieldList.innerHTML = '';
                    }
                }
                
                fieldElements[type] = {};
                
                drawMappings();
                updateSteps();
                showSuccess(`已删除${type === 'source' ? '源' : '目标'}文件`);
            } catch (e) {
                console.error('removeFile error:', e);
                showError('删除文件失败：' + e.message);
            }
        }
        
        function showError(message) {
            const errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            errorElement.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 24px;">❌</span>
                    <span>${message}</span>
                </div>
            `;
            document.body.appendChild(errorElement);
            
            setTimeout(() => {
                errorElement.style.animation = 'slideIn 0.3s ease-out reverse';
                setTimeout(() => {
                    document.body.removeChild(errorElement);
                }, 300);
            }, 3000);
        }
        
        function showSuccess(message) {
            const successElement = document.createElement('div');
            successElement.className = 'success-message';
            successElement.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--success-color);
                color: white;
                padding: 18px 24px;
                border-radius: 10px;
                box-shadow: 0 6px 20px rgba(0,0,0,0.2);
                z-index: 1000;
                max-width: 450px;
                animation: slideIn 0.3s ease-out;
                border-left: 4px solid #2e7d32;
            `;
            successElement.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 24px;">✅</span>
                    <span>${message}</span>
                </div>
            `;
            document.body.appendChild(successElement);
            
            setTimeout(() => {
                successElement.style.animation = 'slideIn 0.3s ease-out reverse';
                setTimeout(() => {
                    document.body.removeChild(successElement);
                }, 300);
            }, 3000);
        }
        
        function showLoading(message = '处理中...') {
            const loadingElement = document.createElement('div');
            loadingElement.className = 'loading-overlay';
            loadingElement.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(255,255,255,0.9);
                backdrop-filter: blur(5px);
                z-index: 2000;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                animation: fadeIn 0.3s ease-out;
            `;
            loadingElement.innerHTML = `
                <div class="loading-spinner"></div>
                <div style="margin-top: 20px; font-size: 16px; color: #333;">${message}</div>
            `;
            document.body.appendChild(loadingElement);
            return loadingElement;
        }
        
        function hideLoading(loadingElement) {
            if (loadingElement) {
                loadingElement.style.animation = 'fadeIn 0.3s ease-out reverse';
                setTimeout(() => {
                    document.body.removeChild(loadingElement);
                }, 300);
            }
        }
        
        function setupDropZone(zoneId, inputId, type) {
            const zone = document.getElementById(zoneId);
            const input = document.getElementById(inputId);
            
            zone.addEventListener('click', () => input.click());
            
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('dragover');
            });
            
            zone.addEventListener('dragleave', () => {
                zone.classList.remove('dragover');
            });
            
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    handleFile(files[0], type);
                }
            });
            
            input.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    handleFile(e.target.files[0], type);
                }
            });
        }
        
        async function handleFile(file, type) {
            if (!file.name.match(/\.(xlsx|xls)$/i)) {
                showError('请上传Excel文件（.xlsx或.xls）');
                return;
            }
            
            const loadingId = type === 'source' ? 'sourceLoading' : 'targetLoading';
            const dropZoneId = type === 'source' ? 'sourceDropZone' : 'targetDropZone';
            const dropZone = document.getElementById(dropZoneId);
            
            document.getElementById(loadingId).classList.add('visible');
            dropZone.style.display = 'none';
            
            const fileInfo = document.createElement('div');
            fileInfo.className = 'file-info';
            fileInfo.id = `${type}FileInfo`;
            fileInfo.innerHTML = `
                <span>📄</span>
                <span class="file-name">${escapeHtml(file.name)}</span>
                <span class="file-size">${(file.size / 1024).toFixed(1)} KB</span>
                <span class="file-rows" id="${type}FileRows" style="color: #666; font-size: 13px; cursor: ${type === 'source' ? 'pointer' : 'default'};" ${type === 'source' ? 'onclick="openDataPreviewModal()"' : ''}>处理中...</span>
                <span class="cancel-upload" id="${type}CancelUpload" onclick="cancelUpload('${type}')" style="color: var(--error-color); cursor: pointer; font-size: 20px; transition: var(--transition);">✕</span>
            `;
            dropZone.parentNode.insertBefore(fileInfo, dropZone.nextSibling);
            
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', type);
            
            uploadAbortController = new AbortController();
            
            try {
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData,
                    signal: uploadAbortController.signal
                });
                
                // 更新 Session
                updateSessionFromResponse(response);
                
                const result = await response.json();
                
                if (result.success) {
                    uploadAbortController = null;
                    
                    log('上传成功，result:', result);
                    
                    // 上传成功后，调用 analyze 接口分析文件
                    try {
                        const analyzeResponse = await fetch('/api/analyze', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                filePath: result.data?.tempPath || result.tempPath,
                                type: type
                            })
                        });
                        
                        const analyzeResult = await analyzeResponse.json();
                        
                        if (!analyzeResult.success) {
                            throw new Error(analyzeResult.error?.message || '文件分析失败');
                        }
                        
                        const analysis = analyzeResult.analysis;
                        
                        if (type === 'source') {
                            sourceFile = file;
                            sourceFileAnalysis = analysis;
                            // 清除字段列表缓存（新文件需要重新加载字段）
                            fieldCache.clear();
                            renderSourceFields({
                                headers: analysis.dataHeaders,
                                rowCount: analysis.dataRowCount,
                                sampleData: analysis.sampleData
                            });
                            // 筛选面板已迁移至预览弹窗内，不再在主界面初始化
                            // initFilterPanel() 将在 showDataPreview() 中按需调用
                            const sourceRowsElement = document.getElementById('sourceFileRows');
                            if (sourceRowsElement) {
                                sourceRowsElement.textContent = `${analysis.dataRowCount} 行数据`;
                                sourceRowsElement.style.color = '#2e7d32';
                                sourceRowsElement.style.cursor = 'pointer';
                                sourceRowsElement.style.textDecoration = 'underline';
                                sourceRowsElement.title = '点击查看数据预览';
                            }
                            showSuccess(`源文件 ${file.name} 上传成功！`);
                        } else {
                            targetFile = file;
                            renderTargetFields({
                                headers: analysis.dataHeaders,
                                rowCount: analysis.dataRowCount
                            });
                            const targetRowsElement = document.getElementById('targetFileRows');
                            if (targetRowsElement) {
                                targetRowsElement.textContent = `1 行表头`;
                                targetRowsElement.style.color = '#2e7d32';
                            }
                            showSuccess(`目标模板 ${file.name} 上传成功！`);
                        }
                        
                        updateSteps();
                        
                        if (sourceFile && targetFile) {
                            const loading = showLoading('正在分析文件并建立字段映射...');
                            await analyzeAndMap();
                            hideLoading(loading);
                            updateSteps();
                        }
                    } catch (analyzeError) {
                        showError('文件分析失败：' + analyzeError.message);
                        resetFileUploadUI(type, dropZone, fileInfo);
                    }
                } else {
                    const errorMessage = result.error ? 
                        (result.error.message || '文件分析失败') : 
                        '文件分析失败';
                    showError(errorMessage);
                    resetFileUploadUI(type, dropZone, fileInfo);
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    showError('上传已取消');
                } else {
                    showError('上传失败: ' + error.message);
                }
                resetFileUploadUI(type, dropZone, fileInfo);
            } finally {
                uploadAbortController = null;
                document.getElementById(loadingId).classList.remove('visible');
            }
        }
        
        function cancelUpload(type) {
            if (uploadAbortController) {
                uploadAbortController.abort();
                uploadAbortController = null;
            }
            removeFile(type);
        }
        
        function resetFileUploadUI(type, dropZone, fileInfo) {
            if (dropZone) {
                dropZone.style.display = 'flex';
            }
            if (fileInfo && fileInfo.parentNode) {
                fileInfo.parentNode.removeChild(fileInfo);
            }
            if (type === 'source') {
                sourceFile = null;
            } else {
                targetFile = null;
            }
        }
        
        function numberToExcelColumn(num) {
            let column = '';
            while (num > 0) {
                const remainder = (num - 1) % 26;
                column = String.fromCharCode(65 + remainder) + column;
                num = Math.floor((num - 1) / 26);
            }
            return column;
        }
        
        function renderSourceFields(data) {
            const container = document.getElementById('sourceTableContainer');
            const list = document.getElementById('sourceFields');
            
            if (data.sampleData && data.sampleData.length > 0) {
                sourceSampleData = data.sampleData;
            }
            
            list.innerHTML = '';
            fieldElements.source = {};
            
            data.headers.forEach((header, idx) => {
                if (!header) return;
                const li = document.createElement('li');
                li.className = 'field-item';
                li.dataset.index = idx;
                li.dataset.name = header;
                
                const columnLetter = numberToExcelColumn(idx + 1);
                
                li.innerHTML = `
                    <span class="field-index">${columnLetter}</span>
                    <span class="field-name">${escapeHtml(header)}</span>
                    <div class="connection-point new" data-type="source" data-index="${idx}"></div>
                `;
                
                list.appendChild(li);
                fieldElements.source[idx] = li;
            });
            
            container.classList.add('visible');
            
            setupConnectionPoints();
        }
        
        function openDataPreviewModal() {
            if (!sourceSampleData || sourceSampleData.length === 0) {
                showError('暂无数据预览');
                return;
            }
            
            const content = document.getElementById('dataPreviewModalContent');
            // 优先使用 previewData 中的 headers，如果没有，使用 sourceFile 分析结果中的 headers
            const headers = (previewData && previewData.sourceHeaders && previewData.sourceHeaders.length > 0) 
                ? previewData.sourceHeaders 
                : (sourceFileAnalysis && sourceFileAnalysis.dataHeaders ? sourceFileAnalysis.dataHeaders : []);
            
            let html = '<div class="data-preview-table-wrapper"><table class="data-preview-table"><thead><tr>';
            headers.forEach(h => {
                html += `<th title="${escapeHtml(h || '')}">${escapeHtml(h || '')}</th>`;
            });
            html += '</tr></thead><tbody>';
            
            sourceSampleData.slice(0, 5).forEach(row => {
                html += '<tr>';
                for (let idx = 0; idx < headers.length; idx++) {
                    const cell = row[idx];
                    const cellText = String(cell !== undefined && cell !== null ? cell : '');
                    const displayText = cellText.length > 30 ? cellText.substring(0, 30) + '...' : cellText;
                    html += `<td title="${escapeHtml(cellText)}">${escapeHtml(displayText)}</td>`;
                }
                html += '</tr>';
            });
            
            html += '</tbody></table></div>';
            content.innerHTML = html;
            
            log('Preview HTML generated, table rows:', sourceSampleData.length);
            log('Preview headers:', headers);
            log('Preview first row:', sourceSampleData[0]);
            
            document.getElementById('dataPreviewModal').classList.add('show');
        }
        
        function closeDataPreviewModal() {
            document.getElementById('dataPreviewModal').classList.remove('show');
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function openValueTransformModal(sourceIndex, targetIndex) {
            currentTransformField = { sourceIndex, targetIndex };
            
            const sourceHeader = previewData.sourceHeaders[sourceIndex];
            const targetHeader = previewData.targetHeaders[targetIndex];
            
            document.getElementById('transformSourceField').textContent = sourceHeader;
            document.getElementById('transformTargetField').textContent = targetHeader;
            
            const rules = valueTransformRules[`${sourceIndex}_${targetIndex}`] || [];
            renderTransformRules(rules);
            
            document.getElementById('valueTransformModal').classList.add('show');
        }
        
        function closeValueTransformModal() {
            document.getElementById('valueTransformModal').classList.remove('show');
            currentTransformField = null;
        }
        
        function validateRegex(pattern) {
            if (!pattern || pattern.trim() === '') {
                return { valid: false, error: '请输入正则表达式' };
            }
            try {
                new RegExp(pattern);
                return { valid: true, error: null };
            } catch (e) {
                return { valid: false, error: e.message };
            }
        }
        
        function renderTransformRules(rules) {
            const tbody = document.getElementById('transformRulesBody');
            
            if (rules.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" style="text-align: center; color: #999; padding: 20px;">
                            暂无转换规则，点击下方按钮添加
                        </td>
                    </tr>
                `;
                return;
            }
            
            tbody.innerHTML = rules.map((rule, idx) => {
                const type = rule.type || 'simple';
                let typeOptions = '';
                let sourceInput = '';
                let targetInput = '';
                
                typeOptions = `
                    <select onchange="updateTransformRule(${idx}, 'type', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
                        <option value="simple" ${type === 'simple' ? 'selected' : ''}>简单替换</option>
                        <option value="string" ${type === 'string' ? 'selected' : ''}>字符串处理</option>
                        <option value="date" ${type === 'date' ? 'selected' : ''}>日期转换</option>
                        <option value="number" ${type === 'number' ? 'selected' : ''}>数值处理</option>
                        <option value="logic" ${type === 'logic' ? 'selected' : ''}>逻辑运算</option>
                    </select>
                `;
                
                switch (type) {
                    case 'simple':
                        sourceInput = `<input type="text" value="${escapeHtml(rule.source || '')}" onchange="updateTransformRule(${idx}, 'source', this.value)" placeholder="原值如：居民身份证">`;
                        targetInput = `<input type="text" value="${escapeHtml(rule.target || '')}" onchange="updateTransformRule(${idx}, 'target', this.value)" placeholder="目标值如：身份证">`;
                        break;
                    case 'string':
                        let extractValidation = '';
                        if (rule.operation === 'extract' && rule.params) {
                            const validation = validateRegex(rule.params);
                            if (validation.valid) {
                                extractValidation = `<span style="color: #27ae60; margin-left: 5px;">✓ 有效</span>`;
                            } else {
                                extractValidation = `<span style="color: #e74c3c; margin-left: 5px;" title="${escapeHtml(validation.error)}">✗ 无效</span>`;
                            }
                        }
                        sourceInput = `
                            <select onchange="updateTransformRule(${idx}, 'operation', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
                                <option value="substring" ${rule.operation === 'substring' ? 'selected' : ''}>截取字符串</option>
                                <option value="replace" ${rule.operation === 'replace' ? 'selected' : ''}>替换字符串</option>
                                <option value="extract" ${rule.operation === 'extract' ? 'selected' : ''}>正则提取</option>
                                <option value="trim" ${rule.operation === 'trim' ? 'selected' : ''}>去除空格</option>
                                <option value="uppercase" ${rule.operation === 'uppercase' ? 'selected' : ''}>转为大写</option>
                                <option value="lowercase" ${rule.operation === 'lowercase' ? 'selected' : ''}>转为小写</option>
                            </select>
                            ${rule.operation === 'substring' ? `<input type="text" value="${escapeHtml(rule.params || '')}" onchange="updateTransformRule(${idx}, 'params', this.value)" placeholder="起始位置,长度 (如: 0,5)" style="margin-top: 5px; width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">` : ''}
                            ${rule.operation === 'replace' ? `<input type="text" value="${escapeHtml(rule.params || '')}" onchange="updateTransformRule(${idx}, 'params', this.value)" placeholder="查找,替换 (如: a,b)" style="margin-top: 5px; width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">` : ''}
                            ${rule.operation === 'extract' ? `<div style="margin-top: 5px;"><input type="text" value="${escapeHtml(rule.params || '')}" oninput="updateTransformRule(${idx}, 'params', this.value)" placeholder="正则表达式 (如: (\\d{4})年)" style="width: calc(100% - 60px); padding: 6px; border: 1px solid #ddd; border-radius: 4px;">${extractValidation}</div>` : ''}
                        `;
                        targetInput = `<input type="text" value="${escapeHtml(rule.target || '')}" onchange="updateTransformRule(${idx}, 'target', this.value)" placeholder="默认值（可选）">`;
                        break;
                    case 'date':
                        sourceInput = `<input type="text" value="${escapeHtml(rule.sourceFormat || '')}" onchange="updateTransformRule(${idx}, 'sourceFormat', this.value)" placeholder="源日期格式 (如: YYYY-MM-DD)">`;
                        targetInput = `<input type="text" value="${escapeHtml(rule.targetFormat || '')}" onchange="updateTransformRule(${idx}, 'targetFormat', this.value)" placeholder="目标日期格式 (如: DD/MM/YYYY)">`;
                        break;
                    case 'number':
                        sourceInput = `
                            <select onchange="updateTransformRule(${idx}, 'operation', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
                                <option value="round" ${rule.operation === 'round' ? 'selected' : ''}>四舍五入</option>
                                <option value="floor" ${rule.operation === 'floor' ? 'selected' : ''}>向下取整</option>
                                <option value="ceil" ${rule.operation === 'ceil' ? 'selected' : ''}>向上取整</option>
                                <option value="fixed" ${rule.operation === 'fixed' ? 'selected' : ''}>保留小数</option>
                            </select>
                            ${rule.operation === 'fixed' ? `<input type="number" value="${rule.params || 2}" onchange="updateTransformRule(${idx}, 'params', this.value)" placeholder="小数位数" style="margin-top: 5px; width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">` : ''}
                        `;
                        targetInput = `<input type="text" value="${escapeHtml(rule.target || '')}" onchange="updateTransformRule(${idx}, 'target', this.value)" placeholder="默认值（可选）">`;
                        break;
                    case 'logic':
                        sourceInput = `
                            <input type="text" value="${escapeHtml(rule.expression || '')}" onchange="updateTransformRule(${idx}, 'expression', this.value)" placeholder="逻辑表达式 (如: col0 < 20000101 ? '上世纪出生' : (col0 < 20100101 ? '00后' : (col0 < 20200101 ? '10后' : '02后')))" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
                            <div style="margin-top: 10px; font-size: 12px; color: #666;">
                                <strong>提示:</strong> 可使用 col0, col1 等引用当前行的字段值，支持三元运算符实现多结果逻辑
                            </div>
                        `;
                        targetInput = `
                            <input type="text" value="${escapeHtml(rule.target || '')}" onchange="updateTransformRule(${idx}, 'target', this.value)" placeholder="默认值（可选）" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
                        `;
                        break;
                }
                
                return `
                    <tr>
                        <td>${typeOptions}</td>
                        <td>${sourceInput}</td>
                        <td>${targetInput}</td>
                        <td style="text-align: center;"><span class="delete-btn" onclick="removeTransformRule(${idx})">&times;</span></td>
                    </tr>
                `;
            }).join('');
        }
        
        function addTransformRule(type = 'simple') {
            const key = `${currentTransformField.sourceIndex}_${currentTransformField.targetIndex}`;
            if (!valueTransformRules[key]) {
                valueTransformRules[key] = [];
            }
            
            let newRule = { type: type };
            
            switch (type) {
                case 'simple':
                    newRule.source = '';
                    newRule.target = '';
                    break;
                case 'string':
                    newRule.operation = 'trim';
                    newRule.params = '';
                    newRule.target = '';
                    break;
                case 'date':
                    newRule.sourceFormat = '';
                    newRule.targetFormat = '';
                    break;
                case 'number':
                    newRule.operation = 'round';
                    newRule.params = '';
                    newRule.target = '';
                    break;
                case 'logic':
                    newRule.expression = '';
                    newRule.target = '';
                    break;
            }
            
            valueTransformRules[key].push(newRule);
            renderTransformRules(valueTransformRules[key]);
        }
        
        function updateTransformRule(idx, field, value) {
            const key = `${currentTransformField.sourceIndex}_${currentTransformField.targetIndex}`;
            if (valueTransformRules[key] && valueTransformRules[key][idx]) {
                valueTransformRules[key][idx][field] = value;
                if (field === 'type' || field === 'operation' || field === 'params') {
                    renderTransformRules(valueTransformRules[key]);
                }
                markConfigDirty();
            }
        }
        
        function removeTransformRule(idx) {
            const key = `${currentTransformField.sourceIndex}_${currentTransformField.targetIndex}`;
            if (valueTransformRules[key]) {
                valueTransformRules[key].splice(idx, 1);
                renderTransformRules(valueTransformRules[key]);
                markConfigDirty();
            }
        }
        
        function saveTransformRules() {
            const key = `${currentTransformField.sourceIndex}_${currentTransformField.targetIndex}`;
            const rules = valueTransformRules[key] || [];
            
            const invalidRules = [];
            
            rules.forEach((r, idx) => {
                if (r.type === 'string' && r.operation === 'extract' && r.params) {
                    const validation = validateRegex(r.params);
                    if (!validation.valid) {
                        invalidRules.push({
                            index: idx + 1,
                            error: validation.error
                        });
                    }
                }
            });
            
            if (invalidRules.length > 0) {
                const errorMessages = invalidRules.map(r => `第${r.index}条规则: ${r.error}`).join('\n');
                alert(`以下正则表达式无效，请修正后再保存：\n\n${errorMessages}`);
                return;
            }
            
            valueTransformRules[key] = rules.filter(r => {
                switch (r.type) {
                    case 'simple':
                        return r.source && r.source.trim() !== '' && r.target && r.target.trim() !== '';
                    case 'string':
                        if (r.operation === 'extract') {
                            return r.operation && r.params && r.params.trim() !== '';
                        }
                        return r.operation;
                    case 'date':
                        return r.targetFormat && r.targetFormat.trim() !== '';
                    case 'number':
                        return r.operation;
                    case 'logic':
                        return r.expression && r.expression.trim() !== '';
                    default:
                        return false;
                }
            });
            
            // 如果过滤后为空数组，删除这个 key
            if (valueTransformRules[key].length === 0) {
                delete valueTransformRules[key];
            }
            
            updateFieldTransformIndicator(currentTransformField.sourceIndex, currentTransformField.targetIndex);
            
            closeValueTransformModal();
            markConfigDirty();
        }
        
        function isValidTransformRule(rule) {
            if (!rule) return false;
            switch (rule.type) {
                case 'simple':
                    return rule.source && rule.source.trim() !== '' && rule.target && rule.target.trim() !== '';
                case 'string':
                    if (rule.operation === 'extract') {
                        return rule.operation && rule.params && rule.params.trim() !== '';
                    }
                    return rule.operation;
                case 'date':
                    return rule.targetFormat && rule.targetFormat.trim() !== '';
                case 'number':
                    return rule.operation;
                case 'logic':
                    return rule.expression && rule.expression.trim() !== '';
                default:
                    return false;
            }
        }
        
        function updateFieldTransformIndicator(sourceIndex, targetIndex) {
            const key = `${sourceIndex}_${targetIndex}`;
            const rules = valueTransformRules[key];
            const sourceEl = fieldElements.source[sourceIndex];
            
            if (sourceEl) {
                const oldIndicator = sourceEl.querySelector('.transform-indicator');
                if (oldIndicator) oldIndicator.remove();
                
                const validRules = rules ? rules.filter(isValidTransformRule) : [];
                if (validRules.length > 0) {
                    const indicator = document.createElement('span');
                    indicator.className = 'transform-indicator';
                    indicator.textContent = `🔄${validRules.length}`;
                    indicator.title = `已配置 ${validRules.length} 条值转换规则`;
                    indicator.onclick = (e) => {
                        e.stopPropagation();
                        openValueTransformModal(sourceIndex, targetIndex);
                    };
                    sourceEl.appendChild(indicator);
                }
            }
        }
        
        function renderTargetFields(data) {
            const container = document.getElementById('targetTableContainer');
            const list = document.getElementById('targetFields');
            
            list.innerHTML = '';
            fieldElements.target = {};
            
            data.headers.forEach((header, idx) => {
                if (!header) return;
                const li = document.createElement('li');
                li.className = 'field-item';
                const isRequired = header.trim().startsWith('*') || header.trim().endsWith('*');
                const displayHeader = isRequired ? header.trim() : header.trim();
                
                li.dataset.index = idx;
                li.dataset.name = header.trim();
                li.dataset.isRequired = isRequired ? 'true' : 'false';
                
                const columnLetter = numberToExcelColumn(idx + 1);
                
                const hasDefault = defaultValues[idx] !== undefined || defaultValues[String(idx)] !== undefined;
                const hasLogic = logicRules[idx] !== undefined || logicRules[String(idx)] !== undefined;
                
                let statusMark = '';
                if (hasDefault) {
                    const defaultValue = defaultValues[idx] !== undefined ? defaultValues[idx] : defaultValues[String(idx)];
                    statusMark = `<span class="default-value-mark" title="默认值：${escapeHtml(defaultValue)}">📝</span>`;
                } else if (hasLogic) {
                    statusMark = `<span class="logic-rule-mark" title="已设置逻辑规则">🔀</span>`;
                }
                
                li.innerHTML = `
                    <div class="connection-point new" data-type="target" data-index="${idx}"></div>
                    <span class="field-index">${columnLetter}</span>
                    <span class="field-name">${escapeHtml(displayHeader)}</span>
                    ${statusMark}
                `;
                
                if (isRequired) {
                    li.classList.add('required');
                    const hasMapping = manualMappings.some(m => m.target === idx) || 
                        (previewData && previewData.mappings && previewData.mappings.some(m => m.targetIndex === idx && !removedMappings.some(r => r.targetIndex === idx)));
                    if (hasMapping || hasDefault || hasLogic) {
                        li.classList.add('mapped');
                    } else {
                        li.classList.add('missing');
                    }
                } else {
                    // 非必填字段不需要 mapped/missing 类
                    li.classList.remove('mapped', 'missing');
                }
                
                if (hasDefault) {
                    li.classList.add('has-default');
                } else if (hasLogic) {
                    li.classList.add('has-logic');
                }
                
                li.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    showTargetFieldContextMenu(e, idx, header.trim());
                });
                
                list.appendChild(li);
                fieldElements.target[idx] = li;
            });
            
            container.classList.add('visible');
            setupConnectionPoints();
        }
        
        async function analyzeAndMap() {
            try {
                const response = await fetch('/api/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                const result = await response.json();
                
                if (result.success) {
                    previewData = {
                        ...result.preview,
                        mappings: result.mappings,
                        sourceHeaders: result.sourceHeaders,
                        targetHeaders: result.targetHeaders
                    };
                    updateMappingDisplay();
                    updateStats();
                    const statsPanel = document.getElementById('statsPanel');
                    const sourceStatsPanel = document.getElementById('sourceStatsPanel');
                    const controlsPanel = document.getElementById('controlsPanel');
                    
                    if (statsPanel) statsPanel.style.display = 'flex';
                    if (sourceStatsPanel) sourceStatsPanel.style.display = 'flex';
                    if (controlsPanel) controlsPanel.style.display = 'block';
                    if (sourceFile && targetFile) {
                        const mappingControls = document.getElementById('mappingControls');
                        if (mappingControls) mappingControls.style.display = 'flex';
                    }
                    const transformBtn = document.getElementById('transformBtn');
                    if (transformBtn) transformBtn.disabled = false;
                    const saveConfigBtn = document.getElementById('saveConfigBtn');
                    if (saveConfigBtn) saveConfigBtn.disabled = false;
                    setTimeout(drawMappings, 100);
                    renderConfigList();
                    
                    const configs = getConfigs();
                    let bestConfig = null;
                    let bestMatchScore = 0;
                    
                    configs.forEach(config => {
                        const sourceMatch = calculateMatchScore(config.sourceHeaders, previewData.sourceHeaders);
                        const targetMatch = calculateMatchScore(config.targetHeaders, previewData.targetHeaders);
                        const totalMatch = (sourceMatch + targetMatch) / 2;
                        
                        if (sourceMatch === 1 && targetMatch === 1) {
                            if (totalMatch > bestMatchScore || (totalMatch === bestMatchScore && new Date(config.createdAt) > new Date(bestConfig?.createdAt || 0))) {
                                bestConfig = config;
                                bestMatchScore = totalMatch;
                            }
                        }
                    });
                    
                    if (bestConfig) {
                        const configDate = new Date(bestConfig.createdAt).toLocaleString('zh-CN');
                        if (confirm(`所选文件与 ${configDate} 保存的配置 "${bestConfig.name}" 字段完全一致，是否使用此配置？`)) {
                            loadConfig(bestConfig.id);
                        }
                    } else {
                        // 不需要调用 autoMapExactMatches()，因为后端 /api/confirm 已经返回了正确的映射
                        // previewData.mappings 已经包含了精确匹配（score=100）的映射
                        // 弹出提示要新建配置
                        setTimeout(() => {
                            showAddConfigModal();
                        }, 100);
                    }
                } else {
                    showError('映射分析失败: ' + (result.error || '未知错误'));
                }
            } catch (error) {
                showError('映射分析失败: ' + error.message);
            }
        }
        
        function autoMapExactMatches() {
            // 自动建立字段名完全一样的映射
            const sourceHeaders = previewData.sourceHeaders || [];
            const targetHeaders = previewData.targetHeaders || [];
            
            sourceHeaders.forEach((sourceField, sourceIndex) => {
                if (!sourceField) return;
                
                const cleanSource = sourceField.replace(/\*/g, '').trim();
                
                // 在目标字段中查找完全匹配的
                for (let targetIndex = 0; targetIndex < targetHeaders.length; targetIndex++) {
                    const targetField = targetHeaders[targetIndex];
                    if (!targetField) continue;
                    
                    const cleanTarget = targetField.replace(/\*/g, '').trim();
                    
                    // 字段名完全一样（去掉 * 后）
                    if (cleanSource === cleanTarget) {
                        // 检查是否已经存在映射
                        const alreadyMapped = manualMappings.some(m => 
                            m.source === sourceIndex || m.target === targetIndex
                        );
                        
                        if (!alreadyMapped) {
                            manualMappings.push({
                                source: sourceIndex,
                                target: targetIndex,
                                sourceField: sourceField,
                                targetField: targetField
                            });
                        }
                        break;
                    }
                }
            });
            
            // 更新映射显示
            updateMappingDisplay();
            setTimeout(drawMappings, 100);
            markConfigDirty();
        }
        
        function updateMappingDisplay() {
            if (!previewData) return;
            
            const mappedTargetIndices = new Set();
            const mappedSourceIndices = new Set();
            
            (previewData.mappings || []).forEach(mapping => {
                if (!removedMappings.some(r => r.targetIndex === mapping.targetIndex)) {
                    mappedTargetIndices.add(mapping.targetIndex);
                    mappedSourceIndices.add(mapping.sourceIndex);
                }
            });
            
            manualMappings.forEach(m => {
                mappedTargetIndices.add(m.target);
                mappedSourceIndices.add(m.source);
            });

            document.querySelectorAll('.target-panel .field-item').forEach(el => {
                const idx = parseInt(el.dataset.index);
                const isRequired = el.dataset.isRequired === 'true';
                const isMapped = mappedTargetIndices.has(idx);
                const hasDefault = defaultValues[idx] !== undefined || defaultValues[String(idx)] !== undefined;
                const hasLogic = logicRules[idx] !== undefined || logicRules[String(idx)] !== undefined;
                
                el.classList.remove('mapped', 'missing');
                
                const connectionPoint = el.querySelector('.connection-point');
                if (connectionPoint) {
                    if (isMapped || hasDefault || hasLogic) {
                        connectionPoint.classList.remove('new');
                    } else {
                        connectionPoint.classList.add('new');
                    }
                }
                
                if (isRequired) {
                    if (isMapped || hasDefault || hasLogic) {
                        el.classList.add('mapped');
                    } else {
                        el.classList.add('missing');
                    }
                }
            });
            
            document.querySelectorAll('.source-panel .field-item').forEach(el => {
                const idx = parseInt(el.dataset.index);
                const isMapped = mappedSourceIndices.has(idx);
                
                const connectionPoint = el.querySelector('.connection-point');
                if (connectionPoint) {
                    if (isMapped) {
                        connectionPoint.classList.remove('new');
                    } else {
                        connectionPoint.classList.add('new');
                    }
                }
            });
            
            updateStats();
        }
        
        function setupConnectionPoints() {
            let tooltipEl = null;
            
            document.querySelectorAll('.connection-point').forEach(point => {
                point.addEventListener('click', handleConnectionClick);
                
                point.addEventListener('mouseenter', (e) => {
                    if (!tooltipEl) {
                        tooltipEl = document.createElement('div');
                        tooltipEl.className = 'connection-point-tooltip';
                        document.body.appendChild(tooltipEl);
                    }
                    tooltipEl.textContent = '点击选择此字段';
                    tooltipEl.style.display = 'block';
                    
                    const rect = point.getBoundingClientRect();
                    tooltipEl.style.left = rect.left + rect.width / 2 - tooltipEl.offsetWidth / 2 + 'px';
                    tooltipEl.style.top = rect.top - tooltipEl.offsetHeight - 8 + 'px';
                });
                
                point.addEventListener('mouseleave', () => {
                    if (tooltipEl) {
                        tooltipEl.style.display = 'none';
                    }
                });
            });
        }
        
        function handleConnectionClick(e) {
            e.stopPropagation();
            const point = e.target;
            const type = point.dataset.type;
            const index = parseInt(point.dataset.index);
            
            point.classList.remove('new');
            
            if (type === 'source') {
                document.querySelectorAll('.connection-point').forEach(p => p.classList.remove('active'));
                point.classList.add('active');
                selectedSourceField = index;
            } else if (type === 'target' && selectedSourceField !== null) {
                addManualMapping(selectedSourceField, index);
                document.querySelectorAll('.connection-point').forEach(p => p.classList.remove('active'));
                selectedSourceField = null;
            }
        }
        
        function addManualMapping(sourceIndex, targetIndex) {
            const existingIdx = manualMappings.findIndex(m => m.target === targetIndex);
            if (existingIdx >= 0) {
                manualMappings.splice(existingIdx, 1);
            }
            
            const removedIdx = removedMappings.findIndex(m => m.targetIndex === targetIndex);
            if (removedIdx >= 0) {
                removedMappings.splice(removedIdx, 1);
            }
            
            manualMappings.push({
                source: sourceIndex,
                target: targetIndex
            });
            
            updateMappingDisplay();
            drawMappings();
            updateSteps();
            markConfigDirty();
        }
        
        // ========== 右键菜单和弹窗函数 ==========
        let contextMenu = null;
        
        function showTargetFieldContextMenu(e, targetIndex, targetField) {
            if (contextMenu) {
                contextMenu.remove();
            }
            
            const hasMapping = manualMappings.some(m => m.target === targetIndex) || 
                (previewData && previewData.mappings && previewData.mappings.some(m => m.targetIndex === targetIndex && !removedMappings.some(r => r.targetIndex === targetIndex)));
            const hasDefault = defaultValues[targetIndex] !== undefined;
            const hasLogic = logicRules[targetIndex] !== undefined;
            
            contextMenu = document.createElement('div');
            contextMenu.style.cssText = `
                position: fixed;
                left: ${e.clientX}px;
                top: ${e.clientY}px;
                background: white;
                border: 1px solid #ddd;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10000;
                min-width: 180px;
                padding: 8px 0;
            `;
            
            const menuItems = [];
            
            menuItems.push({
                icon: '📝',
                text: hasDefault ? '修改默认值...' : '设置默认值...',
                action: () => openDefaultValueModal(targetIndex, targetField)
            });
            
            menuItems.push({
                icon: '🔀',
                text: hasLogic ? '修改逻辑规则...' : '设置逻辑规则...',
                action: () => openLogicRuleModal(targetIndex, targetField)
            });
            
            if (hasDefault || hasLogic) {
                menuItems.push({ divider: true });
                menuItems.push({
                    icon: '🗑️',
                    text: '清除默认值/逻辑规则',
                    action: () => clearDefaultValueOrLogic(targetIndex)
                });
            }
            
            if (hasMapping) {
                menuItems.push({ divider: true });
                menuItems.push({
                    icon: '❌',
                    text: '删除映射',
                    action: () => {
                        if (confirm('确定要删除这条映射关系吗？')) {
                            removeMapping(targetIndex);
                            // 关闭右键菜单
                            if (contextMenu) {
                                contextMenu.remove();
                                contextMenu = null;
                            }
                        }
                    }
                });
            }
            
            menuItems.forEach(item => {
                if (item.divider) {
                    const divider = document.createElement('div');
                    divider.style.cssText = 'height: 1px; background: #eee; margin: 4px 12px;';
                    contextMenu.appendChild(divider);
                } else {
                    const menuItem = document.createElement('div');
                    menuItem.style.cssText = `
                        padding: 8px 16px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 14px;
                        color: #333;
                    `;
                    menuItem.innerHTML = `<span>${item.icon}</span><span>${item.text}</span>`;
                    menuItem.addEventListener('mouseenter', () => {
                        menuItem.style.background = '#f5f5f5';
                    });
                    menuItem.addEventListener('mouseleave', () => {
                        menuItem.style.background = 'transparent';
                    });
                    menuItem.addEventListener('click', () => {
                        item.action();
                        contextMenu.remove();
                        contextMenu = null;
                    });
                    contextMenu.appendChild(menuItem);
                }
            });
            
            document.body.appendChild(contextMenu);
            
            const closeMenu = (ev) => {
                if (!contextMenu || contextMenu.contains(ev.target)) return;
                contextMenu.remove();
                contextMenu = null;
                document.removeEventListener('click', closeMenu);
            };
            
            setTimeout(() => {
                document.addEventListener('click', closeMenu);
            }, 0);
        }
        
        function openDefaultValueModal(targetIndex, targetField) {
            const currentValue = defaultValues[targetIndex] || '';
            
            const modalHtml = `
                <div class="dlg-overlay" id="defaultValueModalOverlay" onclick="closeDefaultValueModal(event)">
                    <div class="dlg-box dlg-box--sm" onclick="event.stopPropagation()">
                        <div class="dlg-header">
                            <h3 class="dlg-title">📝 设置默认值</h3>
                            <button class="dlg-close" onclick="closeDefaultValueModal()">×</button>
                        </div>
                        
                        <div class="dlg-field">
                            <label class="dlg-label">目标字段</label>
                            <div class="dlg-field-value">${escapeHtml(targetField)}</div>
                        </div>
                        
                        <div class="dlg-field">
                            <label class="dlg-label">默认值</label>
                            <input type="text" id="defaultValueInput" value="${escapeHtml(currentValue)}" placeholder="请输入默认值" class="dlg-input" />
                        </div>
                        
                        <div class="dlg-hint dlg-hint--warn">
                            💡 设置后，该字段将始终使用此默认值，无需映射源字段。
                        </div>
                        
                        <div class="dlg-footer">
                            <button class="dlg-btn dlg-btn--cancel" onclick="closeDefaultValueModal()">取消</button>
                            <button class="dlg-btn dlg-btn--primary" onclick="saveDefaultValue(${targetIndex})">确定</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            setTimeout(() => document.getElementById('defaultValueInput').focus(), 100);
        }
        
        function closeDefaultValueModal(event) {
            if (event && event.target !== event.currentTarget) return;
            const modal = document.getElementById('defaultValueModalOverlay');
            if (modal) modal.remove();
        }
        
        function saveDefaultValue(targetIndex) {
            const value = document.getElementById('defaultValueInput').value.trim();
            
            if (manualMappings.some(m => m.target === targetIndex)) {
                if (!confirm('该字段已有映射关系，设置默认值将移除映射。确定继续？')) {
                    return;
                }
                removeMapping(targetIndex);
            }
            
            delete logicRules[targetIndex];
            
            if (value) {
                defaultValues[targetIndex] = value;
            } else {
                delete defaultValues[targetIndex];
            }
            
            closeDefaultValueModal();
            renderTargetFields({ headers: previewData.targetHeaders });
            drawMappings();
            updateStats();
            markConfigDirty();
        }
        
        function openLogicRuleModal(targetIndex, targetField) {
            const currentRule = logicRules[targetIndex] || { conditions: [], defaultResult: '' };
            const sourceFields = previewData ? previewData.sourceHeaders : [];
            
            let conditionsHtml = '';
            currentRule.conditions.forEach((cond, idx) => {
                conditionsHtml += `
                    <div class="dlg-condition-row">
                        <span style="color: #666; font-size: 13px;">如果</span>
                        <select class="condition-source dlg-input" style="flex: 1; padding: 6px 8px;">
                            ${sourceFields.map((f, i) => `<option value="${i}" ${cond.sourceIndex == i ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}
                        </select>
                        <select class="condition-operator" style="width: 60px; padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <option value=">" ${cond.operator === '>' ? 'selected' : ''}>></option>
                            <option value=">=" ${cond.operator === '>=' ? 'selected' : ''}>>=</option>
                            <option value="<" ${cond.operator === '<' ? 'selected' : ''}><</option>
                            <option value="<=" ${cond.operator === '<=' ? 'selected' : ''}><=</option>
                            <option value="==" ${cond.operator === '==' ? 'selected' : ''}>=</option>
                            <option value="!=" ${cond.operator === '!=' ? 'selected' : ''}>!=</option>
                            <option value="contains" ${cond.operator === 'contains' ? 'selected' : ''}>包含</option>
                        </select>
                        <input type="text" class="condition-value" value="${escapeHtml(cond.value || '')}" placeholder="值" style="width: 100px; padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px;" />
                        <span style="color: #666; font-size: 13px;">则</span>
                        <input type="text" class="condition-result" value="${escapeHtml(cond.result || '')}" placeholder="结果" style="width: 100px; padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px;" />
                        <button type="button" onclick="this.closest('.dlg-condition-row').remove()" class="dlg-condition-del">×</button>
                    </div>
                `;
            });
            
            const modalHtml = `
                <div class="dlg-overlay" id="logicRuleModalOverlay" onclick="closeLogicRuleModal(event)">
                    <div class="dlg-box dlg-box--lg" onclick="event.stopPropagation()">
                        <div class="dlg-header">
                            <h3 class="dlg-title">🔀 设置逻辑规则</h3>
                            <button class="dlg-close" onclick="closeLogicRuleModal()">×</button>
                        </div>
                        
                        <div class="dlg-field">
                            <label class="dlg-label">目标字段</label>
                            <div class="dlg-field-value">${escapeHtml(targetField)}</div>
                        </div>
                        
                        <div class="dlg-field">
                            <label class="dlg-label">条件规则</label>
                            <div id="conditionsContainer">${conditionsHtml || '<div class="dlg-condition-empty" style="color: #999; font-size: 13px; padding: 10px;">暂无条件规则</div>'}</div>
                            <button type="button" onclick="addConditionRow()" style="margin-top: 8px; padding: 8px 16px; border: 1px dashed #4361ee; background: white; color: #4361ee; border-radius: 6px; cursor: pointer; font-size: 13px;">+ 添加条件</button>
                        </div>
                        
                        <div class="dlg-field">
                            <label class="dlg-label">默认值（无匹配时）</label>
                            <input type="text" id="logicDefaultResult" value="${escapeHtml(currentRule.defaultResult || '')}" placeholder="请输入默认值" class="dlg-input" />
                        </div>
                        
                        <div class="dlg-hint dlg-hint--info">
                            💡 根据其他字段的值动态计算结果。当所有条件都不满足时，使用默认值。
                        </div>
                        
                        <div class="dlg-footer">
                            <button class="dlg-btn dlg-btn--cancel" onclick="closeLogicRuleModal()">取消</button>
                            <button class="dlg-btn dlg-btn--primary" onclick="saveLogicRule(${targetIndex})">确定</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
        
        function closeLogicRuleModal(event) {
            if (event && event.target !== event.currentTarget) return;
            const modal = document.getElementById('logicRuleModalOverlay');
            if (modal) modal.remove();
        }
        
        function addConditionRow() {
            const container = document.getElementById('conditionsContainer');
            const sourceFields = previewData ? previewData.sourceHeaders : [];
            
            if (container.querySelector('.dlg-condition-empty')) {
                container.innerHTML = '';
            }
            
            const row = document.createElement('div');
            row.className = 'dlg-condition-row';
            row.innerHTML = `
                <span style="color: #666; font-size: 13px;">如果</span>
                <select class="condition-source dlg-input" style="flex: 1; padding: 6px 8px;">
                    ${sourceFields.map((f, i) => `<option value="${i}">${escapeHtml(f)}</option>`).join('')}
                </select>
                <select class="condition-operator" style="width: 60px; padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px;">
                    <option value=">">></option>
                    <option value=">=">>=</option>
                    <option value="<"><</option>
                    <option value="<="><=</option>
                    <option value=">==</option>
                    <option value="!=">!=</option>
                    <option value="contains">包含</option>
                </select>
                <input type="text" class="condition-value" placeholder="值" style="width: 100px; padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px;" />
                <span style="color: #666; font-size: 13px;">则</span>
                <input type="text" class="condition-result" placeholder="结果" style="width: 100px; padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px;" />
                <button type="button" onclick="this.closest('.dlg-condition-row').remove()" class="dlg-condition-del">×</button>
            `;
            container.appendChild(row);
        }
        
        function saveLogicRule(targetIndex) {
            const container = document.getElementById('conditionsContainer');
            const conditionRows = container.querySelectorAll('.dlg-condition-row');
            const conditions = [];
            
            conditionRows.forEach(row => {
                const sourceIndex = parseInt(row.querySelector('.condition-source').value);
                const operator = row.querySelector('.condition-operator').value;
                const value = row.querySelector('.condition-value').value.trim();
                const result = row.querySelector('.condition-result').value.trim();
                
                if (value && result) {
                    conditions.push({ sourceIndex, operator, value, result });
                }
            });
            
            const defaultResult = document.getElementById('logicDefaultResult').value.trim();
            
            if (conditions.length === 0 && !defaultResult) {
                alert('请至少添加一条条件规则或设置默认值');
                return;
            }
            
            if (manualMappings.some(m => m.target === targetIndex)) {
                if (!confirm('该字段已有映射关系，设置逻辑规则将移除映射。确定继续？')) {
                    return;
                }
                removeMapping(targetIndex);
            }
            
            delete defaultValues[targetIndex];
            
            if (conditions.length > 0 || defaultResult) {
                logicRules[targetIndex] = { conditions, defaultResult };
            } else {
                delete logicRules[targetIndex];
            }
            
            closeLogicRuleModal();
            renderTargetFields({ headers: previewData.targetHeaders });
            drawMappings();
            updateStats();
            markConfigDirty();
        }
        
        function clearDefaultValueOrLogic(targetIndex) {
            if (!confirm('确定要清除该字段的默认值/逻辑规则吗？')) {
                return;
            }
            delete defaultValues[targetIndex];
            delete logicRules[targetIndex];
            
            // 关闭右键菜单
            if (contextMenu) {
                contextMenu.remove();
                contextMenu = null;
            }
            
            renderTargetFields({ headers: previewData.targetHeaders });
            drawMappings();
            updateStats();
            markConfigDirty();
        }
        
        function removeMapping(targetIndex) {
            const mapping = previewData.mappings.find(m => m.targetIndex === targetIndex);
            if (mapping) {
                removedMappings.push(mapping);
                
                const key = `${mapping.sourceIndex}_${targetIndex}`;
                delete valueTransformRules[key];
                
                const sourceEl = fieldElements.source[mapping.sourceIndex];
                if (sourceEl) {
                    const indicator = sourceEl.querySelector('.transform-indicator');
                    if (indicator) indicator.remove();
                }
            }
            
            const manualIdx = manualMappings.findIndex(m => m.target === targetIndex);
            if (manualIdx >= 0) {
                const manual = manualMappings[manualIdx];
                const key = `${manual.source}_${targetIndex}`;
                delete valueTransformRules[key];
                
                const sourceEl = fieldElements.source[manual.source];
                if (sourceEl) {
                    const indicator = sourceEl.querySelector('.transform-indicator');
                    if (indicator) indicator.remove();
                }
                
                manualMappings.splice(manualIdx, 1);
            }
            
            updateMappingDisplay();
            updateStats();
            drawMappings();
            updateSteps();
            markConfigDirty();
        }
        
        function updateStats() {
            if (!previewData) return;
            
            const mappedCount = (previewData.mappings || []).filter(m =>
                !removedMappings.some(r => r.targetIndex === m.targetIndex) && m.matchType !== 'manual'
            ).length + manualMappings.length;
            
            const missingCount = (previewData.missingFields || []).length - 
                manualMappings.filter(m => (previewData.missingFields || []).some(f => f.index === m.target)).length;
            
            // 计算已映射的必填字段数量（包括有默认值或逻辑规则的字段）
            let mappedRequiredCount = (previewData.mappings || []).filter(m => {
                if (removedMappings.some(r => r.targetIndex === m.targetIndex)) return false;
                if (m.matchType === 'manual') return false;
                const header = previewData.targetHeaders[m.targetIndex];
                return header && header.includes('*');
            }).length + manualMappings.filter(m => {
                const header = previewData.targetHeaders[m.target];
                return header && header.includes('*');
            }).length;
            
            // 加上有默认值的必填字段
            Object.keys(defaultValues).forEach(idx => {
                const header = previewData.targetHeaders[idx];
                if (header && header.includes('*')) {
                    mappedRequiredCount++;
                }
            });
            
            // 加上有逻辑规则的必填字段（避免重复计算）
            Object.keys(logicRules).forEach(idx => {
                const header = previewData.targetHeaders[idx];
                if (header && header.includes('*') && defaultValues[idx] === undefined && defaultValues[String(idx)] === undefined) {
                    mappedRequiredCount++;
                }
            });
            
            const totalRequiredCount = previewData.targetHeaders.filter(h => h && h.includes('*')).length;
            const requiredMissing = totalRequiredCount - mappedRequiredCount;
            
            document.getElementById('totalFields').textContent = previewData.targetHeaders.filter(h => h).length;
            document.getElementById('mappedFields').textContent = mappedCount;
            
            const requiredMissingElement = document.getElementById('requiredMissing');
            const requiredMissingValue = Math.max(0, requiredMissing);
            requiredMissingElement.textContent = requiredMissingValue;
            
            requiredMissingElement.className = 'value';
            if (requiredMissingValue === 0) {
                requiredMissingElement.classList.add('zero');
            } else {
                requiredMissingElement.classList.add('non-zero');
            }
            
            if (previewData.sourceHeaders) {
                document.getElementById('sourceFieldCount').textContent = previewData.sourceHeaders.filter(h => h).length;
                document.getElementById('sourceMappedCount').textContent = mappedCount;
            }
        }
        
        function drawMappings() {
            if (!previewData) return;
            
            const canvas = document.getElementById('mappingCanvas');
            const mappingArea = document.getElementById('mappingArea');
            const mainContent = document.getElementById('mainContent');
            
            if (!canvas || !mappingArea || !mainContent) return;
            
            const containerRect = mainContent.getBoundingClientRect();
            const mappingRect = mappingArea.getBoundingClientRect();
            
            canvas.style.width = containerRect.width + 'px';
            canvas.style.height = containerRect.height + 'px';
            canvas.style.left = '0px';
            canvas.style.top = '0px';
            canvas.innerHTML = '';
            
            const showHigh = true;
            const showMedium = true;
            const showLow = true;
            const showManual = true;
            
            document.querySelectorAll('.connection-point').forEach(p => p.classList.remove('connected'));
            
            (previewData.mappings || []).forEach(mapping => {
                if (removedMappings.some(r => r.targetIndex === mapping.targetIndex)) {
                    return;
                }
                if (manualMappings.some(m => m.target === mapping.targetIndex)) {
                    return;
                }
                
                let showLine = false;
                let lineClass = '';
                
                // 🔵 蓝色 = 手动映射（matchType === 'manual'）在后面单独处理
                // 🟢 绿色（高置信度）= score = 100
                // 🟠 橙色（中置信度）= score >= 80
                // 🔴 红色（低置信度）= score < 80
                
                if (mapping.score === 100) {
                    showLine = true;
                    lineClass = 'high';
                } else if (mapping.score >= 80) {
                    showLine = true;
                    lineClass = 'medium';
                } else {
                    showLine = true;
                    lineClass = 'low';
                }
                
                if (showLine) {
                    drawLine(mapping.sourceIndex, mapping.targetIndex, lineClass, mapping.score, mappingRect, containerRect);
                }
            });
            
            manualMappings.forEach(mapping => {
                drawLine(mapping.source, mapping.target, 'manual', null, mappingRect, containerRect);
            });
            
            // 添加双击画布空白区域无操作的提示
            canvas.ondblclick = function(e) {
                const btnDiv = e.target.closest('[data-source-idx]');
                if (!btnDiv) {
                    // 点击的是空白区域
                    e.stopPropagation();
                }
            };
            
            canvas.onclick = function(e) {
                const btnDiv = e.target.closest('[data-source-idx]');
                if (btnDiv) {
                    const sourceIdx = parseInt(btnDiv.dataset.sourceIdx);
                    const targetIdx = parseInt(btnDiv.dataset.targetIdx);
                    openValueTransformModal(sourceIdx, targetIdx);
                }
            };
        }
        
        function drawLine(sourceIdx, targetIdx, lineClass, score, mappingRect, containerRect) {
            const canvas = document.getElementById('mappingCanvas');
            
            const sourceEl = fieldElements.source[sourceIdx];
            const targetEl = fieldElements.target[targetIdx];
            
            if (!sourceEl || !targetEl) return;
            
            const sourceRect = sourceEl.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();
            
            const x1 = sourceRect.right - containerRect.left;
            const y1 = sourceRect.top + sourceRect.height / 2 - containerRect.top;
            const x2 = targetRect.left - containerRect.left;
            const y2 = targetRect.top + targetRect.height / 2 - containerRect.top;
            
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            
            const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            hitPath.setAttribute('d', `M ${x1} ${y1} C ${(x1 + x2) * 0.3} ${y1}, ${(x1 + x2) * 0.7} ${y2}, ${x2} ${y2}`);
            hitPath.setAttribute('class', `mapping-line-hit`);
            hitPath.style.stroke = 'transparent';
            hitPath.style.strokeWidth = '20';
            hitPath.style.fill = 'none';
            hitPath.style.pointerEvents = 'stroke';
            hitPath.style.cursor = 'pointer';
            hitPath.dataset.targetIndex = targetIdx;
            hitPath.dataset.sourceIdx = sourceIdx;
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M ${x1} ${y1} C ${(x1 + x2) * 0.3} ${y1}, ${(x1 + x2) * 0.7} ${y2}, ${x2} ${y2}`);
            path.setAttribute('class', `mapping-line ${lineClass}`);
            // 直接设置颜色和样式（SVG 的 CSS 类可能不生效）
            if (lineClass === 'high') {
                path.setAttribute('stroke', '#4CAF50'); // 绿色
                path.setAttribute('stroke-width', '3');
                path.setAttribute('stroke-dasharray', '');
            } else if (lineClass === 'medium') {
                path.setAttribute('stroke', '#FF9800'); // 橙色
                path.setAttribute('stroke-width', '2');
                path.setAttribute('stroke-dasharray', '5,5');
            } else if (lineClass === 'low') {
                path.setAttribute('stroke', '#F44336'); // 红色
                path.setAttribute('stroke-width', '2');
                path.setAttribute('stroke-dasharray', '2,2');
            } else if (lineClass === 'manual') {
                path.setAttribute('stroke', '#2196f3'); // 蓝色
                path.setAttribute('stroke-width', '3');
                path.setAttribute('stroke-dasharray', '');
            }
            path.style.pointerEvents = 'none';
            path.dataset.targetIndex = targetIdx;
            path.dataset.sourceIdx = sourceIdx;
            path.dataset.midX = midX;
            path.dataset.midY = midY;
            canvas.appendChild(path);
            
            const lineStartX = x1;
            const lineStartY = y1;
            const lineEndX = x2;
            const lineEndY = y2;
            const endpointThreshold = 35;
            
            hitPath.addEventListener('mousemove', (e) => {
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                const distToStart = Math.sqrt(Math.pow(mouseX - lineStartX, 2) + Math.pow(mouseY - lineStartY, 2));
                const distToEnd = Math.sqrt(Math.pow(mouseX - lineEndX, 2) + Math.pow(mouseY - lineEndY, 2));
                
                if (distToStart < endpointThreshold || distToEnd < endpointThreshold) {
                    path.style.strokeWidth = '2';
                    sourceEl.style.transform = 'translateX(0)';
                    targetEl.style.transform = 'translateX(0)';
                    hitPath.style.cursor = 'default';
                } else {
                    path.style.strokeWidth = '4';
                    sourceEl.style.transform = 'translateX(10px)';
                    targetEl.style.transform = 'translateX(-10px)';
                    hitPath.style.cursor = 'pointer';
                }
            });
            
            hitPath.addEventListener('mouseleave', () => {
                path.style.strokeWidth = '2';
                sourceEl.style.transform = 'translateX(0)';
                targetEl.style.transform = 'translateX(0)';
            });
            
            hitPath.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            
            // 双击删除连线
            hitPath.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const sourceField = previewData.sourceHeaders[sourceIdx];
                const targetField = previewData.targetHeaders[targetIdx];
                
                if (confirm(`确定要删除这条映射关系吗？\n\n源字段：${sourceField}\n目标字段：${targetField}`)) {
                    removeMapping(targetIdx);
                }
            });
            
            canvas.appendChild(hitPath);
            
            const foreignObj = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
            foreignObj.setAttribute('x', midX - 35);
            foreignObj.setAttribute('y', midY - 18);
            foreignObj.setAttribute('width', '70');
            foreignObj.setAttribute('height', '36');
            foreignObj.style.pointerEvents = 'none';
            
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:4px;pointer-events:auto;';
            
            const btnDiv = document.createElement('div');
            btnDiv.style.cssText = 'width:28px;height:28px;background:white;border:2px solid #667eea;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;transition:all 0.3s ease;';
            btnDiv.textContent = '⚙';
            btnDiv.dataset.sourceIdx = sourceIdx;
            btnDiv.dataset.targetIdx = targetIdx;
            btnDiv.title = '编辑转换规则';
            
            btnDiv.addEventListener('mouseenter', () => {
                btnDiv.style.transform = 'scale(1.1)';
                btnDiv.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
            });

            btnDiv.addEventListener('mouseleave', () => {
                btnDiv.style.transform = 'scale(1)';
                btnDiv.style.boxShadow = 'none';
            });

            btnDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                const sourceIdx = parseInt(btnDiv.dataset.sourceIdx);
                const targetIdx = parseInt(btnDiv.dataset.targetIdx);
                openValueTransformModal(sourceIdx, targetIdx);
            });

            const deleteBtn = document.createElement('div');
            deleteBtn.style.cssText = 'width:28px;height:28px;background:white;border:2px solid #e74c3c;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;color:#e74c3c;transition:all 0.3s ease;';
            deleteBtn.textContent = '×';
            deleteBtn.dataset.targetIdx = targetIdx;
            deleteBtn.title = '删除映射';
            
            deleteBtn.addEventListener('mouseenter', () => {
                deleteBtn.style.transform = 'scale(1.1)';
                deleteBtn.style.boxShadow = '0 4px 12px rgba(231, 76, 60, 0.4)';
                deleteBtn.style.background = '#e74c3c';
                deleteBtn.style.color = 'white';
            });

            deleteBtn.addEventListener('mouseleave', () => {
                deleteBtn.style.transform = 'scale(1)';
                deleteBtn.style.boxShadow = 'none';
                deleteBtn.style.background = 'white';
                deleteBtn.style.color = '#e74c3c';
            });

            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('确定要删除这条映射关系吗？')) {
                    removeMapping(parseInt(deleteBtn.dataset.targetIdx));
                }
            });

            btnContainer.appendChild(btnDiv);
            btnContainer.appendChild(deleteBtn);
            foreignObj.appendChild(btnContainer);
            canvas.appendChild(foreignObj);
            
            if (score !== null) {
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', midX);
                text.setAttribute('y', midY - 25);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('class', 'line-label');
                text.textContent = score === 100 ? '高' : score >= 80 ? '中' : '低';
                text.style.fontWeight = '600';
                canvas.appendChild(text);
            }
            
            const sourcePoint = sourceEl.querySelector('.connection-point');
            const targetPoint = targetEl.querySelector('.connection-point');
            if (sourcePoint) sourcePoint.classList.add('connected');
            if (targetPoint) targetPoint.classList.add('connected');
        }
        
        function cancelTransform() {
            if (confirm('确定要取消转换吗？')) {
                fetch('/api/cancel', { method: 'POST' })
                    .then(() => {
                        showResult('已取消', '转换已取消。');
                    });
            }
        }
        
        function checkConfigHasChanges() {
            if (!currentLoadedConfig) {
                return manualMappings.length > 0 || Object.keys(valueTransformRules).length > 0;
            }
            
            try {
                const currentMappings = JSON.stringify([...manualMappings].sort((a, b) => (a.target || 0) - (b.target || 0)));
                const savedMappings = JSON.stringify([...(currentLoadedConfig.manualMappings || [])].sort((a, b) => (a.target || 0) - (b.target || 0)));
                
                const currentRules = JSON.stringify(valueTransformRules);
                const savedRules = JSON.stringify(currentLoadedConfig.valueTransformRules || {});
                
                return currentMappings !== savedMappings || currentRules !== savedRules;
            } catch (e) {
                console.error('checkConfigHasChanges error:', e);
                return true;
            }
        }
        
        function confirmTransform() {
            try {
                if (checkConfigHasChanges()) {
                    document.getElementById('confirmMessage').innerHTML = 
                        '⚠️ 检测到配置有未保存的更改，是否在转换前保存配置？<br><br>选择"保存并转换"将保存当前配置后继续转换；<br>选择"直接转换"将不保存配置直接转换；<br>选择"取消"返回继续编辑。';
                    document.getElementById('confirmSaveBtn').style.display = 'inline-block';
                    document.getElementById('confirmDirectBtn').textContent = '直接转换';
                } else {
                    // 重新计算必填字段映射情况
                    const mappedTargetIndices = new Set();
                    (previewData.mappings || []).forEach(m => {
                        if (!removedMappings.some(r => r.targetIndex === m.targetIndex)) {
                            mappedTargetIndices.add(m.targetIndex);
                        }
                    });
                    manualMappings.forEach(m => mappedTargetIndices.add(m.target));
                    
                    let requiredMissing = 0;
                    document.querySelectorAll('.target-panel .field-item').forEach(el => {
                        if (el.dataset.isRequired === 'true' && !mappedTargetIndices.has(parseInt(el.dataset.index))) {
                            requiredMissing++;
                        }
                    });
                    
                    if (requiredMissing > 0) {
                        document.getElementById('confirmMessage').textContent = 
                            `⚠️ 警告：仍有 ${requiredMissing} 个必填字段缺失，转换结果可能不完整。是否继续？`;
                    } else {
                        document.getElementById('confirmMessage').textContent = 
                            '所有必填字段均已映射，即将执行数据转换。';
                    }
                    document.getElementById('confirmSaveBtn').style.display = 'none';
                    document.getElementById('confirmDirectBtn').textContent = '确认执行';
                }
                document.getElementById('confirmModal').classList.add('show');
            } catch (e) {
                console.error('confirmTransform error:', e);
                alert('操作失败：' + e.message);
            }
        }
        
        function closeModal() {
            document.getElementById('confirmModal').classList.remove('show');
        }
        
        function saveAndTransform() {
            closeModal();
            openSaveConfigModal(true);
        }
        
        function executeTransform() {
            closeModal();
            
            const cleanedRules = {};
            Object.keys(valueTransformRules).forEach(key => {
                const rules = valueTransformRules[key].filter(r => {
                    switch (r.type) {
                        case 'simple':
                            return r.source && r.source.trim() !== '' && r.target && r.target.trim() !== '';
                        case 'string':
                            return r.operation;
                        case 'date':
                            return r.targetFormat && r.targetFormat.trim() !== '';
                        case 'number':
                            return r.operation;
                        case 'logic':
                            return r.expression && r.expression.trim() !== '';
                        default:
                            return false;
                    }
                });
                if (rules.length > 0) {
                    cleanedRules[key] = rules;
                }
            });
            
            const loading = showLoading('正在执行数据转换，请稍候...');
            
            fetch('/api/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    manualMappings: manualMappings,
                    removedMappings: removedMappings,
                    valueTransformRules: cleanedRules,
                    configName: currentLoadedConfig ? currentLoadedConfig.name : null,
                    filterConfig: window.filterConfig || null
                })
            })
            .then(response => response.json())
            .then(data => {
                hideLoading(loading);
                if (data.success) {
                    const byteCharacters = atob(data.fileData);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = data.fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    if (data.transformErrors && data.transformErrors.length > 0) {
                        const errorDetails = data.transformErrors.slice(0, 5).map(e => {
                            const type = e.type || 'unknown';
                            const pattern = e.pattern || '';
                            const errorMsg = e.error || '未知错误';
                            return `• ${type === 'extract' ? '正则提取' : type === 'replace' ? '正则替换' : type}: ${pattern} - ${errorMsg}`;
                        }).join('\n');
                        const moreErrors = data.transformErrors.length > 5 ? `\n...还有 ${data.transformErrors.length - 5} 个错误` : '';
                        showSuccess(`成功转换 ${data.dataRowCount} 行数据！`);
                        showResult('⚠️ 转换完成（有警告）', 
                            `成功转换 ${data.dataRowCount} 行数据\n文件名: ${data.fileName}\n文件大小: ${data.fileSize}\n\n以下转换规则执行失败：\n${errorDetails}${moreErrors}`);
                    } else {
                        showSuccess(`成功转换 ${data.dataRowCount} 行数据！`);
                        showResult('✅ 转换完成', 
                            `成功转换 ${data.dataRowCount} 行数据\n文件名: ${data.fileName}\n文件大小: ${data.fileSize}`);
                    }
                    const step4 = document.getElementById('step4');
                    step4.classList.add('completed');
                } else {
                    showError(data.error || '转换失败');
                    showResult('❌ 转换失败', data.error || '未知错误');
                }
            })
            .catch(error => {
                hideLoading(loading);
                showError('请求失败: ' + error.message);
                showResult('❌ 请求失败', error.message);
            });
        }
        
        function showResult(title, message) {
            document.getElementById('resultTitle').textContent = title;
            document.getElementById('resultMessage').textContent = message;
            document.getElementById('resultModal').classList.add('show');
        }
        
        function closeResultModal() {
            document.getElementById('resultModal').classList.remove('show');
        }
        
        const CONFIG_STORAGE_KEY = 'excel_transform_configs';
        
        function getConfigs() {
            try {
                const data = localStorage.getItem(CONFIG_STORAGE_KEY);
                return data ? JSON.parse(data) : [];
            } catch (e) {
                return [];
            }
        }
        
        function saveConfigs(configs) {
            try {
                localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configs));
                return true;
            } catch (e) {
                console.error('保存配置失败:', e);
                return false;
            }
        }
        
        let pendingTransformAfterSave = false;
        
        function openSaveConfigModal(transformAfterSave = false) {
            pendingTransformAfterSave = transformAfterSave;
            
            // 先检查必填字段映射情况
            if (previewData) {
                const mappedTargetIndices = new Set();
                (previewData.mappings || []).forEach(m => {
                    if (!removedMappings.some(r => r.targetIndex === m.targetIndex)) {
                        mappedTargetIndices.add(m.targetIndex);
                    }
                });
                manualMappings.forEach(m => mappedTargetIndices.add(m.target));
                
                // 添加有默认值或逻辑规则的字段
                Object.keys(defaultValues).forEach(idx => mappedTargetIndices.add(parseInt(idx)));
                Object.keys(logicRules).forEach(idx => mappedTargetIndices.add(parseInt(idx)));
                
                let unmappedRequiredCount = 0;
                document.querySelectorAll('.target-panel .field-item').forEach(el => {
                    if (el.dataset.isRequired === 'true' && !mappedTargetIndices.has(parseInt(el.dataset.index))) {
                        unmappedRequiredCount++;
                    }
                });
                
                if (unmappedRequiredCount > 0) {
                    if (!confirm(`当前还有 ${unmappedRequiredCount} 个必填字段未映射或设置默认值/逻辑规则，您确认要保存么？`)) {
                        return;
                    }
                }
            }
            
            if (currentLoadedConfig) {
                document.getElementById('configName').value = currentLoadedConfig.name;
            } else {
                document.getElementById('configName').value = '';
            }
            document.getElementById('saveConfigModal').classList.add('show');
            document.getElementById('configName').focus();
            checkConfigName();
        }
        
        function closeSaveConfigModal() {
            document.getElementById('saveConfigModal').classList.remove('show');
            pendingTransformAfterSave = false;
        }
        
        function checkConfigName() {
            const name = document.getElementById('configName').value.trim();
            const hint = document.getElementById('configNameHint');
            const configs = getConfigs();

            const existingConfig = configs.find(c => c.name === name);

            if (name && existingConfig) {
                hint.innerHTML = `<span style="color: #e67e22;">⚠️ 配置 "${name}" 已存在，点击保存将覆盖原配置</span>`;
            } else if (name) {
                hint.innerHTML = `<span style="color: #27ae60;">✓ 新配置</span>`;
            } else {
                hint.innerHTML = '';
            }
        }
        
        function saveConfig() {
            const name = document.getElementById('configName').value.trim();
            if (!name) {
                alert('请输入配置名称');
                return;
            }
            
            if (!previewData) {
                alert('请先完成字段映射');
                return;
            }
            
            const configs = getConfigs();
            const existingConfig = configs.find(c => c.name === name);
            
            if (existingConfig) {
                doSaveConfig(name, existingConfig.id);
            } else {
                doSaveConfig(name, null);
            }
        }
        
        function doSaveConfig(name, existingId) {
            if (!name) {
                alert('配置名称不能为空');
                return;
            }
            
            const finalMappings = [];
            
            (previewData.mappings || [])
                .filter(m => !removedMappings.some(r => r.targetIndex === m.targetIndex))
                .filter(m => !manualMappings.some(mm => mm.target === m.targetIndex))
                .forEach(m => {
                    finalMappings.push({
                        sourceIndex: m.sourceIndex,
                        targetIndex: m.targetIndex,
                        sourceField: m.sourceField || previewData.sourceHeaders[m.sourceIndex],
                        targetField: m.targetField || previewData.targetHeaders[m.targetIndex],
                        score: m.score,
                        matchType: m.matchType || 'text'
                    });
                });
            
            manualMappings.forEach(m => {
                finalMappings.push({
                    sourceIndex: m.source,
                    targetIndex: m.target,
                    sourceField: m.sourceField || previewData.sourceHeaders[m.source],
                    targetField: m.targetField || previewData.targetHeaders[m.target],
                    score: 100,
                    matchType: 'manual'
                });
            });
            
            // 过滤掉空数组和无效规则
            const cleanedValueTransformRules = {};
            Object.keys(valueTransformRules).forEach(key => {
                const rules = valueTransformRules[key];
                const validRules = rules ? rules.filter(isValidTransformRule) : [];
                if (validRules.length > 0) {
                    cleanedValueTransformRules[key] = validRules;
                }
            });
            
            // 获取筛选配置
            const currentFilterConfig = window.filterConfig || null;
            
            const config = {
                id: existingId || Date.now(),
                name: name,
                createdAt: new Date().toISOString(),
                sourceHeaders: previewData.sourceHeaders,
                targetHeaders: previewData.targetHeaders,
                mappings: finalMappings,
                valueTransformRules: cleanedValueTransformRules,
                defaultValues: defaultValues,
                logicRules: logicRules,
                filterConfig: currentFilterConfig
            };
            
            const configs = getConfigs();
            const existingIndex = configs.findIndex(c => c.name === name);
            if (existingIndex >= 0) {
                configs[existingIndex] = config;
            } else {
                configs.unshift(config);
            }
            
            if (saveConfigs(configs)) {
                currentLoadedConfig = config;
                showSuccess(`配置 "${name}" 保存成功！`);
                
                // 保存 pendingTransformAfterSave 的值，因为 closeSaveConfigModal 会重置它
                const shouldTransform = pendingTransformAfterSave;
                
                closeSaveConfigModal();
                
                // 刷新配置列表
                renderConfigList();
                
                // 设置选中刚保存的配置
                const selectEl = document.getElementById('configSelect');
                selectEl.value = String(config.id);
                updateConfigInfoBar();
                updateConfigButtons(true);
                
                loadConfig(config.id);
                
                updateSteps();
                markConfigSaved();
                
                if (shouldTransform) {
                    setTimeout(() => executeTransform(), 100);
                }
            } else {
                alert('配置保存失败，请重试');
            }
        }
        
        function openLoadConfigModal() {
            renderConfigList();
            document.getElementById('loadConfigModal').classList.add('show');
        }
        
        function closeLoadConfigModal() {
            document.getElementById('loadConfigModal').classList.remove('show');
        }
        
        let isNewConfig = false;
        
        function showAddConfigModal() {
            isNewConfig = true;
            document.getElementById('addConfigModal').classList.add('show');
            document.getElementById('newConfigName').focus();
        }
        
        function closeAddConfigModal() {
            isNewConfig = false;
            document.getElementById('addConfigModal').classList.remove('show');
        }
        
        function saveNewConfig() {
            const configName = document.getElementById('newConfigName').value.trim();
            if (!configName) {
                alert('请输入配置名称');
                return;
            }
            
            if (!isNewConfig && previewData) {
                const mappedTargetIndices = new Set();
                (previewData.mappings || []).forEach(m => {
                    if (!removedMappings.some(r => r.targetIndex === m.targetIndex)) {
                        mappedTargetIndices.add(m.targetIndex);
                    }
                });
                manualMappings.forEach(m => mappedTargetIndices.add(m.target));
                
                // 添加有默认值或逻辑规则的字段
                Object.keys(defaultValues).forEach(idx => mappedTargetIndices.add(parseInt(idx)));
                Object.keys(logicRules).forEach(idx => mappedTargetIndices.add(parseInt(idx)));
                
                let unmappedRequiredCount = 0;
                document.querySelectorAll('.target-panel .field-item').forEach(el => {
                    if (el.dataset.isRequired === 'true' && !mappedTargetIndices.has(parseInt(el.dataset.index))) {
                        unmappedRequiredCount++;
                    }
                });
                
                if (unmappedRequiredCount > 0) {
                    if (!confirm(`当前还有 ${unmappedRequiredCount} 个必填字段未映射或设置默认值/逻辑规则，您确认要保存么？`)) {
                        return;
                    }
                }
            }
            
            isNewConfig = false;
            
            const newConfig = {
                id: Date.now(),
                name: configName,
                createdAt: new Date().toISOString(),
                sourceHeaders: previewData.sourceHeaders,
                targetHeaders: previewData.targetHeaders,
                mappings: previewData.mappings,
                manualMappings: manualMappings,
                valueTransformRules: valueTransformRules
            };
            const configs = getConfigs();
            configs.unshift(newConfig);
            saveConfigs(configs);
            renderConfigList();
            
            loadConfig(newConfig.id);
            
            closeAddConfigModal();
        }
        
        function renderConfigList() {
            let configs = getConfigs();
            const selectEl = document.getElementById('configSelect');
            const infoBar = document.getElementById('configInfoBar');
            
            const originalOnChange = selectEl.onchange;
            selectEl.onchange = null;
            
            selectEl.innerHTML = '<option value="">-- 选择配置 --</option>';
            
            if (configs.length === 0) {
                infoBar.classList.remove('visible');
                updateConfigButtons(false);
                selectEl.onchange = originalOnChange;
                return;
            }
            
            if (previewData) {
                configs = configs.sort((a, b) => {
                    const aSourceMatch = calculateMatchScore(a.sourceHeaders, previewData.sourceHeaders);
                    const aTargetMatch = calculateMatchScore(a.targetHeaders, previewData.targetHeaders);
                    const aTotalMatch = (aSourceMatch + aTargetMatch) / 2;
                    
                    const bSourceMatch = calculateMatchScore(b.sourceHeaders, previewData.sourceHeaders);
                    const bTargetMatch = calculateMatchScore(b.targetHeaders, previewData.targetHeaders);
                    const bTotalMatch = (bSourceMatch + bTargetMatch) / 2;
                    
                    if (aTotalMatch !== bTotalMatch) {
                        return bTotalMatch - aTotalMatch;
                    }
                    
                    return new Date(b.createdAt) - new Date(a.createdAt);
                });
            } else {
                configs = configs.sort((a, b) => {
                    return new Date(b.createdAt) - new Date(a.createdAt);
                });
            }
            
            configs.forEach(config => {
                const option = document.createElement('option');
                option.value = String(config.id);
                option.textContent = config.name;
                if (currentLoadedConfig && String(currentLoadedConfig.id) === String(config.id)) {
                    option.selected = true;
                }
                selectEl.appendChild(option);
            });
            
            selectEl.onchange = originalOnChange;
            updateConfigInfoBar();
        }
        
        function onConfigSelectChange() {
            const selectEl = document.getElementById('configSelect');
            const configId = parseInt(selectEl.value);
            
            if (!configId) {
                currentLoadedConfig = null;
                updateConfigInfoBar();
                updateConfigButtons(false);
                return;
            }
            
            loadConfig(configId);
        }
        
        function updateConfigInfoBar() {
            const infoBar = document.getElementById('configInfoBar');
            const selectEl = document.getElementById('configSelect');
            const configId = parseInt(selectEl.value);
            
            if (!configId) {
                infoBar.classList.remove('visible');
                return;
            }
            
            const configs = getConfigs();
            const config = configs.find(c => c.id === configId);
            
            if (!config) {
                infoBar.classList.remove('visible');
                return;
            }
            
            const date = new Date(config.createdAt).toLocaleString('zh-CN');

            infoBar.innerHTML = `📅 ${escapeHtml(date)} | 源字段: ${config.sourceHeaders.length} | 目标字段: ${config.targetHeaders.length}`;
            infoBar.classList.add('visible');
        }
        
        function updateConfigButtons(hasConfig) {
            // 导出和删除按钮已移除，使用配置管理界面统一管理
            // const exportConfigBtn = document.getElementById('exportConfigBtn');
            // const deleteConfigBtn = document.getElementById('deleteConfigBtn');
            // if (exportConfigBtn) exportConfigBtn.disabled = !hasConfig;
            // if (deleteConfigBtn) deleteConfigBtn.disabled = !hasConfig;
        }
        
        function exportCurrentConfig() {
            const selectEl = document.getElementById('configSelect');
            const configId = parseInt(selectEl.value);
            if (configId) {
                exportConfig(configId);
            }
        }
        
        function deleteCurrentConfig() {
            const selectEl = document.getElementById('configSelect');
            const configId = parseInt(selectEl.value);
            if (configId) {
                deleteConfig(configId);
            }
        }
        
        function loadConfig(configId) {
            const configs = getConfigs();
            const configIdNum = typeof configId === 'string' ? parseInt(configId) : configId;
            const config = configs.find(c => c.id === configIdNum || c.id === configId);
            
            if (!config) {
                alert('配置不存在');
                return;
            }
            
            if (!sourceFile || !targetFile) {
                alert('请先上传源文件和目标模板');
                return;
            }
            
            const sourceMatch = calculateMatchScore(config.sourceHeaders, previewData.sourceHeaders);
            const targetMatch = calculateMatchScore(config.targetHeaders, previewData.targetHeaders);
            
            if (sourceMatch < 0.7 || targetMatch < 0.7) {
                if (!confirm(`当前文件与配置的匹配度较低（源: ${Math.round(sourceMatch * 100)}%, 目标: ${Math.round(targetMatch * 100)}%），是否仍要应用？`)) {
                    return;
                }
            }
            
            // 兼容旧配置：如果有 manualMappings 字段，也一并处理
            const legacyManualMappings = (config.manualMappings || []).map(m => ({
                source: m.sourceIndex !== undefined ? m.sourceIndex : m.source,
                target: m.targetIndex !== undefined ? m.targetIndex : m.target,
                sourceField: m.sourceField,
                targetField: m.targetField
            }));
            
            // 合并手动映射（来自新配置的 mappings 和旧配置的 manualMappings）
            const allManualMappings = [
                ...(config.mappings || []).filter(m => m.matchType === 'manual').map(m => ({
                    source: m.sourceIndex,
                    target: m.targetIndex,
                    sourceField: m.sourceField,
                    targetField: m.targetField
                })),
                ...legacyManualMappings.filter(lm => !(config.mappings || []).some(m => m.targetIndex === lm.target && m.matchType === 'manual'))
            ];
            
            // 去重
            const seenTargets = new Set();
            manualMappings = allManualMappings.filter(m => {
                if (seenTargets.has(m.target)) return false;
                seenTargets.add(m.target);
                return true;
            });
            
            removedMappings = [];
            valueTransformRules = config.valueTransformRules || {};
            defaultValues = config.defaultValues || {};
            logicRules = config.logicRules || {};
            // 恢复筛选配置（仅保存数据，UI在预览弹窗中按需初始化）
            window.filterConfig = config.filterConfig || null;
            currentLoadedConfig = config;
            
            // 筛选面板已迁移至预览弹窗内，不再在主界面初始化
            // 当用户打开预览并点击"需要对数据进行筛选"时，会自动加载此配置
            
            // 更新 previewData.mappings 为配置的映射（保留原始 matchType）
            previewData.mappings = (config.mappings || []).map(m => ({
                ...m,
                matchType: m.matchType || 'text' // 保留原始 matchType
            }));
            
            // 重新渲染目标字段（应用默认值和逻辑规则的样式）
            renderTargetFields({ headers: previewData.targetHeaders });
            
            updateMappingDisplay();
            updateStats();
            drawMappings();
            
            Object.keys(valueTransformRules).forEach(key => {
                const [sourceIndex, targetIndex] = key.split('_').map(Number);
                updateFieldTransformIndicator(sourceIndex, targetIndex);
            });
            
            const selectEl = document.getElementById('configSelect');
            selectEl.value = String(configIdNum);
            updateConfigInfoBar();
            updateConfigButtons(true);
            
            closeLoadConfigModal();
            updateSteps();
            markConfigSaved();
            
            showSuccess(`配置 "${config.name}" 已应用！`);
        }
        
        function calculateMatchScore(headers1, headers2) {
            if (!headers1 || !headers2 || headers1.length === 0 || headers2.length === 0) return 0;
            
            const set1 = new Set(headers1.filter(h => h).map(h => h.toLowerCase()));
            const set2 = new Set(headers2.filter(h => h).map(h => h.toLowerCase()));
            
            let matchCount = 0;
            set1.forEach(h => {
                if (set2.has(h)) matchCount++;
            });
            
            return matchCount / Math.max(set1.size, set2.size);
        }
        
        function deleteConfig(configId) {
            if (!confirm('确定要删除此配置吗？')) return;
            
            const configs = getConfigs().filter(c => c.id !== configId);
            saveConfigs(configs);
            
            if (currentLoadedConfig && String(currentLoadedConfig.id) === String(configId)) {
                currentLoadedConfig = null;
            }
            
            renderConfigList();
            updateSteps();
            showSuccess('配置已删除');
        }
        
        function exportConfig(configId) {
            const configs = getConfigs();
            const config = configs.find(c => c.id === configId);
            
            if (!config) {
                alert('配置不存在');
                return;
            }
            
            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${config.name}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
        
        function importConfig() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const config = JSON.parse(event.target.result);
                        
                        if (!config.name || !config.mappings) {
                            showError('无效的配置文件');
                            return;
                        }
                        
                        config.id = Date.now();
                        config.createdAt = new Date().toISOString();
                        
                        const configs = getConfigs();
                        configs.unshift(config);
                        saveConfigs(configs);
                        
                        renderConfigList();
                        showSuccess('配置导入成功！');
                    } catch (err) {
                        showError('配置文件解析失败: ' + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        }
        
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', drawMappings);
        });
        
        window.addEventListener('resize', drawMappings);
        
        document.querySelectorAll('.table-container').forEach(container => {
            container.addEventListener('scroll', drawMappings);
        });
        
        setupDropZone('sourceDropZone', 'sourceFileInput', 'source');
        setupDropZone('targetDropZone', 'targetFileInput', 'target');
        
        renderConfigList();
        updateSteps();
        
        // 配置管理按钮事件
        document.getElementById('configManageBtn').addEventListener('click', openConfigManageModal);
        
        // ========== 配置管理功能 ==========
        
        // 打开配置管理弹窗
        function openConfigManageModal() {
            renderManageConfigList();
            document.getElementById('configManageModal').classList.add('show');
        }
        
        // 关闭配置管理弹窗
        function closeConfigManageModal() {
            document.getElementById('configManageModal').classList.remove('show');
        }
        
        // 渲染配置管理列表
        function renderManageConfigList() {
            const configs = getConfigs();
            const container = document.getElementById('manageConfigList');
            const countEl = document.getElementById('totalConfigCount');
            const exportBtn = document.getElementById('exportSelectedBtn');
            
            if (!container) {
                console.error('manageConfigList element not found');
                return;
            }
            
            countEl.textContent = configs.length;
            
            if (configs.length === 0) {
                container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">暂无保存的配置</p>';
                if (exportBtn) exportBtn.disabled = true;
                return;
            }
            
            if (exportBtn) exportBtn.disabled = false;
            
            let html = '';
            configs.forEach(config => {
                const date = new Date(config.createdAt).toLocaleString('zh-CN');
                const sourceCount = config.sourceHeaders ? config.sourceHeaders.length : 0;
                const targetCount = config.targetHeaders ? config.targetHeaders.length : 0;
                const mappingsCount = config.mappings ? config.mappings.length : 0;
                
                html += `
                    <div class="config-manage-item">
                        <label class="checkbox-label">
                            <input type="checkbox" class="config-checkbox" value="${config.id}" data-name="${escapeHtml(config.name)}">
                            <div class="config-info">
                                <div class="config-name">${escapeHtml(config.name)}</div>
                                <div class="config-meta">创建于 ${date}</div>
                            </div>
                        </label>
                        <div class="config-stats">
                            <span>源字段：${sourceCount}</span>
                            <span>目标字段：${targetCount}</span>
                            <span>映射：${mappingsCount}</span>
                        </div>
                        <button class="btn btn-danger btn-sm" onclick="deleteConfig(${config.id}, '${escapeHtml(config.name)}')" title="删除配置" style="margin-left: 15px; padding: 4px 12px; font-size: 12px;">
                            🗑️ 删除
                        </button>
                    </div>
                `;
            });
            
            container.innerHTML = html;
            
            // 监听复选框变化
            container.querySelectorAll('.config-checkbox').forEach(cb => {
                cb.addEventListener('change', updateExportButtonState);
            });
            
            updateExportButtonState();
        }
        
        // 全选/取消全选
        function toggleSelectAllConfigs() {
            const selectAll = document.getElementById('selectAllConfigs');
            const checkboxes = document.querySelectorAll('.config-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = selectAll.checked;
            });
            updateExportButtonState();
        }
        
        // 更新导出按钮状态
        function updateExportButtonState() {
            const checkboxes = document.querySelectorAll('.config-checkbox:checked');
            const exportBtn = document.getElementById('exportSelectedBtn');
            exportBtn.disabled = checkboxes.length === 0;
            exportBtn.textContent = checkboxes.length > 0 
                ? `📤 导出选中配置 (${checkboxes.length})` 
                : '📤 导出选中配置';
        }
        
        // 导出选中的配置
        function exportSelectedConfigs() {
            const checkboxes = document.querySelectorAll('.config-checkbox:checked');
            if (checkboxes.length === 0) {
                showError('请至少选择一个配置');
                return;
            }
            
            const configIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
            const allConfigs = getConfigs();
            const selectedConfigs = allConfigs.filter(c => configIds.includes(c.id));
            
            if (selectedConfigs.length === 0) {
                showError('未找到选中的配置');
                return;
            }
            
            // 生成文件名
            const now = new Date();
            const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
            const fileName = selectedConfigs.length === 1 
                ? `${selectedConfigs[0].name}.json`
                : `excel-transformer-configs_${dateStr}.json`;
            
            // 导出文件
            const blob = new Blob([JSON.stringify(selectedConfigs, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
            
            showSuccess(`成功导出 ${selectedConfigs.length} 个配置！`);
            closeConfigManageModal();
        }
        
        // 导入配置文件
        function importConfigsFile() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const importedConfigs = JSON.parse(event.target.result);
                        
                        // 确保是数组格式
                        const configsArray = Array.isArray(importedConfigs) 
                            ? importedConfigs 
                            : [importedConfigs];
                        
                        // 验证配置格式
                        const validConfigs = configsArray.filter(config => 
                            config.name && config.mappings && config.sourceHeaders && config.targetHeaders
                        );
                        
                        if (validConfigs.length === 0) {
                            showError('无效的配置文件格式');
                            return;
                        }
                        
                        // 检查是否有同名配置
                        const existingConfigs = getConfigs();
                        const existingNames = new Set(existingConfigs.map(c => c.name));
                        const conflicts = validConfigs.filter(c => existingNames.has(c.name));
                        
                        if (conflicts.length > 0) {
                            // 有冲突，询问用户
                            const conflictNames = conflicts.map(c => c.name).join(', ');
                            const message = `发现 ${conflicts.length} 个同名配置：${conflictNames}\n\n请选择处理方式：`;
                            
                            if (confirm(message + '\n\n点击"确定"覆盖现有配置\n点击"取消"跳过这些配置')) {
                                // 覆盖模式
                                handleImportConfigs(validConfigs, 'overwrite');
                            } else {
                                // 跳过冲突的配置
                                const nonConflictConfigs = validConfigs.filter(c => !existingNames.has(c.name));
                                if (nonConflictConfigs.length > 0) {
                                    handleImportConfigs(nonConflictConfigs, 'skip');
                                } else {
                                    showError('所有配置都已存在，已跳过导入');
                                }
                            }
                        } else {
                            // 没有冲突，直接导入
                            handleImportConfigs(validConfigs, 'new');
                        }
                    } catch (err) {
                        showError('配置文件解析失败：' + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        }
        
        // 处理导入配置
        function handleImportConfigs(configs, mode) {
            const existingConfigs = getConfigs();
            let importedCount = 0;
            let skippedCount = 0;
            let overwrittenCount = 0;
            
            configs.forEach(config => {
                const existingIndex = existingConfigs.findIndex(c => c.name === config.name);
                
                if (existingIndex >= 0) {
                    if (mode === 'overwrite') {
                        // 覆盖
                        config.id = existingConfigs[existingIndex].id; // 保持原 ID
                        config.createdAt = existingConfigs[existingIndex].createdAt;
                        existingConfigs[existingIndex] = config;
                        overwrittenCount++;
                        importedCount++;
                    } else {
                        // 跳过
                        skippedCount++;
                    }
                } else {
                    // 新配置
                    config.id = Date.now() + Math.random();
                    config.createdAt = new Date().toISOString();
                    existingConfigs.unshift(config);
                    importedCount++;
                }
            });
            
            saveConfigs(existingConfigs);
            renderConfigList();
            
            // 显示导入结果
            let message = `成功导入 ${importedCount} 个配置！`;
            if (skippedCount > 0) message += `\n跳过 ${skippedCount} 个配置`;
            if (overwrittenCount > 0) message += `\n覆盖 ${overwrittenCount} 个配置`;
            
            showSuccess(message);
            renderManageConfigList();
        }
        
        // 删除配置
        function deleteConfig(configId, configName) {
            const confirmed = confirm(`确定要删除配置 "${configName}" 吗？\n\n此操作不可恢复！`);
            
            if (!confirmed) {
                return;
            }
            
            const configs = getConfigs();
            const filteredConfigs = configs.filter(c => c.id !== configId);
            
            if (filteredConfigs.length === configs.length) {
                showError('未找到要删除的配置');
                return;
            }
            
            if (saveConfigs(filteredConfigs)) {
                // 如果删除的是当前加载的配置，清除当前配置
                if (currentLoadedConfig && currentLoadedConfig.id === configId) {
                    currentLoadedConfig = null;
                    const selectEl = document.getElementById('configSelect');
                    selectEl.value = '';
                    updateConfigInfoBar();
                    updateConfigButtons(false);
                }
                
                showSuccess(`配置 "${configName}" 已删除`);
                renderConfigList();
                renderManageConfigList();
            } else {
                showError('删除配置失败');
            }
        }
        
        // ========== 数据筛选功能 ==========
        
        // 切换筛选面板展开/收起
        function toggleFilterPanel() {
            const section = document.getElementById('filterSection');
            const content = section ? section.querySelector('.filter-section-content') : null;
            const icon = document.getElementById('filterCollapseIcon');
            const btn = document.getElementById('filterCollapseBtn');
            
            if (!section || !content) return;
            
            if (content.style.display === 'none') {
                // 展开
                content.style.display = 'block';
                if (icon) icon.textContent = '▼';
                if (btn) btn.title = '收起筛选面板';
            } else {
                // 收起
                content.style.display = 'none';
                if (icon) icon.textContent = '▲';
                if (btn) btn.title = '展开筛选面板';
            }
        }
        
        // ========== Day 7: 加载状态和错误提示组件 ==========
        
        // 全局加载指示器
        function showGlobalLoading(message = '加载中...') {
            const loading = document.createElement('div');
            loading.id = 'globalLoading';
            loading.className = 'global-loading';
            loading.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-message">${message}</div>
            `;
            document.body.appendChild(loading);
            return loading;
        }
        
        function hideGlobalLoading(loadingElement) {
            if (loadingElement && loadingElement.parentElement) {
                loadingElement.remove();
            }
        }
        
        // 错误提示组件 (Toast)
        class ErrorToast {
            static show(message, type = 'error', duration) {
                const toast = document.createElement('div');
                toast.className = `error-toast ${type}`;
                
                const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : '⚠️';
                
                // 使用常量或默认值
                const toastDuration = duration || DAY7_CONSTANTS.TOAST_DURATION[type] || DAY7_CONSTANTS.TOAST_DURATION.error;
                
                toast.innerHTML = `
                    <span class="toast-icon">${icon}</span>
                    <span class="toast-message">${message}</span>
                    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
                `;
                
                document.body.appendChild(toast);
                
                // 自动消失
                setTimeout(() => {
                    if (toast.parentElement) {
                        toast.remove();
                    }
                }, toastDuration);
                
                return toast;
            }
        }
        
        // 字段加载错误显示
        function showFieldLoadError(error) {
            const container = document.getElementById('filterPanelContainer');
            if (!container) return;
            
            const errorInfo = getDetailedErrorMessage(error);
            
            container.innerHTML = `
                <div class="field-load-error">
                    <div class="error-icon">⚠️</div>
                    <div class="error-title">${errorInfo.title}</div>
                    <div class="error-message">${errorInfo.message}</div>
                    <div class="error-suggestion">💡 ${errorInfo.suggestion}</div>
                    <button class="btn-retry" onclick="retryLoadSourceFields()">🔄 重试</button>
                </div>
            `;
        }
        
        // 重试加载字段列表
        async function retryLoadSourceFields() {
            const container = document.getElementById('filterPanelContainer');
            if (!container) return;
            
            // 清除错误显示
            container.innerHTML = '';
            
            // 重新加载
            const loaded = await loadSourceFields();
            if (loaded) {
                // 重新初始化筛选面板
                await initFilterPanel();
            } else {
                // 再次显示错误
                showFieldLoadError(new Error('加载失败'));
            }
        }
        
        // 详细错误信息映射
        function getDetailedErrorMessage(error) {
            const errorMap = {
                'Failed to fetch': {
                    title: '无法连接到服务器',
                    message: '请检查您的网络连接，或确认服务器是否正常运行',
                    suggestion: '刷新页面后重试'
                },
                'HTTP 400': {
                    title: '请求参数错误',
                    message: '筛选配置格式不正确',
                    suggestion: '检查筛选条件是否配置完整'
                },
                'HTTP 404': {
                    title: '接口不存在',
                    message: '服务器未找到对应的接口',
                    suggestion: '请联系管理员'
                },
                'HTTP 500': {
                    title: '服务器错误',
                    message: '服务器内部错误',
                    suggestion: '请稍后重试'
                },
                'HTTP 503': {
                    title: '服务不可用',
                    message: '服务器暂时不可用',
                    suggestion: '请稍后重试'
                },
                'timeout': {
                    title: '请求超时',
                    message: '服务器响应时间过长',
                    suggestion: '检查网络状态后重试'
                }
            };
            
            // 匹配错误信息
            for (const [key, info] of Object.entries(errorMap)) {
                if (error.message && error.message.includes(key)) {
                    return info;
                }
            }
            
            // 默认错误信息
            return {
                title: '未知错误',
                message: error.message || '发生了一个错误',
                suggestion: '请重试或联系管理员'
            };
        }
        
        // 新手引导
        function showFilterGuide() {
            const guide = document.createElement('div');
            guide.className = 'filter-guide-overlay';
            guide.innerHTML = `
                <div class="filter-guide">
                    <h4 style="margin-top: 0; color: #303133;">🔍 数据筛选功能</h4>
                    <p style="color: #606266; margin: 10px 0;">通过设置筛选条件，只转换符合条件的数据行</p>
                    
                    <div class="guide-examples" style="margin: 15px 0;">
                        <h5 style="margin: 10px 0; color: #303133;">常见场景：</h5>
                        <ul style="margin: 5px 0; padding-left: 20px; color: #606266;">
                            <li>📅 日期筛选：只转换 2026 年 3 月 1 日之后的数据</li>
                            <li>💰 金额筛选：只转换金额 > 1000 的记录</li>
                            <li>✅ 状态筛选：只转换状态为"已完成"的订单</li>
                        </ul>
                    </div>
                    
                    <div class="guide-tips" style="margin: 15px 0;">
                        <h5 style="margin: 10px 0; color: #303133;">使用技巧：</h5>
                        <ol style="margin: 5px 0; padding-left: 20px; color: #606266;">
                            <li>勾选"启用筛选"开启功能</li>
                            <li>点击"添加条件"设置筛选规则</li>
                            <li>可添加多个条件，支持 AND/OR 组合</li>
                            <li>实时预览筛选结果</li>
                        </ol>
                    </div>
                    
                    <button class="btn-guide-close" onclick="closeFilterGuide()" style="margin-top: 15px; padding: 8px 20px; background: #409EFF; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">我知道了</button>
                </div>
            `;
            
            document.body.appendChild(guide);
        }
        
        function closeFilterGuide() {
            const guide = document.querySelector('.filter-guide-overlay');
            if (guide) {
                guide.remove();
            }
            localStorage.setItem('filterGuideShown', 'true');
        }
        
        // 检查是否需要显示新手引导
        function checkAndShowFilterGuide() {
            if (!localStorage.getItem('filterGuideShown')) {
                showFilterGuide();
                localStorage.setItem('filterGuideShown', 'true');
            }
        }
        
        // 加载源字段列表（优化版）
        async function loadSourceFields() {
            // 先检查缓存
            const cached = fieldCache.get();
            if (cached) {
                sourceFields = cached;
                return true;
            }
            
            const loading = showGlobalLoading(DAY7_CONSTANTS.LOADING_MESSAGES.loadingFields);
            
            try {
                const response = await fetch('/api/filter/fields');
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data.success) {
                    sourceFields = data.fields;
                    // 更新缓存
                    fieldCache.set(sourceFields);
                    return true;
                } else {
                    console.error('加载源字段列表失败:', data.message);
                    ErrorToast.show('字段列表加载失败：' + (data.message || '未知错误'), 'error');
                    return false;
                }
            } catch (error) {
                console.error('加载源字段列表失败:', error);
                ErrorToast.show('加载失败：' + error.message, 'error');
                return false;
            } finally {
                hideGlobalLoading(loading);
            }
        }
        
        // 初始化筛选面板（优化版）
        async function initFilterPanel() {
            // 只在有源文件时才加载字段列表
            if (!sourceFileAnalysis) {
                return;
            }
            
            const loading = showGlobalLoading(DAY7_CONSTANTS.LOADING_MESSAGES.initializingPanel);
            
            try {
                // 初始化全局筛选配置
                if (!window.filterConfig) {
                    window.filterConfig = {
                        enabled: false,
                        combinationMode: 'AND',
                        rules: []
                    };
                }
                
                // 加载字段列表
                const loaded = await loadSourceFields();
                
                if (!loaded) {
                    // 字段列表加载失败，显示错误界面
                    showFieldLoadError(new Error('字段列表加载失败'));
                    return;
                }
                
                // 创建 FilterPanel 实例
                const container = document.getElementById('filterPanelContainer');
                if (container && typeof FilterPanel !== 'undefined') {
                    window.filterPanel = new FilterPanel({
                        fields: sourceFields,
                        filterConfig: window.filterConfig,
                        containerId: 'filterPanelContainer',
                        operators: window.FILTER_OPERATORS || [],
                        onConfigChange: (config) => {
                            window.filterConfig = config;
                            log('筛选配置已更新:', config);
                            markConfigDirty();
                        }
                    });
                    
                    container.appendChild(window.filterPanel.render());
                    
                    // 如果筛选功能已启用且有规则，主动触发一次预览刷新
                    if (window.filterConfig.enabled && window.filterConfig.rules && window.filterConfig.rules.length > 0) {
                        // 延迟一下，确保 FilterPanel 已经完全渲染
                        setTimeout(() => {
                            if (window.filterPanel) {
                                window.filterPanel.fetchPreview();
                            }
                        }, 100);
                    }
                }
            } catch (error) {
                console.error('初始化筛选面板失败:', error);
                ErrorToast.show('初始化失败：' + error.message, 'error');
                showFieldLoadError(error);
            } finally {
                hideGlobalLoading(loading);
            }
        }
        
        // 页面加载时不再自动初始化筛选面板
        // 而是在上传源文件后自动初始化
