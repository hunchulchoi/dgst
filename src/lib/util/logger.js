import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';

const isDevelopment = process.env.NODE_ENV !== 'production';

// 한국시간 변환 함수
const getKoreaTime = () => {
  const now = new Date();
  const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
  const year = koreaTime.getUTCFullYear();
  const month = String(koreaTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(koreaTime.getUTCDate()).padStart(2, '0');
  const hours = String(koreaTime.getUTCHours()).padStart(2, '0');
  const minutes = String(koreaTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(koreaTime.getUTCSeconds()).padStart(2, '0');
  const milliseconds = String(koreaTime.getUTCMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
};

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
const baseLogger = isDevelopment
  ? pino({
    level: 'debug',
    timestamp: () => `,"time":"${getKoreaTime()}"`,
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() };
      },
    },
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: false, // timestamp formatter에서 이미 한국시간 처리
        ignore: 'pid,hostname,clientIp', // 콘솔 출력 시 clientIp 제외
        singleLine: true,
        customColors: 'info:blue,warn:yellow,error:red',
        // messageFormat 제거 - Worker 스레드 직렬화 문제 방지
      },
    },
  })
  : pino({
    level: 'info',
    timestamp: () => `,"time":"${getKoreaTime()}"`,
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() };
      },
    },
  });

// 실패 로그 파일 writer
const writeErrorToFile = (level, data) => {
  try {
    const logPath = getErrorLogPath();
    const koreaTime = getKoreaTime();
    const logEntry = JSON.stringify({
      ...data,
      level,
      timestamp: koreaTime,
    }) + '\n';

    fs.appendFileSync(logPath, logEntry, 'utf8');
  } catch (err) {
    console.error('Failed to write error log to file:', err);
  }
};

// finalLogger는 baseLogger와 동일하게 사용
const finalLogger = baseLogger;

// Proxy를 사용하여 error/warn 메서드만 오버라이드
const logger = new Proxy(finalLogger, {
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