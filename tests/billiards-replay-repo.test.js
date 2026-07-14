// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({ getPrisma: vi.fn() }));
vi.mock('$lib/database/prisma.js', () => prismaModule);

describe('billiardsReplayRepo', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it('creates article and replay in one transaction', async () => {
    const articleCreate = vi.fn().mockResolvedValue({});
    const replayCreate = vi.fn().mockResolvedValue({});
    const transaction = vi.fn(async (callback) =>
      callback({
        article: { create: articleCreate },
        billiardsReplay: { create: replayCreate }
      })
    );
    prismaModule.getPrisma.mockReturnValue({ $transaction: transaction });

    const { createBilliardsReplayArticle } = await import(
      '../src/lib/server/billiardsReplayRepo.js'
    );
    const result = await createBilliardsReplayArticle({
      email: 'player@example.com',
      nickname: '선수',
      boardId: 'free',
      title: '리플레이',
      content: '<p>공유</p>',
      replay: { id: 'shot-1', frames: [{}, {}] }
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(articleCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: result.articleId, boardId: 'free', title: '리플레이' })
    });
    expect(replayCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: result.replayId,
        articleId: result.articleId,
        email: 'player@example.com'
      })
    });
  });
});
