import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({
  getPrisma: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);

describe('articleRepo', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('loads only profile fields needed for the article author panel', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      photo: '/writer.jpg',
      introduction: 'hello'
    });

    prismaModule.getPrisma.mockReturnValue({
      user: { findFirst }
    });

    const { findArticleAuthorProfile } = await import('../src/lib/server/board/articleRepo.js');

    const result = await findArticleAuthorProfile('writer@example.com');

    expect(result).toEqual({
      photo: '/writer.jpg',
      introduction: 'hello'
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: 'writer@example.com' },
      select: {
        photo: true,
        introduction: true
      }
    });
  });

  it('stores the latest article read time while preserving first-read count semantics', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));
    const findUnique = vi.fn().mockResolvedValue({
      id: 'article-1',
      reads: []
    });
    const update = vi.fn().mockResolvedValue({
      id: 'article-1',
      reads: ['viewer@example.com']
    });
    const upsert = vi.fn().mockResolvedValue({});

    prismaModule.getPrisma.mockReturnValue({
      article: { findUnique, update },
      articleRead: { upsert }
    });

    const { addRead } = await import('../src/lib/server/board/articleRepo.js');

    const result = await addRead('article-1', 'viewer@example.com');

    expect(result).toEqual({
      id: 'article-1',
      reads: ['viewer@example.com']
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'article-1' },
      data: { reads: { push: 'viewer@example.com' } }
    });
    expect(upsert).toHaveBeenCalledWith({
      where: {
        articleId_viewerId: {
          articleId: 'article-1',
          viewerId: 'viewer@example.com'
        }
      },
      update: { readAt: new Date('2026-06-14T12:00:00.000Z') },
      create: {
        articleId: 'article-1',
        viewerId: 'viewer@example.com',
        readAt: new Date('2026-06-14T12:00:00.000Z')
      }
    });
  });

  it('stores derived content flags when creating an article', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'article-1' });

    prismaModule.getPrisma.mockReturnValue({
      article: { create }
    });

    const { createArticle } = await import('../src/lib/server/board/articleRepo.js');

    await createArticle({
      email: 'writer@example.com',
      nickname: 'writer',
      boardId: 'free',
      title: 'title',
      content:
        '<p><img src="/a.jpg" /></p><audio src="/a.m4a" controls></audio><iframe src="https://www.youtube.com/embed/abc"></iframe><blockquote class="instagram-media"></blockquote>'
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'writer@example.com',
        nickname: 'writer',
        boardId: 'free',
        title: 'title',
        hasImage: true,
        hasVideo: false,
        hasAudio: true,
        hasYoutube: true,
        hasInstagram: true
      })
    });
  });

  it('renders an audio marker for audio content flags', async () => {
    const { contentIcons } = await import('../src/lib/server/board/articleRepo.js');

    const result = contentIcons('<p><audio src="/voice.m4a" controls></audio></p>');

    expect(result).toContain('bi-music-note-beamed');
    expect(result).toContain('text-info');
  });

  it('recomputes derived content flags when updating article content', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'article-1' });

    prismaModule.getPrisma.mockReturnValue({
      article: { update }
    });

    const { updateArticle } = await import('../src/lib/server/board/articleRepo.js');

    await updateArticle('article-1', {
      content: '<video src="/a.mp4"></video><p>plain</p>',
      modifiedEmail: 'writer@example.com'
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'article-1' },
      data: {
        content: '<video src="/a.mp4"></video><p>plain</p>',
        modifiedEmail: 'writer@example.com',
        hasImage: false,
        hasVideo: true,
        hasAudio: false,
        hasYoutube: false,
        hasInstagram: false
      }
    });
  });
});
