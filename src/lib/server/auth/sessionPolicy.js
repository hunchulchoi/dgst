export const SESSION_ABSOLUTE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/** @param {unknown} value */
function validDate(value) {
  const date = value instanceof Date ? value : new Date(/** @type {string | number} */ (value));
  return Number.isFinite(date.getTime()) ? date : undefined;
}

/**
 * @param {unknown} createdAt
 * @returns {Date | undefined}
 */
export function getSessionAbsoluteExpiry(createdAt) {
  if (createdAt == null) return undefined;
  const issuedAt = validDate(createdAt);
  if (!issuedAt) return undefined;
  return new Date(issuedAt.getTime() + SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000);
}

/**
 * @param {{ createdAt?: unknown }} session
 * @param {Date} [now]
 */
export function isSessionAbsolutelyExpired(session, now = new Date()) {
  const absoluteExpiry = getSessionAbsoluteExpiry(session.createdAt);
  return absoluteExpiry ? now.getTime() >= absoluteExpiry.getTime() : false;
}

/**
 * @param {unknown} requestedExpiry
 * @param {unknown} createdAt
 * @returns {Date | undefined}
 */
export function capSessionExpiry(requestedExpiry, createdAt) {
  const requested = validDate(requestedExpiry);
  if (!requested) return undefined;
  const absoluteExpiry = getSessionAbsoluteExpiry(createdAt);
  if (!absoluteExpiry) return requested;
  return requested.getTime() <= absoluteExpiry.getTime() ? requested : absoluteExpiry;
}
