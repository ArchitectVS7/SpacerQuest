import pino from 'pino';

const CONFIG = {
  logLevel: process.env.WORKER_LOG_LEVEL || 'info',
};

const log = pino({
  level: CONFIG.logLevel,
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
  } : undefined,
});

export { log as workerLogger };
