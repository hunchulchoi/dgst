// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({ getPrisma: vi.fn() }));
const alarmService = vi.hoisted(() => ({
  markAsRead: vi.fn(),
  upsertAlarm: vi.fn()
}));
const commentRepo = vi.hoisted(() => ({
  createComment: vi.fn(),
  findCommentById: vi.fn(),
  findCommentsByArticle: vi.fn(),
  toCommentJson: vi.fn()
}));
const authCheck = vi.hoisted(() => ({ checkAndLogSessionDevice: vi.fn() }));
const arcadeWallet = vi.hoisted(() => ({ applyArcadeEntry: vi.fn() }));
const submitDedup = vi.hoisted(() => ({
  buildSubmitFingerprint: vi.fn(() => 'fingerprint'),
  findRecentDuplicateComment: vi.fn(),
  tryAcquireSubmitDedup: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);
vi.mock('$lib/server/alarm/alarmService.js', () => alarmService);
vi.mock('$lib/server/board/commentRepo.js', () => commentRepo);
vi.mock('$lib/server/auth/checkSessionDevice.js', () => authCheck);
vi.mock('$lib/server/arcadeWallet.js', () => arcadeWallet);
vi.mock('$lib/server/submitDedup.js', () => submitDedup);

describe('slot comment route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();

    submitDedup.tryAcquireSubmitDedup.mockResolvedValue(true);
    arcadeWallet.applyArcadeEntry.mockResolvedValue({ balance: 600, score: {} });
  });

  it('creates replies without failing the slot comment request', async () => {
    const parentComment = {
      id: 'parent-1',
      email: 'parent@example.com',
      nickname: 'parent',
      boardId: 'slot',
      articleId: 'slot',
      content: 'parent comment',
      depth: 1
    };
    const createdComment = {
      id: 'reply-1',
      email: 'reply@example.com',
      nickname: 'replyer',
      photo: null,
      boardId: 'slot',
      articleId: 'slot',
      parentCommentId: 'parent-1',
      parentCommentNickname: 'parent',
      depth: 2,
      content: 'reply body',
      image: null,
      state: 'write',
      modifiedEmail: null,
      createdAt: new Date('2026-06-23T00:00:00.000Z'),
      updatedAt: new Date('2026-06-23T00:00:00.000Z'),
      likes: []
    };
    const count = vi.fn().mockResolvedValue(0);
    const upsertArticle = vi.fn().mockResolvedValue({});

    prismaModule.getPrisma.mockReturnValue({
      article: { upsert: upsertArticle },
      gameScore: { count }
    });
    commentRepo.findCommentById.mockResolvedValue(parentComment);
    commentRepo.createComment.mockResolvedValue(createdComment);
    commentRepo.toCommentJson.mockReturnValue({ id: 'reply-1', content: 'reply body' });

    const formData = new FormData();
    formData.set('content', 'reply body');
    formData.set('parentCommentId', 'parent-1');

    const { POST } = await import('../src/routes/games/slot/comment/+server.js');
    const response = await POST({
      locals: {
        auth: vi.fn().mockResolvedValue({
          user: { email: 'reply@example.com', nickname: 'replyer', photo: null }
        })
      },
      request: { formData: vi.fn().mockResolvedValue(formData) }
    });

    await expect(response.json()).resolves.toEqual({
      success: true,
      comment: { id: 'reply-1', content: 'reply body' },
      rewardGiven: true,
      rewardBalance: 600
    });
    expect(response.status).toBe(200);
    expect(upsertArticle).toHaveBeenCalledWith({
      where: { id: 'slot' },
      update: {},
      create: expect.objectContaining({
        id: 'slot',
        boardId: 'slot',
        title: '뺑뺑이'
      })
    });
    expect(commentRepo.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: 'slot',
        articleId: 'slot',
        parentCommentId: 'parent-1',
        parentCommentNickname: 'parent',
        depth: 2
      })
    );
    expect(alarmService.upsertAlarm).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'parent@example.com',
        articleId: 'slot',
        boardId: 'slot',
        parentCommentId: 'parent-1',
        newCommentId: 'reply-1'
      })
    );
  });

  it('rewards an automatic seotda game-result reply and returns the updated balance', async () => {
    const createdComment = {
      id: 'seotda-comment-1',
      email: 'player@example.com',
      nickname: '타짜',
      photo: null,
      boardId: 'seotda',
      articleId: 'seotda',
      depth: 1,
      content: '한 판 더',
      image: null,
      state: 'write',
      modifiedEmail: null,
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
      updatedAt: new Date('2026-07-24T00:00:00.000Z'),
      likes: []
    };
    arcadeWallet.applyArcadeEntry.mockResolvedValue({ balance: 1000, score: {} });
    prismaModule.getPrisma.mockReturnValue({
      article: { upsert: vi.fn().mockResolvedValue({}) },
      gameScore: {
        count: vi.fn().mockResolvedValue(0)
      }
    });
    commentRepo.createComment.mockResolvedValue(createdComment);
    commentRepo.toCommentJson.mockReturnValue({ id: 'seotda-comment-1', content: '한 판 더' });

    const formData = new FormData();
    formData.set('content', '한 판 더');
    formData.set('game', 'seotda');
    formData.set('automatic', '1');

    const { POST } = await import('../src/routes/games/slot/comment/+server.js');
    const response = await POST({
      locals: {
        auth: vi.fn().mockResolvedValue({
          user: { email: 'player@example.com', nickname: '타짜', photo: null }
        })
      },
      request: { formData: vi.fn().mockResolvedValue(formData) }
    });

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      rewardGiven: true,
      rewardBalance: 1000
    });
    expect(arcadeWallet.applyArcadeEntry).toHaveBeenCalledWith(
      'player@example.com',
      '타짜',
      expect.objectContaining({
        game: 'seotda',
        payout: 100,
        delta: 100,
        reels: ['comment', 'seotda', '-']
      })
    );
  });
});
