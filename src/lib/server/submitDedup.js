import crypto from 'crypto';
import { tryAcquire } from '$lib/server/cache/pgDedup.js';
import { findRecentDuplicateArticle } from '$lib/server/board/articleRepo.js';
import { findRecentDuplicateComment } from '$lib/server/board/commentRepo.js';

const DEDUP_PREFIX = 'submit:dedup:';

/**
 * @param {unknown[]} parts
 * @returns {string}
 */
export function buildSubmitFingerprint(parts) {
  const normalized = parts
    .map((p) => {
      const s = String(p ?? '').trim();
      return s.length > 4000 ? s.slice(0, 4000) : s;
    })
    .join('\x1e');
  return crypto.createHash('sha256').update(normalized).digest('base64url');
}

/**
 * 동일 내용의 연속 제출(더블클릭·재시도)을 짧은 TTL 동안 차단한다.
 * Postgres 미연결 시 true(허용) — 본 기능만 graceful degrade.
 *
 * @param {'article' | 'comment'} scope
 * @param {string} email
 * @param {string} fingerprint
 * @param {number} [ttlSeconds=8]
 * @returns {Promise<boolean>} true면 새 제출 처리, false면 중복으로 간주
 */
export async function tryAcquireSubmitDedup(scope, email, fingerprint, ttlSeconds = 8) {
  const key = `${DEDUP_PREFIX}${scope}:${email}:${fingerprint}`;
  try {
    return await tryAcquire(key, ttlSeconds);
  } catch {
    return true;
  }
}

export { findRecentDuplicateArticle, findRecentDuplicateComment };
