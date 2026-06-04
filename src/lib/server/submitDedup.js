import crypto from 'crypto';
import * as redis from '$lib/server/redis/client.js';
import { Article } from '$lib/models/article.js';
import { Comment } from '$lib/models/comment.js';

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
 * Redis 미연결 시 true(허용) — 본 기능만 graceful degrade.
 *
 * @param {'article' | 'comment'} scope
 * @param {string} email
 * @param {string} fingerprint
 * @param {number} [ttlSeconds=8]
 * @returns {Promise<boolean>} true면 새 제출 처리, false면 중복으로 간주
 */
export async function tryAcquireSubmitDedup(scope, email, fingerprint, ttlSeconds = 8) {
  const key = `${DEDUP_PREFIX}${scope}:${email}:${fingerprint}`;
  const acquired = await redis.setNx(key, '1', ttlSeconds);
  return acquired;
}

/**
 * @param {object} param
 * @param {string} param.email
 * @param {string} param.boardId
 * @param {string} param.title
 * @param {number} [param.withinMs=15000]
 * @returns {Promise<{ _id: import('mongoose').Types.ObjectId } | null>}
 */
export async function findRecentDuplicateArticle({ email, boardId, title, withinMs = 15000 }) {
  try {
    return await Article.findOne({
      email,
      boardId,
      title,
      state: 'write',
      createdAt: { $gte: new Date(Date.now() - withinMs) }
    })
      .sort({ createdAt: -1 })
      .select({ _id: 1 })
      .lean();
  } catch {
    return null;
  }
}

/**
 * @param {object} param
 * @param {string} param.email
 * @param {string} param.articleId
 * @param {string} param.boardId
 * @param {string} param.content
 * @param {string} [param.parentCommentId]
 * @param {number} [param.withinMs=12000]
 * @returns {Promise<{ _id: import('mongoose').Types.ObjectId } | null>}
 */
export async function findRecentDuplicateComment({
  email,
  articleId,
  boardId,
  content,
  parentCommentId = '',
  withinMs = 12000
}) {
  try {
    const filter = {
      email,
      articleId,
      boardId,
      content,
      state: 'write',
      createdAt: { $gte: new Date(Date.now() - withinMs) }
    };
    if (parentCommentId) {
      filter.parentCommentId = parentCommentId;
    } else {
      filter.$or = [{ parentCommentId: null }, { parentCommentId: { $exists: false } }];
    }
    return await Comment.findOne(filter).sort({ createdAt: -1 }).select({ _id: 1 }).lean();
  } catch {
    return null;
  }
}
