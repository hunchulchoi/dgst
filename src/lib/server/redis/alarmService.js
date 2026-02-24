import * as redis from './client.js';
import logger from '$lib/util/logger.js';

const ALARM_TTL = 60 * 60 * 24 * 30; // 30 일간 보관

// Helper: 사용자별 알림 ZSET 키 (업데이트 시간순 정렬)
function getZSetKey(email) {
    return redis.key(`alarms:list:${email}`);
}

// Helper: 알림 상세 데이터 해시 키
function getHashKey(alarmId) {
    return redis.key(`alarms:data:${alarmId}`);
}

/**
 * 읽지 않은 알람 개수 카운트
 * @param {string} email
 * @param {number} hours (최근 n시간)
 */
export async function getUnreadAlarmCount(email, hours = 24) {
    const client = await redis.getClient();
    if (!client) return 0; // Redis 연결 실패 시 0 반환

    const zsetKey = getZSetKey(email);
    const timeLimit = Date.now() - (1000 * 60 * 60 * hours);

    // 지정된 시간 이후에 업데이트된 알람 ID 조회
    const alarmIds = await client.zrevrangebyscore(zsetKey, '+inf', timeLimit);
    if (!alarmIds || alarmIds.length === 0) return 0;

    const hashKeys = alarmIds.map(getHashKey);
    const dataList = await client.mget(...hashKeys);

    let unreadCount = 0;
    for (const item of dataList) {
        if (item) {
            try {
                const parsed = JSON.parse(item);
                if (parsed.readAt == null) unreadCount++;
            } catch (e) {
                console.error('JSON Parse Error inside AlarmService', e);
            }
        }
    }
    return unreadCount;
}

/**
 * 알림 목록 조회
 * @param {string} email
 * @param {number} limit
 */
export async function getAlarmList(email, limit = 30) {
    const client = await redis.getClient();
    if (!client) return [];

    const zsetKey = getZSetKey(email);
    const alarmIds = await client.zrevrange(zsetKey, 0, limit - 1);
    if (!alarmIds || alarmIds.length === 0) return [];

    const hashKeys = alarmIds.map(getHashKey);
    const dataList = await client.mget(...hashKeys);

    const result = [];
    for (let i = 0; i < dataList.length; i++) {
        const item = dataList[i];
        if (item) {
            try {
                const parsed = JSON.parse(item);
                // commentCount virtual field 처리
                parsed.commentCount = parsed.comments?.length || 0;
                result.push(parsed);
            } catch (e) { }
        } else {
            // 존재하지 않는 알림이면 zset에서도 정리
            client.zrem(zsetKey, alarmIds[i]).catch(() => { });
        }
    }
    return result;
}

/**
 * নির্দিষ্ট 게시글/댓글과 관련된 사용자의 알람을 읽음 처리
 * @param {string} email
 * @param {string} articleId
 */
export async function markAsRead(email, articleId) {
    const client = await redis.getClient();
    if (!client) return;

    const zsetKey = getZSetKey(email);
    const alarmIds = await client.zrange(zsetKey, 0, -1);

    for (const id of alarmIds) {
        // alarmId 규칙: `${articleId}` 또는 `${articleId}_${parentCommentId}`
        if (id === articleId || id.startsWith(`${articleId}_`)) {
            const hk = getHashKey(id);
            const str = await client.get(hk);
            if (str) {
                try {
                    const alarm = JSON.parse(str);
                    if (alarm.readAt == null) {
                        alarm.readAt = new Date().toISOString();
                        await client.setex(hk, ALARM_TTL, JSON.stringify(alarm));
                    }
                } catch (e) { }
            }
        }
    }
}

/**
 * 알림 데이터 Upsert (추가 및 갱신)
 * @param {Object} param0
 */
export async function upsertAlarm({ email, articleId, title, boardId, parentCommentId, parentCommentContent, newCommentId }) {
    const client = await redis.getClient();
    if (!client) return;

    // 댓글에 달린 대댓글 알람이냐, 글에 달린 일반 댓글 알람이냐 구분
    const alarmId = parentCommentId ? `${articleId}_${parentCommentId}` : articleId;
    const hk = getHashKey(alarmId);
    const zsetKey = getZSetKey(email);
    const now = new Date().toISOString();

    const existingStr = await client.get(hk);
    let alarm;
    if (existingStr) {
        try {
            alarm = JSON.parse(existingStr);
            if (newCommentId && !alarm.comments.includes(newCommentId)) {
                alarm.comments.push(newCommentId);
            }
            alarm.title = title;
            alarm.boardId = boardId;
            alarm.readAt = null;
            alarm.updatedAt = now;
        } catch (e) { }
    }

    if (!alarm) {
        // Create new
        alarm = {
            _id: alarmId,
            email,
            articleId,
            boardId,
            title,
            comment: parentCommentId || null,
            commentContent: parentCommentContent || null,
            comments: newCommentId ? [newCommentId] : [],
            readAt: null,
            createdAt: now,
            updatedAt: now
        };
    }

    try {
        // 데이터 해시 업데이트
        await client.setex(hk, ALARM_TTL, JSON.stringify(alarm));
        // 사용자 ZSET에 순위 업데이트 (최신 등록)
        await client.zadd(zsetKey, Date.now(), alarmId);
        logger.info(`🔔 [Redis Alarm] ✅ 알림 저장 성공 - 대상: ${email}, 게시판: ${boardId}, 알람 ID: ${alarmId}`);
    } catch (error) {
        logger.error({
            message: `🚨 [Redis Alarm] ❌ 알림 저장 실패 - 대상: ${email}, 게시판: ${boardId}, 알람 ID: ${alarmId}`,
            error
        });
    }
}

/**
 * 특정 게시물 연관 알림 전체 삭제
 * @param {string} articleId
 */
export async function deleteAlarmsByArticle(articleId) {
    const client = await redis.getClient();
    if (!client) return;

    let cursor = '0';
    const pattern = redis.key(`alarms:data:${articleId}*`);

    try {
        do {
            // scan 사용
            const res = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = res[0];
            const keys = res[1];

            if (keys.length > 0) {
                await client.del(...keys);
            }
        } while (cursor !== '0');
    } catch (e) {
        console.error('deleteAlarmsByArticle error', e);
    }
}
