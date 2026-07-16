// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const articlePageSource = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);

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

  it('ships card-flip, winner, and chip animations for shared hands', () => {
    expect(articlePageSource).toContain('@keyframes seotdaShareFlip');
    expect(articlePageSource).toContain('@keyframes seotdaShareWinner');
    expect(articlePageSource).toContain('@keyframes seotdaShareChip');
    expect(articlePageSource).toContain('@keyframes seotdaShareDdaeng');
    expect(articlePageSource).toContain('.seotda-share-ddaeng-layer');
    expect(articlePageSource).toContain('.seotda-share-card');
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
        content: expect.stringMatching(/seotda-share-card[\s\S]*레이즈 성공![\s\S]*알리[\s\S]*아귀/)
      })
    );
    const { content } = articleRepo.createArticle.mock.calls[0][0];
    expect(content).toContain('class="seotda-share-seat is-winner"');
    expect(content).toContain('src="/images/seotda/hwatu/01.webp"');
    expect(content).toContain('src="/images/seotda/hwatu/02.webp"');
    expect(content).toContain('class="seotda-share-action"');
    expect(content).not.toContain('<h4>진행 기록</h4>');
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
    expect(content).toContain('class="seotda-share-card-back"');
    expect(content).not.toContain('/images/seotda/hwatu/03.webp');
    expect(content).not.toContain('/images/seotda/hwatu/04.webp');
  });

  it('reveals only the winning ddaeng art after the user folded', async () => {
    const round = completedRound();
    round.seats[0].folded = true;
    round.seats[1].cards = [
      { month: 10, gwang: false },
      { month: 10, gwang: false }
    ];
    round.winnerId = 'npc_agwi';
    round.winnerIds = ['npc_agwi'];
    round.ddaengWinnerId = 'npc_agwi';
    round.ddaengHandName = '장땡';
    round.ddaengValuePerLoser = 200;
    round.ddaengTotalPaid = 200;
    state.getRound.mockReturnValue(round);
    const { POST } = await import('../src/routes/games/seotda/share/+server.js');

    await POST(makeEvent({ boardId: 'free' }));

    const { content } = articleRepo.createArticle.mock.calls[0][0];
    expect(content.match(/\/images\/seotda\/hwatu\/10\.webp/g)).toHaveLength(2);
    expect(content).toContain('장땡');
    expect(content).toContain('class="seotda-share-ddaeng-layer"');
    expect(content).toContain('1인당 200점');
    expect(content).toContain('총 200점');
  });

  it('requires login', async () => {
    const { POST } = await import('../src/routes/games/seotda/share/+server.js');

    await expect(POST(makeEvent({}, null))).rejects.toMatchObject({ status: 401 });
    expect(articleRepo.createArticle).not.toHaveBeenCalled();
  });
});
