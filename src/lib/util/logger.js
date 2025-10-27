import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: isDevelopment ? 'debug' : 'info',
});

export default logger;