const fs = require('fs');
const path = require('path');
const config = require('./config');
const { logger } = require('./utils/logger');

class SessionContext {
    constructor() {
        this.sourceAnalysis = null;
        this.targetAnalysis = null;
        this.targetData = null;
        this.targetWb = null;
        this.targetSheetName = null;
        this.sourceFilePath = null;
        this.targetFilePath = null;
        this.mapping = null;
        this.transformConfirmed = false;
        this.transformResult = null;
        this.configName = null;
        this.fileCounter = 0;
    }

    setSourceAnalysis(analysis, filePath) {
        this.sourceAnalysis = analysis;
        this.sourceFilePath = filePath;
    }

    setTargetAnalysis(analysis, data, wb, sheetName, filePath) {
        this.targetAnalysis = analysis;
        this.targetData = data;
        this.targetWb = wb;
        this.targetSheetName = sheetName;
        this.targetFilePath = filePath;
    }

    setMapping(mapping) {
        this.mapping = mapping;
    }
    
    setConfigName(name) {
        this.configName = name;
    }

    setTransformConfirmed(result) {
        this.transformConfirmed = true;
        this.transformResult = result;
    }

    isReadyForMapping() {
        return this.sourceAnalysis !== null && this.targetAnalysis !== null;
    }

    isReadyForTransform() {
        return this.mapping !== null && this.transformConfirmed;
    }

    getSourceHeaders() {
        return this.sourceAnalysis ? this.sourceAnalysis.dataHeaders : [];
    }

    getTargetHeaders() {
        return this.targetAnalysis ? this.targetAnalysis.dataHeaders : [];
    }

    getOutputFileName() {
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const seqNum = String(++this.fileCounter).padStart(4, '0');
        const configName = this.configName || '默认配置';
        return `${configName}_${dateStr}_${seqNum}_转换结果.xlsx`;
    }

    cleanup() {
        const tempFiles = [this.sourceFilePath, this.targetFilePath];
        tempFiles.forEach(filePath => {
            if (filePath && fs.existsSync(filePath) && filePath.includes(config.file.upload.tempPrefix)) {
                let retryCount = 0;
                const maxRetries = 3;
                
                const deleteFile = () => {
                    try {
                        fs.unlinkSync(filePath);
                        logger.debug({ filePath }, '临时文件已删除');
                    } catch (e) {
                        retryCount++;
                        if (retryCount < maxRetries) {
                            logger.warn({ filePath, error: e.message, retryCount }, '临时文件删除失败，正在重试');
                            setTimeout(deleteFile, 100 * retryCount);
                        } else {
                            logger.error({ filePath, error: e.message }, '临时文件删除失败，已达到最大重试次数');
                        }
                    }
                };
                
                deleteFile();
            }
        });
    }

    reset() {
        this.cleanup();
        this.sourceAnalysis = null;
        this.targetAnalysis = null;
        this.targetData = null;
        this.targetWb = null;
        this.targetSheetName = null;
        this.sourceFilePath = null;
        this.targetFilePath = null;
        this.mapping = null;
        this.transformConfirmed = false;
        this.transformResult = null;
        this.configName = null;
        this.fileCounter = 0;
    }
}

const sessionContext = new SessionContext();

module.exports = {
    SessionContext,
    sessionContext
};
