import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  smoke: vi.fn(),
  query: vi.fn(),
  create: vi.fn()
}));
vi.mock('$lib/server/localGameSmokeSession.js', () => ({
  getGameSession: mocks.session,
  isLocalGameSmokeSession: mocks.smoke
}));
vi.mock('$lib/database/prisma.js', () => ({
  getPrisma: () => ({ $queryRaw: mocks.query, gameLog: { create: mocks.create } })
}));
vi.mock('$lib/server/gameProfilePhotos.js', () => ({
  attachGameProfilePhotos: async (rows: unknown[]) => rows
}));
import { GET, POST } from './+server.js';

const event = (body?: unknown) =>
  ({
    request: new Request('http://localhost/games/block-blast', {
      method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    })
  }) as unknown as RequestEvent;

describe('Block Blast ranking API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({
      user: { email: 'player@example.test', nickname: '플레이어' }
    });
    mocks.smoke.mockReturnValue(false);
  });

  it('requires login for reads and writes', async () => {
    mocks.session.mockResolvedValue(null);
    await expect(GET(event())).rejects.toMatchObject({ status: 401 });
    await expect(POST(event({ score: 10 }))).rejects.toMatchObject({ status: 401 });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, '100', 2_147_483_648])('rejects invalid score %s', async (score) => {
    await expect(POST(event({ score }))).rejects.toMatchObject({ status: 400 });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('saves the authenticated player and isolated game identity', async () => {
    const response = await POST(event({ score: 480, email: 'spoofed@example.test' }));
    expect(await response.json()).toEqual({ success: true, score: 480 });
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        game: 'block-blast',
        action: 'score',
        email: 'player@example.test',
        meta: { nickname: '플레이어', score: 480 }
      }
    });
  });

  it('returns per-player ranking and personal best without caching', async () => {
    const date = new Date('2026-10-07T00:00:00Z');
    mocks.query
      .mockResolvedValueOnce([
        { email: 'player@example.test', nickname: '플레이어', score: 480, createdAt: date }
      ])
      .mockResolvedValueOnce([{ score: 480, createdAt: date }]);
    const response = await GET(event());
    const result = await response.json();
    expect(result.rank[0]).toMatchObject({ _id: 'player@example.test', score: 480 });
    expect(result.myBest).toEqual({ score: 480, createdAt: date.toISOString() });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(mocks.query.mock.calls[0][1]).toBe('block-blast');
    expect(mocks.query.mock.calls[1].slice(1)).toEqual(['block-blast', 'player@example.test']);
  });

  it('keeps local smoke reads and writes away from the database', async () => {
    mocks.smoke.mockReturnValue(true);
    expect(await (await GET(event())).json()).toEqual({ rank: [], myBest: null, smoke: true });
    expect(await (await POST(event({ score: 100 }))).json()).toMatchObject({
      success: true,
      smoke: true
    });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
