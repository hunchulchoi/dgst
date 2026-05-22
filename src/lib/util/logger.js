import winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';

const isDevelopment = process.env.NODE_ENV !== 'production';

// 한국시간 변환 함수
const getKoreaTime = () => {
  const now = new Date();
  const koreaTime = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC+9
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

// 커스텀 포맷터: 한국시간 + 메시지 포맷 (clientIp 제외)
const koreaTimeFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  const koreaTime = getKoreaTime();
  const levelUpper = level.toUpperCase();

  const { clientIp, pathname, path, status, trace, ...rest } = metadata;

  let prefix = `[${koreaTime}] [${levelUpper}]`;
  const reqPath = pathname || path;
  if (reqPath) prefix += ` [${reqPath}]`;
  if (status) prefix += ` [${status}]`;

  const metaString = Object.keys(rest).length > 0 ? ' ' + JSON.stringify(rest) : '';
  const traceBlock =
    typeof trace === 'string' && trace.trim() ? `\n[trace]\n${trace.trimEnd()}` : '';

  return `${prefix} ${message}${metaString}${traceBlock}`;
});

// 개발 환경 포맷터 (컬러 + 한국시간)
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ level, message, ...metadata }) => {
    const koreaTime = getKoreaTime();
    const { clientIp, pathname, path, status, trace, ...rest } = metadata;

    let prefix = `[${koreaTime}] ${level}`;
    const reqPath = pathname || path;
    if (reqPath) prefix += ` [${reqPath}]`;
    if (status) prefix += ` [${status}]`;

    const metaString = Object.keys(rest).length > 0 ? ' ' + JSON.stringify(rest) : '';
    const traceBlock =
      typeof trace === 'string' && trace.trim() ? `\n[trace]\n${trace.trimEnd()}` : '';
    return `${prefix} ${message}${metaString}${traceBlock}`;
  })
);

// 프로덕션 환경 포맷터 (JSON + 한국시간)
const prodFormat = winston.format.combine(
  winston.format.timestamp({ format: () => getKoreaTime() }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    const { clientIp, pathname, path, status, trace, ...rest } = metadata;
    /** @type {Record<string, any>} */
    const output = {
      level: level.toUpperCase(),
      time: timestamp
    };

    const reqPath = pathname || path;
    if (reqPath !== undefined) output.path = reqPath;
    if (status !== undefined) output.status = status;

    output.message = message;
    if (typeof trace === 'string' && trace.trim()) output.trace = trace;

    return JSON.stringify({
      ...output,
      ...rest
    });
  })
);

// 파일 포맷터 (error/warn 로그용)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: () => getKoreaTime() }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    const { clientIp, pathname, path, status, trace, ...rest } = metadata;
    /** @type {Record<string, any>} */
    const output = {
      level: level.toUpperCase(),
      time: timestamp
    };

    const reqPath = pathname || path;
    if (reqPath !== undefined) output.path = reqPath;
    if (status !== undefined) output.status = status;

    output.message = message;
    if (typeof trace === 'string' && trace.trim()) output.trace = trace;

    return JSON.stringify({
      ...output,
      ...rest
    });
  })
);

// Winston logger 생성
const logger = winston.createLogger({
  level: isDevelopment ? 'debug' : 'info',
  format: isDevelopment ? devFormat : prodFormat,
  transports: [
    // 콘솔 출력
    new winston.transports.Console({
      format: isDevelopment ? devFormat : prodFormat
    }),
    // 에러/경고 로그 파일 저장
    new winston.transports.File({
      filename: getErrorLogPath(),
      level: 'warn', // warn 이상만 저장
      format: fileFormat
    })
  ]
});

export default logger;
