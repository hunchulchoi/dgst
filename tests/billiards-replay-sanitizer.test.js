import { describe, expect, it } from 'vitest';
import { sanitizeBilliardsReplay } from '../src/lib/server/billiardsReplay.js';

function makeReplay(overrides = {}) {
  const balls = [
    { id: 'cue', role: 'cue', color: '#fff', x: 180, y: 670 },
    { id: 'red-1', role: 'red', color: '#f00', x: 180, y: 120 }
  ];
  return {
    id: 'shot-geometry',
    mode: 'four-ball',
    targetScore: 100,
    power: 70,
    sideSpin: 10,
    verticalSpin: -20,
    startedAt: '2026-07-17T00:00:00.000Z',
    scoreBefore: 30,
    outcome: '성공',
    frames: [
      { at: 0, balls },
      { at: 50, balls: balls.map((ball) => ({ ...ball, y: ball.y - 4 })) }
    ],
    ...overrides
  };
}

describe('billiards replay geometry sanitization', () => {
  it('keeps sanitized geometry metadata and the taller table coordinates', () => {
    const replay = sanitizeBilliardsReplay(
      makeReplay({ tableWidth: 360.004, tableHeight: 683.999, ballRadius: 7.199 })
    );

    expect(replay).not.toBeNull();
    if (!replay) throw new Error('expected a valid replay');
    expect(replay).toMatchObject({
      tableWidth: 360,
      tableHeight: 684,
      ballRadius: 7.2,
      frames: expect.arrayContaining([
        expect.objectContaining({
          balls: expect.arrayContaining([expect.objectContaining({ x: 180, y: 670 })])
        })
      ])
    });
  });

  it('keeps legacy replays valid without inventing geometry metadata', () => {
    const replay = sanitizeBilliardsReplay(
      makeReplay({
        frames: makeReplay().frames.map((frame) => ({
          ...frame,
          balls: frame.balls.map((ball) => ({ ...ball, y: Math.min(ball.y, 540) }))
        }))
      })
    );

    expect(replay).not.toHaveProperty('tableWidth');
    expect(replay).not.toHaveProperty('tableHeight');
    expect(replay).not.toHaveProperty('ballRadius');
  });

  it('bounds optional geometry metadata before using it for frame coordinates', () => {
    const replay = sanitizeBilliardsReplay(
      makeReplay({ tableWidth: 9_999, tableHeight: 9_999, ballRadius: 1 })
    );

    expect(replay).toMatchObject({ tableWidth: 1_000, tableHeight: 2_000, ballRadius: 3 });
  });

  it('rejects partial or invalid geometry profiles instead of mixing table versions', () => {
    expect(sanitizeBilliardsReplay(makeReplay({ tableHeight: 684 }))).toBeNull();
    expect(
      sanitizeBilliardsReplay(
        makeReplay({ tableWidth: 360, tableHeight: 684, ballRadius: 'not-a-radius' })
      )
    ).toBeNull();
  });
});
