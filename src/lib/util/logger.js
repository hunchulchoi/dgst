import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';

const isDevelopment = process.env.NODE_ENV !== 'production';

// 로그 디렉토리 생성
const logDir = process.env.LOG_DIR || './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 실패 로그 파일 경로 (매일 로테이션)
const getErrorLogPath = () => {
  return path.join(logDir, `error-${new Date().toISOString().split('T')[0]}.log`);
};

// 메인 logger 설정
const baseLogger = pino({
  level: isDevelopment ? 'debug' : 'info',
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  }),
});

// 실패 로그 파일 writer
const writeErrorToFile = (level, data) => {
  try {
    const logPath = getErrorLogPath();
    const timestamp = new Date().toISOString();
    const logEntry = JSON.stringify({
      ...data,
      level,
      timestamp,
    }) + '\n';

    fs.appendFileSync(logPath, logEntry, 'utf8');
  } catch (err) {
    console.error('Failed to write error log to file:', err);
  }
};

// Proxy를 사용하여 error/warn 메서드만 오버라이드
const logger = new Proxy(baseLogger, {
  get(target, prop) {
    if (prop === 'error') {
      return (data) => {
        target.error(data);
        writeErrorToFile('error', data);
      };
    }
    if (prop === 'warn') {
      return (data) => {
        target.warn(data);
        writeErrorToFile('warn', data);
      };
    }
    // 나머지는 원본 logger의 속성 반환
    return target[prop];
  }
});

export default logger;