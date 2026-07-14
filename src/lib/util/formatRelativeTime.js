import { formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

/** 브라우저 타임존을 알 수 없을 때 쓰는 서비스 기본 타임존. */
export const DISPLAY_TIME_ZONE = 'Asia/Seoul';
export const TIME_ZONE_COOKIE_NAME = 'timezone';

/** @param {unknown} value */
export function isValidTimeZone(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} timeZone
 * @param {boolean} [secure]
 */
export function serializeTimeZoneCookie(timeZone, secure = false) {
  if (!isValidTimeZone(timeZone)) return '';
  const secureAttribute = secure ? '; Secure' : '';
  return `${TIME_ZONE_COOKIE_NAME}=${encodeURIComponent(timeZone)}; Path=/; Max-Age=31536000; SameSite=Lax${secureAttribute}`;
}

function detectBrowserTimeZone() {
  if (typeof window === 'undefined') return '';
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/**
 * 명시값, 브라우저 감지값, 서울 순서로 표시 타임존을 선택한다.
 * @param {string | undefined} timeZone
 * @param {string} [detectedTimeZone]
 */
export function resolveDisplayTimeZone(timeZone, detectedTimeZone = detectBrowserTimeZone()) {
  const explicit = timeZone?.trim();
  if (explicit && isValidTimeZone(explicit)) return explicit;
  const detected = detectedTimeZone.trim();
  return isValidTimeZone(detected) ? detected : DISPLAY_TIME_ZONE;
}

/**
 * @param {Date} date
 * @param {string} formatStr
 * @param {string} timeZone
 */
function formatInTimeZone(date, formatStr, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const month = String(Number(values.month));
  const day = String(Number(values.day));
  /** @type {Record<string, string>} */
  const tokens = {
    yyyy: values.year,
    MM: values.month.padStart(2, '0'),
    M: month,
    dd: values.day.padStart(2, '0'),
    d: day,
    HH: values.hour,
    mm: values.minute,
    ss: values.second
  };

  return formatStr.replace(/yyyy|MM|dd|HH|mm|ss|M|d/g, (token) => tokens[token]);
}

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
export function parseSafeDate(value) {
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

/** @param {unknown} value */
function coerceToDate(value) {
  return parseSafeDate(value);
}

/**
 * @param {unknown} value
 * @param {string} formatStr
 * 지원 토큰: yyyy, MM, M, dd, d, HH, mm, ss.
 * @param {{ timeZone?: string }} [options]
 * @returns {string}
 */
export function formatAbsoluteTime(value, formatStr, options = {}) {
  try {
    const date = coerceToDate(value);
    if (!date || !isValid(date)) return '';
    return formatInTimeZone(date, formatStr, resolveDisplayTimeZone(options.timeZone));
  } catch {
    return '';
  }
}

/**
 * @param {unknown} value
 * @param {{ timeZone?: string }} [options]
 * @returns {string}
 */
export function formatIso9075Safe(value, options = {}) {
  return formatAbsoluteTime(value, 'yyyy-MM-dd HH:mm:ss', options);
}

/**
 * DB/캐시 데이터용 ISO 문자열 정규화.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeToIsoString(value) {
  const date = coerceToDate(value);
  return date && isValid(date) ? date.toISOString() : new Date().toISOString();
}
