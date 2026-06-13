const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * @param {{
 *   method: string;
 *   requestOrigin: string;
 *   origin?: string | null;
 *   secFetchSite?: string | null;
 * }} input
 * @returns {boolean}
 */
export function shouldRejectCrossOriginRequest({
  method,
  requestOrigin,
  origin = null,
  secFetchSite = null
}) {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;

  if (secFetchSite === 'cross-site') return true;

  if (!origin) return false;

  try {
    return new URL(origin).origin !== requestOrigin;
  } catch {
    return true;
  }
}
