import dns from 'dns/promises';
import { isIP } from 'net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google',
  'kubernetes.default.svc'
]);

/**
 * SSRF 방지: http(s)만 허용, 사설·루프백 IP 차단.
 * @param {string} targetUrl
 * @returns {Promise<{ ok: true, url: URL } | { ok: false, status: number, message: string }>}
 */
export async function assertSafeFetchUrl(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { ok: false, status: 400, message: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, status: 400, message: 'Only http and https URLs are allowed' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, status: 400, message: 'URL credentials are not allowed' };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname) {
    return { ok: false, status: 400, message: 'Invalid hostname' };
  }

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    return { ok: false, status: 403, message: 'URL is not allowed' };
  }

  const literalIpVersion = isIP(hostname);
  if (literalIpVersion) {
    if (isPrivateOrReservedIp(hostname, literalIpVersion)) {
      return { ok: false, status: 403, message: 'URL is not allowed' };
    }
    return { ok: true, url: parsed };
  }

  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!records.length) {
      return { ok: false, status: 400, message: 'Hostname could not be resolved' };
    }
    for (const record of records) {
      const version = isIP(record.address);
      if (version && isPrivateOrReservedIp(record.address, version)) {
        return { ok: false, status: 403, message: 'URL is not allowed' };
      }
    }
  } catch {
    return { ok: false, status: 400, message: 'Hostname could not be resolved' };
  }

  return { ok: true, url: parsed };
}

/**
 * @param {string} ip
 * @param {number} version 4 | 6
 */
function isPrivateOrReservedIp(ip, version) {
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fe80:') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd')
    ) {
      return true;
    }
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length);
      const v4 = isIP(mapped);
      if (v4 === 4) return isPrivateOrReservedIp(mapped, 4);
    }
    return false;
  }

  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;

  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}
