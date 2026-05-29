import winston from 'winston';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const environment = process.env.NODE_ENV || 'development';
const isProduction = environment === 'production';
const serviceName = process.env.SERVICE_NAME || 'dgst';
const hostname = os.hostname();

/** @type {'json' | 'pretty'} */
const logFormat =
  process.env.LOG_FORMAT === 'json' || process.env.LOG_FORMAT === 'pretty'
    ? process.env.LOG_FORMAT
    : isProduction
      ? 'json'
      : 'pretty';

const logDir = process.env.LOG_DIR || './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const getErrorLogPath = () =>
  path.join(logDir, `error-${new Date().toISOString().split('T')[0]}.log`);

/**
 * @param {unknown} value
 * @param {number} [depth]
 */
function serializeLogValue(value, depth = 0) {
  if (value == null) return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (Array.isArray(value)) {
    if (depth > 2) return '[Array]';
    return value.map((item) => serializeLogValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    if (depth > 2) return String(value);
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = serializeLogValue(nested, depth + 1);
    }
    return out;
  }

  return value;
}

/**
 * Grafana/Loki용 단일 JSON 레코드 (한 줄 = 한 이벤트)
 *
 * @param {string} level
 * @param {unknown} message
 * @param {Record<string, unknown>} [metadata]
 */
export function toGrafanaLogRecord(level, message, metadata = {}) {
  const {
    trace,
    pathname,
    path: pathField,
    status,
    clientIp,
    error,
    level: _ignoredLevel,
    message: _ignoredMessage,
    timestamp: _ignoredTimestamp,
    ...rest
  } = metadata;

  /** @type {Record<string, unknown>} */
  const record = {
    timestamp: new Date().toISOString(),
    level: String(level).replace(/\u001b\[[0-9;]*m/g, '').toLowerCase(),
    message: typeof message === 'string' ? message : JSON.stringify(message),
    service: serviceName,
    environment,
    hostname
  };

  const reqPath = pathname ?? pathField;
  if (reqPath !== undefined) record.pathname = reqPath;
  if (status !== undefined) record.status = status;
  if (clientIp) record.client_ip = clientIp;
  if (typeof trace === 'string' && trace.trim()) record.trace = trace.trim();
  if (error !== undefined) record.error = serializeLogValue(error);

  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) record[key] = serializeLogValue(value);
  }

  return record;
}

/** @param {import('logform').TransformableInfo} info */
function formatGrafanaJson(info) {
  const { level, message, ...metadata } = info;
  return JSON.stringify(toGrafanaLogRecord(level, message, metadata));
}

/** @param {import('logform').TransformableInfo} info */
function formatPretty(info) {
  const { level, message, ...metadata } = info;
  const record = toGrafanaLogRecord(level, message, metadata);
  const kst = new Date(record.timestamp).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const reqPath = record.pathname ? ` [${record.pathname}]` : '';
  const status = record.status ? ` [${record.status}]` : '';
  const { trace, timestamp, level: lvl, message: msg, ...rest } = record;
  const metaString = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
  const traceBlock = typeof trace === 'string' && trace ? `\n[trace]\n${trace}` : '';
  return `[${kst}] ${String(lvl).toUpperCase()}${reqPath}${status} ${msg}${metaString}${traceBlock}`;
}

const grafanaJsonFormat = winston.format.printf(formatGrafanaJson);
const prettyFormat = winston.format.combine(winston.format.colorize(), winston.format.printf(formatPretty));

const activeFormat = logFormat === 'json' ? grafanaJsonFormat : prettyFormat;

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  transports: [
    new winston.transports.Console({
      format: activeFormat
    }),
    new winston.transports.File({
      filename: getErrorLogPath(),
      level: 'warn',
      format: grafanaJsonFormat
    })
  ]
});

export default logger;
