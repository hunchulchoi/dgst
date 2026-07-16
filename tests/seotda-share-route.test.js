// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rateLimit = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
const sessionDevice = vi.hoisted(() => ({ checkAndLogSessionDevice: vi.fn() }));
const state = vi.hoisted(() => ({ getRound: vi.fn() }));
const articleRepo = vi.hoisted(() => ({ createArticle: vi.fn() }));
const boardCache = vi.hoisted(() => ({ bustBoardListCache: vi.fn() }));

vi.mock('$lib/server/apiRateLimit.js', () => rateLimit);
vi.mock('$lib/server/auth/checkSessionDevice.js', () => sessionDevice);
vi.mock('../src/routes/games/seotda/seotdaState.js', () => state);
vi.mock('$lib/server/board/articleRepo.js', () => articleRepo);
vi.mock('$lib/server/boardListLoad.js', () => boardCache);

function completedRound() {
  return {
    phase: 'showdown',
    showdown: true,
    winnerId: 'user',
    winnerIds: ['user'],
    pot: 0,
    log: ['나: 레이즈 (100)', '아귀: 콜 (100)', '나 승리! 알리'],
    seats: [
      {
        id: 'user',
        name: '나',
        isNpc: false,
        chips: 1200,
        folded: false,
        cards: [
          { month: 1, gwang: false },
          { month: 2, gwang: false }
        ]
      },
      {
        id: 'npc_agwi',
        name: '아귀',
        isNpc: true,
        chips: 800,
        folded: false,
        cards: [
          { month: 3, gwang: false },
          { month: 4, gwang: false }
        ]
      }
    ]
  };
}

function makeEvent(body, user = { email: 'player@example.com', nickname: '타짜' }) {
  return {
    request: new Request('https://dgst.me/games/seotda/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    locals: { auth: vi.fn().mockResolvedValue(user ? { user } : null) }
  };
}

describe('seotda board share route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    rateLimit.checkRateLimit.mockResolvedValue({ allowed: true });
    state.getRound.mockReturnValue(completedRound());
    articleRepo.createArticle.mockResolvedValue({ id: 'article-1' });
  });

  it('creates an article from the server-owned completed round', async () => {
    const { POST } = await import('../src/routes/games/seotda/share/+server.js');
    const response = await POST(
      makeEvent({ boardId: 'free', title: '알리로 승리', note: '레이즈 성공!' })
    );
    const body = await response.json();

    expect(body).toEqual({ success: true, boardId: 'free', articleId: 'article-1' });
    expect(state.getRound).toHaveBeenCalledWith('player@example.com');
    expect(articleRepo.createArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'player@example.com',
        nickname: '타짜',
        boardId: 'free',
        title: '알리로 승리',
        content: expect.stringMatching(/레이즈 성공![\s\S]*알리[\s\S]*아귀/)
      })
    );
    expect(boardCache.bustBoardListCache).toHaveBeenCalledWith('free');
  });

  it('rejects sharing before showdown', async () => {
    state.getRound.mockReturnValue({ ...completedRound(), phase: 'betting', showdown: false });
    const { POST } = await import('../src/routes/games/seotda/share/+server.js');

    await expect(POST(makeEvent({ boardId: 'free' }))).rejects.toMatchObject({ status: 400 });
    expect(articleRepo.createArticle).not.toHaveBeenCalled();
  });

  it('keeps NPC hands hidden when the user folded', async () => {
    const round = completedRound();
    round.seats[0].folded = true;
    round.winnerId = 'npc_agwi';
    round.winnerIds = ['npc_agwi'];
    state.getRound.mockReturnValue(round);
    const { POST } = await import('../src/routes/games/seotda/share/+server.js');

    await POST(makeEvent({ boardId: 'free' }));

    const { content } = articleRepo.createArticle.mock.calls[0][0];
    expect(content).toContain('<strong>아귀</strong>: 비공개');
    expect(content).not.toContain('3 · 4');
  });

  it('requires login', async () => {
    const { POST } = await import('../src/routes/games/seotda/share/+server.js');

    await expect(POST(makeEvent({}, null))).rejects.toMatchObject({ status: 401 });
    expect(articleRepo.createArticle).not.toHaveBeenCalled();
  });
});
