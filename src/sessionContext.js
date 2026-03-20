const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { logger } = require('./utils/logger');

class SessionContext {
    constructor(sessionId) {
        this.sessionId = sessionId;
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
        this.createdAt = Date.now();
        this.lastAccessedAt = Date.now();
    }

    setSourceAnalysis(analysis, filePath) {
        this.sourceAnalysis = analysis;
        this.sourceFilePath = filePath;
        this.updateAccessTime();
    }

    setTargetAnalysis(analysis, data, wb, sheetName, filePath) {
        this.targetAnalysis = analysis;
        this.targetData = data;
        this.targetWb = wb;
        this.targetSheetName = sheetName;
        this.targetFilePath = filePath;
        this.updateAccessTime();
    }

    setMapping(mapping) {
        this.mapping = mapping;
        this.updateAccessTime();
    }
    
    setConfigName(name) {
        this.configName = name;
        this.updateAccessTime();
    }

    setTransformConfirmed(result) {
        this.transformConfirmed = true;
        this.transformResult = result;
        this.updateAccessTime();
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

    updateAccessTime() {
        this.lastAccessedAt = Date.now();
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
                        logger.debug({ filePath, sessionId: this.sessionId }, '临时文件已删除');
                    } catch (e) {
                        retryCount++;
                        if (retryCount < maxRetries) {
                            logger.warn({ filePath, error: e.message, retryCount, sessionId: this.sessionId }, '临时文件删除失败，正在重试');
                            setTimeout(deleteFile, 100 * retryCount);
                        } else {
                            logger.error({ filePath, error: e.message, sessionId: this.sessionId }, '临时文件删除失败，已达到最大重试次数');
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
        this.updateAccessTime();
    }
}

class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.sessionTimeout = 30 * 60 * 1000; // 30 分钟超时
        
        // 定期清理过期 session
        setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000); // 每 5 分钟清理一次
    }

    generateSessionId() {
        return crypto.randomBytes(16).toString('hex');
    }

    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.updateAccessTime();
            return session;
        }
        return null;
    }

    createSession() {
        const sessionId = this.generateSessionId();
        const session = new SessionContext(sessionId);
        this.sessions.set(sessionId, session);
        logger.info({ sessionId }, '创建新会话');
        return { sessionId, session };
    }

    deleteSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.cleanup();
            this.sessions.delete(sessionId);
            logger.info({ sessionId }, '删除会话');
            return true;
        }
        return false;
    }

    cleanupExpiredSessions() {
        const now = Date.now();
        let expiredCount = 0;
        
        for (const [sessionId, session] of this.sessions.entries()) {
            if (now - session.lastAccessedAt > this.sessionTimeout) {
                session.cleanup();
                this.sessions.delete(sessionId);
                expiredCount++;
                logger.info({ sessionId, age: now - session.lastAccessedAt }, '清理过期会话');
            }
        }
        
        if (expiredCount > 0) {
            logger.info({ count: expiredCount, total: this.sessions.size }, '批量清理过期会话完成');
        }
    }

    getSessionCount() {
        return this.sessions.size;
    }

    getAllSessions() {
        return Array.from(this.sessions.entries()).map(([id, session]) => ({
            sessionId: id,
            createdAt: session.createdAt,
            lastAccessedAt: session.lastAccessedAt,
            hasSourceFile: !!session.sourceAnalysis,
            hasTargetFile: !!session.targetAnalysis,
            hasMapping: !!session.mapping
        }));
    }
}

// 创建全局 session 管理器
const sessionManager = new SessionManager();

module.exports = {
    SessionContext,
    SessionManager,
    sessionManager
};
