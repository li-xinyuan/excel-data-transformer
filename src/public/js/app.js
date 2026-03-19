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
        let currentTransformField = null;
        let sourceSampleData = null;
        let configHasChanges = false;
        
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
            
            step1.classList.remove('active', 'completed');
            step2.classList.remove('active', 'completed');
            step3.classList.remove('active', 'completed');
            step4.classList.remove('active', 'completed');
            
            sourcePanel.classList.remove('highlight-panel');
            targetPanel.classList.remove('highlight-panel');
            sourceDropZone.classList.remove('highlight');
            targetDropZone.classList.remove('highlight');
            mainContent.classList.remove('has-overlay');
            
            if (currentLoadedConfig) {
                step1.classList.add('completed');
                step2.classList.add('completed');
                
                const mappedTargetIndices = new Set();
                previewData.mappings.forEach(m => {
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
                } else {
                    step3.classList.add('completed');
                    quickGuideText.textContent = '所有必填字段已映射完成，点击"开始转换"按钮执行数据转换。';
                    document.getElementById('transformBtn').classList.add('pulse');
                }
            } else if (sourceFile && targetFile && previewData) {
                const mappedTargetIndices = new Set();
                previewData.mappings.forEach(m => {
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
                } else {
                    targetFile = null;
                }
                
                if (!sourceFile || !targetFile) {
                    previewData = null;
                    manualMappings = [];
                    removedMappings = [];
                    selectedSourceField = null;
                    valueTransformRules = {};
                    currentLoadedConfig = null;
                    
                    const statsPanel = document.getElementById('statsPanel');
                    const sourceStatsPanel = document.getElementById('sourceStatsPanel');
                    const controlsPanel = document.getElementById('controlsPanel');
                    const mappingControls = document.getElementById('mappingControls');
                    const mappingToolbar = document.getElementById('mappingToolbar');
                    const transformBtn = document.getElementById('transformBtn');
                    const saveConfigBtn = document.getElementById('saveConfigBtn');
                    
                    if (statsPanel) statsPanel.style.display = 'none';
                    if (sourceStatsPanel) sourceStatsPanel.style.display = 'none';
                    if (controlsPanel) controlsPanel.style.display = 'none';
                    if (mappingControls) mappingControls.style.display = 'none';
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
                
                const result = await response.json();
                
                if (result.success) {
                    uploadAbortController = null;
                    if (type === 'source') {
                        sourceFile = file;
                        renderSourceFields(result.data);
                        const sourceRowsElement = document.getElementById('sourceFileRows');
                        if (sourceRowsElement) {
                            sourceRowsElement.textContent = `${result.data.rowCount} 行数据`;
                            sourceRowsElement.style.color = '#2e7d32';
                            sourceRowsElement.style.cursor = 'pointer';
                            sourceRowsElement.style.textDecoration = 'underline';
                            sourceRowsElement.title = '点击查看数据预览';
                        }
                        showSuccess(`源文件 ${file.name} 上传成功！`);
                    } else {
                        targetFile = file;
                        renderTargetFields(result.data);
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
            const headers = previewData ? previewData.sourceHeaders : [];
            
            let html = '<div class="data-preview-table-wrapper"><table class="data-preview-table"><thead><tr>';
            headers.forEach(h => {
                html += `<th title="${escapeHtml(h || '')}">${escapeHtml(h || '')}</th>`;
            });
            html += '</tr></thead><tbody>';
            
            sourceSampleData.slice(0, 5).forEach(row => {
                html += '<tr>';
                headers.forEach((_, idx) => {
                    const cell = row[idx];
                    const cellText = String(cell !== undefined && cell !== null ? cell : '');
                    const displayText = cellText.length > 30 ? cellText.substring(0, 30) + '...' : cellText;
                    html += `<td title="${escapeHtml(cellText)}">${escapeHtml(displayText)}</td>`;
                });
                html += '</tr>';
            });
            
            html += '</tbody></table></div>';
            content.innerHTML = html;
            
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
                        sourceInput = `
                            <select onchange="updateTransformRule(${idx}, 'operation', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
                                <option value="substring" ${rule.operation === 'substring' ? 'selected' : ''}>截取字符串</option>
                                <option value="replace" ${rule.operation === 'replace' ? 'selected' : ''}>替换字符串</option>
                                <option value="trim" ${rule.operation === 'trim' ? 'selected' : ''}>去除空格</option>
                                <option value="uppercase" ${rule.operation === 'uppercase' ? 'selected' : ''}>转为大写</option>
                                <option value="lowercase" ${rule.operation === 'lowercase' ? 'selected' : ''}>转为小写</option>
                            </select>
                            ${rule.operation === 'substring' ? `<input type="text" value="${escapeHtml(rule.params || '')}" onchange="updateTransformRule(${idx}, 'params', this.value)" placeholder="起始位置,长度 (如: 0,5)" style="margin-top: 5px; width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">` : ''}
                            ${rule.operation === 'replace' ? `<input type="text" value="${escapeHtml(rule.params || '')}" onchange="updateTransformRule(${idx}, 'params', this.value)" placeholder="查找,替换 (如: a,b)" style="margin-top: 5px; width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">` : ''}
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
                if (field === 'type') {
                    renderTransformRules(valueTransformRules[key]);
                }
                if (field === 'operation') {
                    renderTransformRules(valueTransformRules[key]);
                }
            }
        }
        
        function removeTransformRule(idx) {
            const key = `${currentTransformField.sourceIndex}_${currentTransformField.targetIndex}`;
            if (valueTransformRules[key]) {
                valueTransformRules[key].splice(idx, 1);
                renderTransformRules(valueTransformRules[key]);
            }
        }
        
        function saveTransformRules() {
            const key = `${currentTransformField.sourceIndex}_${currentTransformField.targetIndex}`;
            const rules = valueTransformRules[key] || [];
            
            valueTransformRules[key] = rules.filter(r => {
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
            
            updateFieldTransformIndicator(currentTransformField.sourceIndex, currentTransformField.targetIndex);
            
            closeValueTransformModal();
        }
        
        function updateFieldTransformIndicator(sourceIndex, targetIndex) {
            const key = `${sourceIndex}_${targetIndex}`;
            const rules = valueTransformRules[key];
            const sourceEl = fieldElements.source[sourceIndex];
            
            if (sourceEl) {
                const oldIndicator = sourceEl.querySelector('.transform-indicator');
                if (oldIndicator) oldIndicator.remove();
                
                if (rules && rules.length > 0) {
                    const indicator = document.createElement('span');
                    indicator.className = 'transform-indicator';
                    indicator.textContent = `🔄${rules.length}`;
                    indicator.title = `已配置 ${rules.length} 条值转换规则`;
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
                
                li.innerHTML = `
                    <div class="connection-point new" data-type="target" data-index="${idx}"></div>
                    <span class="field-index">${columnLetter}</span>
                    <span class="field-name">${escapeHtml(displayHeader)}</span>
                `;
                
                if (isRequired) {
                    li.classList.add('required');
                }
                
                list.appendChild(li);
                fieldElements.target[idx] = li;
            });
            
            container.classList.add('visible');
            setupConnectionPoints();
        }
        
        async function analyzeAndMap() {
            try {
                const response = await fetch('/api/analyze', { method: 'POST' });
                const result = await response.json();
                
                if (result.success) {
                    previewData = result.data;
                    updateMappingDisplay();
                    document.getElementById('statsPanel').style.display = 'flex';
                    document.getElementById('sourceStatsPanel').style.display = 'flex';
                    document.getElementById('controlsPanel').style.display = 'block';
                    if (sourceFile && targetFile) {
                        const mappingControls = document.getElementById('mappingControls');
                        if (mappingControls) mappingControls.style.display = 'flex';
                    }
                    document.getElementById('transformBtn').disabled = false;
                    document.getElementById('saveConfigBtn').disabled = false;
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
                        showAddConfigModal();
                    }
                } else {
                    showError('映射分析失败: ' + (result.error || '未知错误'));
                }
            } catch (error) {
                showError('映射分析失败: ' + error.message);
            }
        }
        
        function updateMappingDisplay() {
            if (!previewData) return;
            
            const mappedTargetIndices = new Set();
            const mappedSourceIndices = new Set();
            
            previewData.mappings.forEach(mapping => {
                if (!removedMappings.some(r => r.targetIndex === mapping.targetIndex)) {
                    mappedTargetIndices.add(mapping.targetIndex);
                    mappedSourceIndices.add(mapping.sourceIndex);
                }
            });
            
            manualMappings.forEach(m => {
                mappedTargetIndices.add(m.target);
                mappedSourceIndices.add(m.source);
            });
            
            console.log('updateMappingDisplay - mappedTargetIndices:', [...mappedTargetIndices]);
            console.log('updateMappingDisplay - removedMappings:', removedMappings);
            console.log('updateMappingDisplay - manualMappings:', manualMappings);
            
            document.querySelectorAll('.target-panel .field-item').forEach(el => {
                const idx = parseInt(el.dataset.index);
                const isRequired = el.dataset.isRequired === 'true';
                const isMapped = mappedTargetIndices.has(idx);
                
                console.log(`Field ${idx}: isRequired=${isRequired}, isMapped=${isMapped}, classes=${el.className}`);
                
                el.classList.remove('mapped', 'missing');
                
                const connectionPoint = el.querySelector('.connection-point');
                if (connectionPoint) {
                    if (isMapped) {
                        connectionPoint.classList.remove('new');
                    } else {
                        connectionPoint.classList.add('new');
                    }
                }
                
                if (isRequired) {
                    if (isMapped) {
                        el.classList.add('mapped');
                        console.log(`Field ${idx}: added 'mapped' class`);
                    } else {
                        el.classList.add('missing');
                        console.log(`Field ${idx}: added 'missing' class`);
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
            updateStats();
            drawMappings();
            updateSteps();
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
        }
        
        function updateStats() {
            if (!previewData) return;
            
            const mappedCount = previewData.mappings.filter(m => 
                !removedMappings.some(r => r.targetIndex === m.targetIndex)
            ).length + manualMappings.length;
            
            const missingCount = previewData.missingFields.length - 
                manualMappings.filter(m => previewData.missingFields.some(f => f.index === m.target)).length;
            
            const mappedRequiredCount = previewData.mappings.filter(m => {
                if (removedMappings.some(r => r.targetIndex === m.targetIndex)) return false;
                const header = previewData.targetHeaders[m.targetIndex];
                return header && header.includes('*');
            }).length + manualMappings.filter(m => {
                const header = previewData.targetHeaders[m.target];
                return header && header.includes('*');
            }).length;
            
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
            
            previewData.mappings.forEach(mapping => {
                if (removedMappings.some(r => r.targetIndex === mapping.targetIndex)) return;
                if (manualMappings.some(m => m.target === mapping.targetIndex)) return;
                
                let showLine = false;
                let lineClass = '';
                
                if (mapping.score >= 80) {
                    showLine = true;
                    lineClass = 'high';
                } else if (mapping.score >= 50) {
                    showLine = true;
                    lineClass = 'medium';
                } else if (mapping.score < 50) {
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
            
            hitPath.addEventListener('mouseenter', () => {
                path.style.strokeWidth = '4';
                sourceEl.style.transform = 'translateX(10px)';
                targetEl.style.transform = 'translateX(-10px)';
            });
            
            hitPath.addEventListener('mouseleave', () => {
                path.style.strokeWidth = '2';
                sourceEl.style.transform = 'translateX(0)';
                targetEl.style.transform = 'translateX(0)';
            });
            
            hitPath.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('确定要删除这条映射关系吗？')) {
                    removeMapping(targetIdx);
                }
            });
            canvas.appendChild(hitPath);
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M ${x1} ${y1} C ${(x1 + x2) * 0.3} ${y1}, ${(x1 + x2) * 0.7} ${y2}, ${x2} ${y2}`);
            path.setAttribute('class', `mapping-line ${lineClass}`);
            path.style.pointerEvents = 'none';
            path.dataset.targetIndex = targetIdx;
            path.dataset.sourceIdx = sourceIdx;
            path.dataset.midX = midX;
            path.dataset.midY = midY;
            canvas.appendChild(path);
            
            const foreignObj = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
            foreignObj.setAttribute('x', midX - 18);
            foreignObj.setAttribute('y', midY - 18);
            foreignObj.setAttribute('width', '36');
            foreignObj.setAttribute('height', '36');
            foreignObj.style.pointerEvents = 'none';
            
            const btnDiv = document.createElement('div');
            btnDiv.style.cssText = 'width:36px;height:36px;background:white;border:2px solid #667eea;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;pointer-events:auto;transition:all 0.3s ease;';
            btnDiv.textContent = '⚙';
            btnDiv.dataset.sourceIdx = sourceIdx;
            btnDiv.dataset.targetIdx = targetIdx;
            
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

            foreignObj.appendChild(btnDiv);
            canvas.appendChild(foreignObj);
            
            if (score !== null) {
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', midX);
                text.setAttribute('y', midY - 25);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('class', 'line-label');
                text.textContent = score >= 80 ? '高' : score >= 50 ? '中' : '低';
                text.style.fontWeight = '600';
                canvas.appendChild(text);
            }
            
            const sourcePoint = sourceEl.querySelector('.connection-point');
            const targetPoint = targetEl.querySelector('.connection-point');
            if (sourcePoint) sourcePoint.classList.add('connected');
            if (targetPoint) targetPoint.classList.add('connected');
        }
        
        function resetMappings() {
            manualMappings = [];
            removedMappings = [];
            updateMappingDisplay();
            drawMappings();
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
                    const requiredMissing = parseInt(document.getElementById('requiredMissing').textContent);
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
                    valueTransformRules: cleanedRules
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
                    
                    showSuccess(`成功转换 ${data.dataRowCount} 行数据！`);
                    showResult('✅ 转换完成', 
                        `成功转换 ${data.dataRowCount} 行数据\n文件名: ${data.fileName}\n文件大小: ${data.fileSize}`);
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
            if (currentLoadedConfig) {
                document.getElementById('configName').value = currentLoadedConfig.name;
            } else {
                document.getElementById('configName').value = '';
            }
            document.getElementById('saveConfigModal').classList.add('show');
            document.getElementById('configName').focus();
        }
        
        function closeSaveConfigModal() {
            document.getElementById('saveConfigModal').classList.remove('show');
            pendingTransformAfterSave = false;
        }
        
        function saveConfig() {
            console.log('saveConfig function called');
            const name = document.getElementById('configName').value.trim();
            if (!name) {
                alert('请输入配置名称');
                return;
            }
            
            if (!previewData) {
                alert('请先完成字段映射');
                return;
            }
            
            const mappedTargetIndices = new Set();
            previewData.mappings.forEach(m => {
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
                if (!confirm(`当前还有 ${unmappedRequiredCount} 个必填字段未映射，您确认要保存么？`)) {
                    return;
                }
            }
            
            const configs = getConfigs();
            const existingIndex = configs.findIndex(c => c.name === name);
            if (existingIndex >= 0) {
                setTimeout(() => {
                    if (!confirm(`配置 "${name}" 已存在，是否覆盖？`)) {
                        return;
                    }
                    doSaveConfig(name, existingIndex >= 0 ? configs[existingIndex].id : null);
                }, 100);
                return;
            }
            
            doSaveConfig(name, null);
        }
        
        function doSaveConfig(name, existingId) {
            console.log('doSaveConfig called, name:', name, 'existingId:', existingId);
            const config = {
                id: existingId || Date.now(),
                name: name,
                createdAt: new Date().toISOString(),
                sourceHeaders: previewData.sourceHeaders,
                targetHeaders: previewData.targetHeaders,
                mappings: previewData.mappings.filter(m => 
                    !removedMappings.some(r => r.targetIndex === m.targetIndex)
                ),
                manualMappings: [...manualMappings],
                valueTransformRules: valueTransformRules
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
                console.log('Calling loadConfig with config.id:', config.id, typeof config.id);
                showSuccess('配置保存成功！');
                closeSaveConfigModal();
                loadConfig(config.id);
                
                updateSteps();
                
                if (pendingTransformAfterSave) {
                    pendingTransformAfterSave = false;
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
                previewData.mappings.forEach(m => {
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
                    if (!confirm(`当前还有 ${unmappedRequiredCount} 个必填字段未映射，您确认要保存么？`)) {
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
            let matchInfo = '';
            
            if (previewData) {
                const sourceMatch = calculateMatchScore(config.sourceHeaders, previewData.sourceHeaders);
                const targetMatch = calculateMatchScore(config.targetHeaders, previewData.targetHeaders);
                const totalMatch = (sourceMatch + targetMatch) / 2;
                matchInfo = ` | 匹配度: ${Math.round(totalMatch * 100)}%`;
            }
            
            infoBar.innerHTML = `📅 ${escapeHtml(date)} | 源字段: ${config.sourceHeaders.length} | 目标字段: ${config.targetHeaders.length}${escapeHtml(matchInfo)}`;
            infoBar.classList.add('visible');
        }
        
        function updateConfigButtons(hasConfig) {
            document.getElementById('exportConfigBtn').disabled = !hasConfig;
            document.getElementById('deleteConfigBtn').disabled = !hasConfig;
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
            console.log('loadConfig called with:', configId, typeof configId);
            const configs = getConfigs();
            console.log('configs:', configs);
            const configIdNum = typeof configId === 'string' ? parseInt(configId) : configId;
            console.log('configIdNum:', configIdNum, typeof configIdNum);
            const config = configs.find(c => c.id === configIdNum || c.id === configId);
            console.log('found config:', config);
            
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
            
            manualMappings = [...config.manualMappings];
            removedMappings = [];
            valueTransformRules = config.valueTransformRules || {};
            currentLoadedConfig = config;
            
            config.mappings.forEach(m => {
                if (!manualMappings.some(mm => mm.target === m.targetIndex)) {
                    if (m.score < 80) {
                        removedMappings.push({ targetIndex: m.targetIndex });
                    }
                }
            });
            
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
