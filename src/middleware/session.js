const { sessionManager } = require('../sessionContext');
const { logger } = require('../utils/logger');

/**
 * Session 中间件 - 为每个请求获取或创建 Session
 */
function sessionMiddleware(req, res, next) {
    // 从 Cookie 或请求头获取 Session ID
    let sessionId = null;
    
    // 从 Cookie 中解析
    const cookies = parseCookies(req.headers.cookie);
    sessionId = cookies['sessionId'];
    
    // 如果没有 Cookie，尝试从请求头获取
    if (!sessionId) {
        sessionId = req.headers['x-session-id'];
    }
    
    // 获取或创建 Session
    let session = null;
    let isNewSession = false;
    
    if (sessionId) {
        session = sessionManager.getSession(sessionId);
    }
    
    if (!session) {
        const newSession = sessionManager.createSession();
        sessionId = newSession.sessionId;
        session = newSession.session;
        isNewSession = true;
    }
    
    // 将 session 附加到请求对象
    req.session = session;
    req.sessionId = sessionId;
    req.isNewSession = isNewSession;
    
    // 设置响应头，让客户端知道 Session ID
    res.setHeader('X-Session-Id', sessionId);
    
    logger.debug({ sessionId, isNewSession }, 'Session 中间件处理完成');
    
    if (next) {
        next();
    }
}

/**
 * 解析 Cookie 字符串
 */
function parseCookies(cookieStr) {
    const cookies = {};
    if (!cookieStr) return cookies;
    
    cookieStr.split(';').forEach(cookie => {
        const [key, value] = cookie.trim().split('=');
        if (key && value) {
            cookies[key] = decodeURIComponent(value);
        }
    });
    
    return cookies;
}

/**
 * 设置 Session Cookie 的辅助函数
 */
function setSessionCookie(res, sessionId, maxAge = 30 * 24 * 60 * 60 * 1000) {
    res.setHeader('Set-Cookie', `sessionId=${sessionId}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict`);
}

module.exports = {
    sessionMiddleware,
    parseCookies,
    setSessionCookie
};
