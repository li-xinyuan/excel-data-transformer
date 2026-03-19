const pino = require('pino');
const path = require('path');
const fs = require('fs');

const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
        }
    } : undefined,
    formatters: {
        level: (label) => {
            return { level: label };
        }
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
        service: 'excel-data-transformer'
    }
});

const fileLogger = pino({
    level: 'debug',
    transport: {
        target: 'pino/file',
        options: {
            destination: path.join(logsDir, 'app.log'),
            mkdir: true
        }
    }
});

const accessLogger = pino({
    level: 'info',
    transport: {
        target: 'pino/file',
        options: {
            destination: path.join(logsDir, 'access.log'),
            mkdir: true
        }
    }
});

function createChildLogger(name) {
    return logger.child({ component: name });
}

function logRequest(method, url, statusCode, responseTime) {
    accessLogger.info({
        method,
        url,
        statusCode,
        responseTime
    }, 'HTTP Request');
}

function logError(error, context = {}) {
    logger.error({
        error: {
            message: error.message,
            stack: error.stack,
            code: error.code
        },
        ...context
    }, 'Error occurred');
}

function logTransformProgress(stage, data) {
    logger.info({
        stage,
        ...data
    }, 'Transform progress');
}

module.exports = {
    logger,
    fileLogger,
    accessLogger,
    createChildLogger,
    logRequest,
    logError,
    logTransformProgress
};
