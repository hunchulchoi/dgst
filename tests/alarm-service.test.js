import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({
  getPrisma: vi.fn()
}));

const loggerModule = vi.hoisted(() => ({
  default: {
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);
vi.mock('$lib/util/logger.js', () => loggerModule);

describe('alarmService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts only unread alarms updated within the requested hour window', async () => {
    const count = vi.fn().mockResolvedValue(7);

    prismaModule.getPrisma.mockReturnValue({
      alarm: { count }
    });

    const { getUnreadAlarmCount } = await import('../src/lib/server/alarm/alarmService.js');

    const result = await getUnreadAlarmCount('user@example.com');

    expect(result).toBe(7);
    expect(count).toHaveBeenCalledWith({
      where: {
        email: 'user@example.com',
        readAt: null,
        updatedAt: { gte: new Date('2026-06-13T12:00:00.000Z') }
      }
    });
  });

  it('marks only unread alarms for the article and its comment thread ids', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });

    prismaModule.getPrisma.mockReturnValue({
      alarm: { updateMany }
    });

    const { markAsRead } = await import('../src/lib/server/alarm/alarmService.js');

    await markAsRead('user@example.com', 'article-1');

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        email: 'user@example.com',
        readAt: null,
        OR: [{ id: 'article-1' }, { id: { startsWith: 'article-1_' } }]
      },
      data: {
        readAt: expect.any(Date)
      }
    });
  });

  it('upserts an existing alarm by appending only new comment ids and resetting readAt', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'article-1',
      commentIds: ['comment-1'],
      readAt: new Date('2026-06-14T00:00:00.000Z')
    });
    const update = vi.fn().mockResolvedValue({});
    const create = vi.fn();

    prismaModule.getPrisma.mockReturnValue({
      alarm: { findUnique, update, create }
    });

    const { upsertAlarm } = await import('../src/lib/server/alarm/alarmService.js');

    await upsertAlarm({
      email: 'owner@example.com',
      articleId: 'article-1',
      title: 'title',
      boardId: 'free',
      newCommentId: 'comment-2'
    });

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'article-1' } });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'article-1' },
      data: {
        title: 'title',
        boardId: 'free',
        commentIds: ['comment-1', 'comment-2'],
        readAt: null
      }
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('does not duplicate an existing comment id during alarm upsert', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'article-1_comment-1',
      commentIds: ['comment-9']
    });
    const update = vi.fn().mockResolvedValue({});

    prismaModule.getPrisma.mockReturnValue({
      alarm: { findUnique, update, create: vi.fn() }
    });

    const { upsertAlarm } = await import('../src/lib/server/alarm/alarmService.js');

    await upsertAlarm({
      email: 'owner@example.com',
      articleId: 'article-1',
      title: 'title',
      boardId: 'free',
      parentCommentId: 'comment-1',
      newCommentId: 'comment-9'
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'article-1_comment-1' },
      data: {
        title: 'title',
        boardId: 'free',
        commentIds: ['comment-9'],
        readAt: null
      }
    });
  });

  it('removes a comment id from alarm and deletes the alarm when it becomes empty', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'article-1',
      commentIds: ['comment-1']
    });
    const del = vi.fn().mockResolvedValue({});
    const update = vi.fn();

    prismaModule.getPrisma.mockReturnValue({
      alarm: { findUnique, delete: del, update }
    });

    const { removeCommentFromAlarm } = await import('../src/lib/server/alarm/alarmService.js');

    await removeCommentFromAlarm({
      email: 'owner@example.com',
      articleId: 'article-1',
      parentCommentId: null,
      commentId: 'comment-1'
    });

    expect(del).toHaveBeenCalledWith({ where: { id: 'article-1' } });
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps the alarm row when other comment ids remain', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'article-1_comment-1',
      commentIds: ['comment-1', 'comment-2']
    });
    const del = vi.fn();
    const update = vi.fn().mockResolvedValue({});

    prismaModule.getPrisma.mockReturnValue({
      alarm: { findUnique, delete: del, update }
    });

    const { removeCommentFromAlarm } = await import('../src/lib/server/alarm/alarmService.js');

    await removeCommentFromAlarm({
      email: 'owner@example.com',
      articleId: 'article-1',
      parentCommentId: 'comment-1',
      commentId: 'comment-2'
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'article-1_comment-1' },
      data: { commentIds: ['comment-1'] }
    });
    expect(del).not.toHaveBeenCalled();
  });
});
