import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({
  getPrisma: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);

describe('articleRepo', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads only alarm-target fields for comment notification lookups', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'article-1',
      email: 'writer@example.com',
      title: 'title'
    });

    prismaModule.getPrisma.mockReturnValue({
      article: { findFirst }
    });

    const { findArticleAlarmTarget } = await import('../src/lib/server/board/articleRepo.js');

    const result = await findArticleAlarmTarget('article-1', 'free');

    expect(result).toEqual({
      id: 'article-1',
      email: 'writer@example.com',
      title: 'title'
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'article-1', boardId: 'free', state: 'write' },
      select: {
        id: true,
        email: true,
        title: true
      }
    });
  });
});
