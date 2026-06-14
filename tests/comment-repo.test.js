import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({
  getPrisma: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);

describe('commentRepo', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads only the selected fields for an owned active comment lookup', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'comment-1'
    });

    prismaModule.getPrisma.mockReturnValue({
      comment: { findFirst }
    });

    const { findOwnedActiveComment } = await import('../src/lib/server/board/commentRepo.js');

    const result = await findOwnedActiveComment({
      id: 'comment-1',
      email: 'user@example.com',
      boardId: 'free',
      articleId: 'article-1',
      select: { id: true }
    });

    expect(result).toEqual({ id: 'comment-1' });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'comment-1',
        email: 'user@example.com',
        boardId: 'free',
        articleId: 'article-1',
        state: 'write'
      },
      select: { id: true }
    });
  });
});
