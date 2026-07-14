// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rateLimit = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
const sessionDevice = vi.hoisted(() => ({ checkAndLogSessionDevice: vi.fn() }));
const replayRepo = vi.hoisted(() => ({ createBilliardsReplayArticle: vi.fn() }));
const boardCache = vi.hoisted(() => ({ bustBoardListCache: vi.fn() }));

vi.mock('$lib/server/apiRateLimit.js', () => rateLimit);
vi.mock('$lib/server/auth/checkSessionDevice.js', () => sessionDevice);
vi.mock('$lib/server/billiardsReplayRepo.js', () => replayRepo);
vi.mock('$lib/server/boardListLoad.js', () => boardCache);

function makeReplay() {
  const balls = [
    { id: 'cue', role: 'cue', color: '#fff', x: 150, y: 400 },
    { id: 'red-1', role: 'red', color: '#f00', x: 150, y: 160 }
  ];
  return {
    id: 'shot-1',
    mode: 'four-ball',
    targetScore: 100,
    power: 55,
    sideSpin: 20,
    verticalSpin: -10,
    startedAt: '2026-07-14T00:00:00.000Z',
    scoreBefore: 10,
    outcome: '2점 득점',
    frames: [
      { at: 0, balls },
      { at: 50, balls: balls.map((ball) => ({ ...ball, y: ball.y - 5 })) }
    ]
  };
}

function makeEvent(body, user = { email: 'player@example.com', nickname: '선수' }) {
  return {
    request: new Request('https://dgst.me/games/billiards/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    locals: { auth: vi.fn().mockResolvedValue(user ? { user } : null) }
  };
}

describe('billiards replay share route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    rateLimit.checkRateLimit.mockResolvedValue({ allowed: true });
    replayRepo.createBilliardsReplayArticle.mockResolvedValue({
      articleId: 'article-1',
      replayId: 'replay-1'
    });
  });

  it('creates a board article linked to sanitized replay data', async () => {
    const { POST } = await import('../src/routes/games/billiards/share/+server.js');
    const response = await POST(
      makeEvent({
        boardId: 'free',
        title: '내 멋진 샷',
        note: '회전이 잘 들어갔습니다.',
        replay: makeReplay()
      })
    );
    const body = await response.json();

    expect(body).toEqual({
      success: true,
      boardId: 'free',
      articleId: 'article-1',
      replayId: 'replay-1'
    });
    expect(replayRepo.createBilliardsReplayArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'player@example.com',
        nickname: '선수',
        boardId: 'free',
        title: '내 멋진 샷',
        content: expect.stringContaining('회전이 잘 들어갔습니다.'),
        replay: expect.objectContaining({
          id: 'shot-1',
          mode: 'four-ball',
          frames: expect.arrayContaining([expect.objectContaining({ at: 0 })])
        })
      })
    );
    expect(boardCache.bustBoardListCache).toHaveBeenCalledWith('free');
  });

  it('requires login', async () => {
    const { POST } = await import('../src/routes/games/billiards/share/+server.js');
    await expect(POST(makeEvent({ replay: makeReplay() }, null))).rejects.toMatchObject({
      status: 401
    });
    expect(replayRepo.createBilliardsReplayArticle).not.toHaveBeenCalled();
  });

  it('rejects malformed replay data', async () => {
    const { POST } = await import('../src/routes/games/billiards/share/+server.js');
    await expect(
      POST(makeEvent({ replay: { ...makeReplay(), frames: [] } }))
    ).rejects.toMatchObject({ status: 400 });
    expect(replayRepo.createBilliardsReplayArticle).not.toHaveBeenCalled();
  });
});
