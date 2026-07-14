// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rateLimit = vi.hoisted(() => ({
  checkRateLimit: vi.fn()
}));
const logger = vi.hoisted(() => ({
  warn: vi.fn()
}));

vi.mock('$lib/server/apiRateLimit.js', () => rateLimit);
vi.mock('$lib/util/logger.js', () => ({ default: logger }));

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
    outcome: '실패',
    frames: [
      { at: 0, balls },
      { at: 50, balls: balls.map((ball) => ({ ...ball, y: ball.y - 5 })) }
    ]
  };
}

describe('billiards shot report route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    rateLimit.checkRateLimit.mockResolvedValue({ allowed: true });
  });

  it('accepts an empty note and logs the sanitized replay', async () => {
    const { POST } = await import('../src/routes/games/billiards/report/+server.js');
    const response = await POST({
      request: new Request('https://dgst.me/games/billiards/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'vitest' },
        body: JSON.stringify({ note: '', replay: makeReplay() })
      })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'billiards.shot-report',
        note: '',
        replay: expect.objectContaining({
          id: 'shot-1',
          mode: 'four-ball',
          frames: expect.arrayContaining([expect.objectContaining({ at: 0 })])
        })
      })
    );
  });

  it('rejects malformed replay data', async () => {
    const { POST } = await import('../src/routes/games/billiards/report/+server.js');

    await expect(
      POST({
        request: new Request('https://dgst.me/games/billiards/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ replay: { ...makeReplay(), frames: [] } })
        })
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
