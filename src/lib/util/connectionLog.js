import { serializeError, traceFromUnknown } from '$lib/util/formatErrorTrace.js';

/**
 * 연결 문자열에서 자격 증명 제거
 *
 * @param {string | undefined} url
 */
export function redactConnectionUrl(url) {
  if (!url) return '(not set)';

  try {
    const isSrv = url.startsWith('mongodb+srv://');
    const isMongo = url.startsWith('mongodb://') || isSrv;
    const isRedis = url.startsWith('redis://') || url.startsWith('rediss://');

    if (isMongo) {
      const normalized = url.replace(/^mongodb(\+srv)?:\/\//, 'https://');
      const parsed = new URL(normalized);
      if (parsed.password) parsed.password = '***';
      if (parsed.username) {
        parsed.username = `${parsed.username.slice(0, Math.min(2, parsed.username.length))}***`;
      }
      const protocol = isSrv ? 'mongodb+srv://' : 'mongodb://';
      return `${protocol}${parsed.host}${parsed.pathname}${parsed.search}`;
    }

    if (isRedis) {
      const parsed = new URL(url);
      if (parsed.password) parsed.password = '***';
      if (parsed.username) {
        parsed.username = `${parsed.username.slice(0, Math.min(2, parsed.username.length))}***`;
      }
      return parsed.toString();
    }

    const generic = new URL(url);
    if (generic.password) generic.password = '***';
    return generic.toString();
  } catch {
    return url.replace(/:([^@/]+)@/, ':***@');
  }
}

/**
 * @param {unknown} servers
 */
function summarizeMongoServers(servers) {
  if (!servers || typeof servers !== 'object') return undefined;

  /** @type {Record<string, { type?: unknown; address?: unknown; error?: unknown }>} */
  const summary = {};

  for (const [address, desc] of Object.entries(servers)) {
    if (!desc || typeof desc !== 'object') continue;
    const server = /** @type {Record<string, unknown>} */ (desc);
    summary[address] = {
      type: server.type,
      address: server.address,
      error:
        server.error instanceof Error
          ? { name: server.error.name, message: server.error.message }
          : server.error
    };
  }

  return summary;
}

/**
 * @param {unknown} err
 */
export function extractMongoErrorMeta(err) {
  if (!(err instanceof Error)) {
    return { rawError: String(err) };
  }

  const anyErr = /** @type {Record<string, unknown>} */ (err);

  /** @type {Record<string, unknown>} */
  const meta = {
    errorName: err.name,
    errorMessage: err.message
  };

  if (anyErr.code != null) meta.mongoCode = anyErr.code;
  if (anyErr.codeName != null) meta.mongoCodeName = anyErr.codeName;
  if (anyErr.errno != null) meta.errno = anyErr.errno;
  if (anyErr.syscall != null) meta.syscall = anyErr.syscall;
  if (anyErr.hostname != null) meta.hostname = anyErr.hostname;
  if (anyErr.port != null) meta.port = anyErr.port;
  if (anyErr.address != null) meta.address = anyErr.address;

  if (anyErr.reason && typeof anyErr.reason === 'object') {
    const reason = /** @type {Record<string, unknown>} */ (anyErr.reason);
    meta.reasonType = reason.type;
    if (reason.servers) {
      meta.serverDescriptions = summarizeMongoServers(reason.servers);
    }
    if (reason.message) meta.reasonMessage = reason.message;
  }

  return meta;
}

/**
 * @param {unknown} err
 */
export function extractNetworkErrorMeta(err) {
  if (!(err instanceof Error)) {
    return { rawError: String(err) };
  }

  const anyErr = /** @type {Record<string, unknown>} */ (err);

  /** @type {Record<string, unknown>} */
  const meta = {
    errorName: err.name,
    errorMessage: err.message
  };

  if (anyErr.code != null) meta.errorCode = anyErr.code;
  if (anyErr.errno != null) meta.errno = anyErr.errno;
  if (anyErr.syscall != null) meta.syscall = anyErr.syscall;
  if (anyErr.address != null) meta.address = anyErr.address;
  if (anyErr.port != null) meta.port = anyErr.port;

  return meta;
}

/**
 * @param {string} phase
 * @param {unknown} err
 * @param {Record<string, unknown>} [context]
 */
export function buildConnectionFailureLog(phase, err, context = {}) {
  return {
    message: phase,
    ...context,
    ...extractNetworkErrorMeta(err),
    error: serializeError(err),
    trace: traceFromUnknown(err)
  };
}

/**
 * @param {string} phase
 * @param {unknown} err
 * @param {Record<string, unknown>} [context]
 */
export function buildMongoFailureLog(phase, err, context = {}) {
  return {
    message: phase,
    ...context,
    ...extractMongoErrorMeta(err),
    error: serializeError(err),
    trace: traceFromUnknown(err)
  };
}
