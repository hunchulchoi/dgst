/**
 * @param {unknown} cause
 * @param {number} index
 */
function appendCause(cause, index) {
  if (cause == null) return '';

  if (cause instanceof Error) {
    const header = `\n--- cause [${index}] ${cause.name}: ${cause.message} ---`;
    return `${header}\n${cause.stack ?? '(no stack)'}`;
  }

  return `\n--- cause [${index}]: ${String(cause)} ---`;
}

/**
 * Error stack + cause chain을 하나의 trace 문자열로 만든다.
 * @param {{ stack?: string; message?: string; name?: string; cause?: unknown }} source
 * @returns {string}
 */
export function formatErrorTrace(source) {
  const name = source.name ?? 'Error';
  const message = source.message ?? 'Unknown error';

  /** @type {string[]} */
  const lines = [];

  if (source.stack) {
    lines.push(source.stack);
  } else {
    lines.push(`${name}: ${message}`);
  }

  let cause = source.cause;
  let index = 1;
  while (cause != null && index <= 5) {
    lines.push(appendCause(cause, index));
    cause = cause instanceof Error ? cause.cause : null;
    index += 1;
  }

  return lines.join('\n');
}

/**
 * @param {unknown} err
 * @returns {string}
 */
export function traceFromUnknown(err) {
  if (!err) return '';

  if (err instanceof Error) {
    return formatErrorTrace({
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause
    });
  }

  if (typeof err === 'object') {
    const parsed = /** @type {{ name?: string; message?: string; stack?: string; cause?: unknown }} */ (
      err
    );
    return formatErrorTrace(parsed);
  }

  return String(err);
}

/**
 * 페이지 에러에 stack이 없을 때 클라이언트 호출 위치 trace.
 * @param {string} [label]
 * @returns {string}
 */
export function captureClientCallTrace(label = 'client-capture') {
  try {
    return new Error(label).stack ?? '';
  } catch {
    return '';
  }
}

/**
 * @param {unknown} err
 */
export function serializeError(err) {
  if (!err) return undefined;

  const parsed =
    typeof err === 'object' && err !== null
      ? /** @type {{ name?: string; message?: string; stack?: string; cause?: unknown }} */ (err)
      : { message: String(err) };

  const cause =
    parsed.cause instanceof Error
      ? {
          name: parsed.cause.name,
          message: parsed.cause.message,
          stack: parsed.cause.stack,
          cause: parsed.cause.cause
        }
      : parsed.cause;

  return {
    name: parsed.name,
    message: parsed.message ?? String(err),
    stack: parsed.stack,
    cause,
    trace: formatErrorTrace({ ...parsed, cause: parsed.cause })
  };
}
