import { formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

/**
 * 알림·게시글 등 다양한 저장 형식의 시각을 상대 시간 문자열로 변환한다.
 * 잘못된 값은 빈 문자열을 반환해 렌더링 500을 막는다.
 *
 * @param {unknown} value
 * @param {import('date-fns').FormatDistanceToNowStrictOptions} [options]
 * @returns {string}
 */
export function formatRelativeTime(value, options = {}) {
  try {
    const date = coerceToDate(value);
    if (!date || !isValid(date)) return '';
    return formatDistanceToNowStrict(date, options);
  } catch {
    return '';
  }
}

/**
 * @param {unknown} value
 * @returns {Date | null}
 */
function coerceToDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  if (typeof value === 'string' && value) {
    const fromIso = parseISO(value);
    if (isValid(fromIso)) return fromIso;
    const fromParse = new Date(value);
    return isValid(fromParse) ? fromParse : null;
  }
  if (value && typeof value === 'object' && '$date' in value) {
    const parsed = new Date(String(/** @type {{ $date: string }} */ (value).$date));
    return isValid(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Redis·Mongo 혼재 데이터용 ISO 문자열 정규화.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeToIsoString(value) {
  const date = coerceToDate(value);
  return date && isValid(date) ? date.toISOString() : new Date().toISOString();
}
