import { getPrisma } from '$lib/database/prisma.js';
import logger from '$lib/util/logger.js';
import { normalizeToIsoString } from '$lib/util/formatRelativeTime.js';

const ALARM_TTL_DAYS = 3;

/**
 * @param {string} articleId
 * @param {string | null | undefined} parentCommentId
 * @returns {string}
 */
function buildAlarmId(articleId, parentCommentId) {
  return parentCommentId ? `${articleId}_${parentCommentId}` : articleId;
}

/**
 * @param {import('@prisma/client').Alarm} alarm
 * @returns {Record<string, unknown>}
 */
function normalizeAlarmRecord(alarm) {
  const commentIds = Array.isArray(alarm.commentIds) ? alarm.commentIds : [];
  return {
    _id: alarm.id,
    id: alarm.id,
    email: alarm.email,
    articleId: alarm.articleId,
    boardId: alarm.boardId,
    title: alarm.title,
    comment: alarm.parentCommentId ?? null,
    parentCommentId: alarm.parentCommentId ?? null,
    commentContent: alarm.commentContent ?? null,
    comments: commentIds,
    commentIds,
    commentCount: commentIds.length,
    readAt: alarm.readAt ? normalizeToIsoString(alarm.readAt) : null,
    createdAt: normalizeToIsoString(alarm.createdAt),
    updatedAt: normalizeToIsoString(alarm.updatedAt ?? alarm.createdAt)
  };
}

/**
 * 읽지 않은 알람 개수 카운트
 * @param {string} email
 * @param {number} hours (최근 n시간)
 */
export async function getUnreadAlarmCount(email, hours = 24) {
  try {
    const timeLimit = new Date(Date.now() - 1000 * 60 * 60 * hours);
    const count = await getPrisma().alarm.count({
      where: {
        email,
        readAt: null,
        updatedAt: { gte: timeLimit }
      }
    });
    return count;
  } catch (err) {
    logger.warn({
      message: '[alarm] getUnreadAlarmCount failed',
      email,
      errorMessage: err instanceof Error ? err.message : String(err)
    });
    return 0;
  }
}

/**
 * 알림 목록 조회
 * @param {string} email
 * @param {number} limit
 */
export async function getAlarmList(email, limit = 30) {
  try {
    const alarms = await getPrisma().alarm.findMany({
      where: { email },
      orderBy: { updatedAt: 'desc' },
      take: limit
    });
    return alarms.map(normalizeAlarmRecord);
  } catch (err) {
    logger.warn({
      message: '[alarm] getAlarmList failed',
      email,
      errorMessage: err instanceof Error ? err.message : String(err)
    });
    return [];
  }
}

/**
 * 특정 게시글/댓글과 관련된 사용자의 알람을 읽음 처리
 * @param {string} email
 * @param {string} articleId
 */
export async function markAsRead(email, articleId) {
  try {
    const prisma = getPrisma();
    await prisma.alarm.updateMany({
      where: {
        email,
        readAt: null,
        OR: [{ id: articleId }, { id: { startsWith: `${articleId}_` } }]
      },
      data: { readAt: new Date() }
    });
  } catch (err) {
    logger.warn({
      message: '[alarm] markAsRead failed',
      email,
      articleId,
      errorMessage: err instanceof Error ? err.message : String(err)
    });
  }
}

/**
 * 알림 데이터 Upsert (추가 및 갱신)
 * @param {{
 *   email: string;
 *   articleId: string;
 *   title: string;
 *   boardId: string;
 *   parentCommentId?: string | null;
 *   parentCommentContent?: string | null;
 *   newCommentId?: string | null;
 * }} param0
 */
export async function upsertAlarm({
  email,
  articleId,
  title,
  boardId,
  parentCommentId,
  parentCommentContent,
  newCommentId
}) {
  const alarmId = buildAlarmId(articleId, parentCommentId);

  try {
    const prisma = getPrisma();
    const existing = await prisma.alarm.findUnique({ where: { id: alarmId } });

    if (existing) {
      const commentIds = [...existing.commentIds];
      if (newCommentId && !commentIds.includes(newCommentId)) {
        commentIds.push(newCommentId);
      }

      await prisma.alarm.update({
        where: { id: alarmId },
        data: {
          title,
          boardId,
          commentIds,
          readAt: null
        }
      });
      return;
    }

    await prisma.alarm.create({
      data: {
        id: alarmId,
        email,
        articleId,
        boardId,
        title,
        parentCommentId: parentCommentId || null,
        commentContent: parentCommentContent || null,
        commentIds: newCommentId ? [newCommentId] : [],
        readAt: null
      }
    });
  } catch (error) {
    logger.error({
      message: `🚨 [Alarm] ❌ 알림 저장 실패 - 대상: ${email}, 게시판: ${boardId}, 알람 ID: ${alarmId}`,
      error
    });
  }
}

/**
 * 특정 게시물 연관 알림 전체 삭제
 * @param {string} articleId
 */
export async function deleteAlarmsByArticle(articleId) {
  try {
    await getPrisma().alarm.deleteMany({
      where: {
        OR: [{ id: articleId }, { id: { startsWith: `${articleId}_` } }]
      }
    });
  } catch (err) {
    logger.error({
      message: '[alarm] deleteAlarmsByArticle failed',
      articleId,
      errorMessage: err instanceof Error ? err.message : String(err)
    });
  }
}

/**
 * 알람에서 특정 댓글을 제거하고, 빈 알람(댓글이 없는 상태)이 되면 알람을 완전히 삭제합니다.
 * @param {{
 *   email: string;
 *   articleId: string;
 *   parentCommentId?: string | null;
 *   commentId: string;
 * }} param0
 */
export async function removeCommentFromAlarm({ email, articleId, parentCommentId, commentId }) {
  const alarmId = buildAlarmId(articleId, parentCommentId);

  try {
    const prisma = getPrisma();
    const existing = await prisma.alarm.findUnique({ where: { id: alarmId } });
    if (!existing) return;

    const commentIndex = existing.commentIds.indexOf(commentId);
    if (commentIndex === -1) return;

    const commentIds = existing.commentIds.filter((id) => id !== commentId);

    if (commentIds.length === 0) {
      await prisma.alarm.delete({ where: { id: alarmId } });
    } else {
      await prisma.alarm.update({
        where: { id: alarmId },
        data: { commentIds }
      });
    }
  } catch (err) {
    logger.error({
      message: `🚨 [Alarm] ❌ 알람 내 댓글 제거 실패 - 대상: ${email}, 알람 ID: ${alarmId}`,
      error: err
    });
  }
}

/**
 * ALARM_TTL(3일)보다 오래된 알람 삭제
 * @returns {Promise<number>}
 */
export async function pruneExpiredAlarms() {
  const cutoff = new Date(Date.now() - ALARM_TTL_DAYS * 24 * 60 * 60 * 1000);
  const result = await getPrisma().alarm.deleteMany({
    where: { updatedAt: { lt: cutoff } }
  });
  return result.count;
}
