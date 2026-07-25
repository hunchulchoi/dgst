import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  updateMany: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => ({
  getPrisma: () => ({
    arcadeWallet: {
      findUnique: mocks.findUnique,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      updateMany: mocks.updateMany
    }
  })
}));

import { ArcadePlayConflictError, beginArcadePlay } from './arcadeWallet.js';

describe('beginArcadePlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('베팅 전에 잔액과 기존 잠금을 한 번에 검사하고 플레이 토큰을 잡는다', async () => {
    const wallet = { email: 'user@example.com', nickname: '사용자', balance: 1000n };
    mocks.findUnique.mockResolvedValue(wallet);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue(wallet);

    const payload = { cpuChoice: 'paper', multiplier: 20 };
    const result = await beginArcadePlay(
      'user@example.com',
      '사용자',
      'medal-janken',
      1000,
      30_000,
      payload
    );

    expect(result.balance).toBe(1000);
    expect(result.playId).toEqual(expect.any(String));
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: 'user@example.com',
          balance: { gte: 1000n }
        }),
        data: expect.objectContaining({
          activeGame: 'medal-janken',
          activePlayId: result.playId,
          activePayload: payload
        })
      })
    );
  });

  it('다른 게임 잠금이 있으면 두 번째 게임을 거절한다', async () => {
    const wallet = {
      email: 'user@example.com',
      nickname: '사용자',
      balance: 1000n,
      activeGame: 'seotda'
    };
    mocks.findUnique.mockResolvedValue(wallet);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUniqueOrThrow.mockResolvedValue(wallet);

    await expect(beginArcadePlay('user@example.com', '사용자', 'slot', 100)).rejects.toBeInstanceOf(
      ArcadePlayConflictError
    );
  });

  it('게임 시작 시점 잔액이 베팅보다 적으면 거절한다', async () => {
    const wallet = {
      email: 'user@example.com',
      nickname: '사용자',
      balance: 90n,
      activeGame: null
    };
    mocks.findUnique.mockResolvedValue(wallet);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUniqueOrThrow.mockResolvedValue(wallet);

    await expect(beginArcadePlay('user@example.com', '사용자', 'slot', 100)).rejects.toThrow(
      '보유 메달이 부족합니다.'
    );
  });
});
