// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractSeotdaReplay } from '../src/lib/server/seotdaReplay.js';

const articlePageSource = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);
const replayPlayerSource = readFileSync('src/lib/components/SeotdaReplayPlayer.svelte', 'utf8');

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
    ruleMode: 'classic',
    series: {
      handNo: 3,
      isBoss: false,
      bossNpcId: null,
      anteMultiplier: 1,
      completed: 2,
      userWins: 1,
      npcWins: 1
    },
    event: {
      id: 'high-roller',
      name: '큰판',
      description: '기본 판돈 2배',
      anteMultiplier: 2,
      maxRaises: 3
    },
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
        ],
        emotion: {
          mood: '벼르는 중',
          line: '아까 그 판, 잊지 않았다.',
          revenge: true,
          aggression: 2
        },
        tell: {
          signal: 'strong',
          label: '강한 기색',
          text: '입꼬리가 슬쩍 올라간다.'
        }
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

  it('ships an interactive replay player for shared hands', () => {
    expect(articlePageSource).toContain('<SeotdaReplayPlayer replay={data.seotdaReplay} />');
    expect(replayPlayerSource).toContain('class="card-shell"');
    expect(replayPlayerSource).toContain(
      "import HwatuCardFace from '../../routes/games/seotda/HwatuCardFace.svelte'"
    );
    expect(replayPlayerSource).toContain('<HwatuCardFace {card} />');
    expect(replayPlayerSource).not.toContain('/images/seotda/hwatu/');
    expect(replayPlayerSource).toContain('function scheduleNext()');
    expect(replayPlayerSource).toContain("currentEvent?.type === 'ddaeng'");
    expect(replayPlayerSource).toContain("currentEvent?.type === 'result'");
    expect(replayPlayerSource).toContain('class:user-seat');
    expect(replayPlayerSource).toContain(
      '{@const showCard = Boolean(card) && cardsRevealed}'
    );
    expect(replayPlayerSource).not.toContain("seat.id === 'user' ? step > 0 : cardsRevealed");
    expect(replayPlayerSource).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(replayPlayerSource).toContain('@keyframes chipToPot');
    expect(replayPlayerSource).toContain('hasFoldedAtCurrentStep');
    expect(replayPlayerSource).toContain('actionLabel(currentEvent)');
    expect(replayPlayerSource).toContain('class="speech-bubble"');
    expect(replayPlayerSource).toContain('@keyframes speechPop');
    expect(replayPlayerSource).toContain('Math.min(6000, Math.max(3200');
    expect(replayPlayerSource).toContain("game.ruleMode === 'classic'");
    expect(replayPlayerSource).toContain('game.series?.isBoss');
    expect(replayPlayerSource).toContain('game.event.name');
    expect(replayPlayerSource).toContain('seat.emotion');
    expect(replayPlayerSource).toContain('seat.tell');
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
        content: expect.stringContaining('class="seotda-replay-data"')
      })
    );
    const { content } = articleRepo.createArticle.mock.calls[0][0];
    const replay = extractSeotdaReplay(content);
    expect(replay).toMatchObject({
      version: 2,
      result: '승리',
      note: '레이즈 성공!',
      ruleMode: 'classic',
      series: { handNo: 3, completed: 3, userWins: 2, npcWins: 1 },
      event: { id: 'high-roller', name: '큰판', anteMultiplier: 2 }
    });
    expect(replay.seats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'user', winner: true, handName: '알리' }),
        expect.objectContaining({
          id: 'npc_agwi',
          name: '아귀',
          emotion: expect.objectContaining({
            mood: '벼르는 중',
            revenge: true,
            aggression: 2
          }),
          tell: expect.objectContaining({ signal: 'strong', label: '강한 기색' })
        })
      ])
    );
    expect(replay.events.map((event) => event.type)).toEqual([
      'deal',
      'ante',
      'action',
      'action',
      'showdown',
      'result'
    ]);
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
    const replay = extractSeotdaReplay(content);
    expect(replay.seats.find((seat) => seat.id === 'npc_agwi')).toMatchObject({
      handName: '비공개',
      cards: []
    });
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
    const replay = extractSeotdaReplay(content);
    expect(replay.seats.find((seat) => seat.id === 'npc_agwi')).toMatchObject({
      handName: '장땡',
      cards: [
        { month: 10, gwang: false },
        { month: 10, gwang: false }
      ]
    });
    expect(replay.ddaeng).toEqual({
      winnerId: 'npc_agwi',
      handName: '장땡',
      valuePerLoser: 200,
      totalPaid: 200
    });
  });

  it('includes a paid gaepyeong in the shared replay', async () => {
    const round = completedRound();
    round.gaepyeongAmount = 700;
    round.gaepyeongLine = '아귀: “오링났네. 잃은 돈 10%, 700점 개평 줄게.”';
    round.log.push(round.gaepyeongLine);
    state.getRound.mockReturnValue(round);
    const { POST } = await import('../src/routes/games/seotda/share/+server.js');

    await POST(makeEvent({ boardId: 'free' }));

    const { content } = articleRepo.createArticle.mock.calls[0][0];
    const replay = extractSeotdaReplay(content);
    expect(replay.gaepyeong).toEqual({
      amount: 700,
      line: round.gaepyeongLine
    });
    expect(replay.events).toContainEqual(
      expect.objectContaining({
        type: 'gaepyeong',
        amount: 700,
        text: round.gaepyeongLine
      })
    );
    expect(content).toContain('개평 +700점');
  });

  it('requires login', async () => {
    const { POST } = await import('../src/routes/games/seotda/share/+server.js');

    await expect(POST(makeEvent({}, null))).rejects.toMatchObject({ status: 401 });
    expect(articleRepo.createArticle).not.toHaveBeenCalled();
  });
});
