import { describe, expect, it } from 'vitest';
import {
  ARCADE_INITIAL_BALANCE,
  recordArcadeLeaderChange,
  selectArcadeInitialBalance
} from './arcadeWallet.js';

describe('selectArcadeInitialBalance', () => {
  it('기존 게임별 최신 잔액 중 최댓값을 선택한다', () => {
    expect(selectArcadeInitialBalance([700, 2500, 1200, 1000])).toBe(2500);
  });

  it('잔액을 합산하지 않는다', () => {
    expect(selectArcadeInitialBalance([1000, 1000, 1000, 1000])).toBe(1000);
  });

  it('기존 게임 기록이 없으면 기본 1000개를 지급한다', () => {
    expect(selectArcadeInitialBalance([])).toBe(ARCADE_INITIAL_BALANCE);
  });

  it('음수와 잘못된 값은 이전 대상에서 제외한다', () => {
    expect(selectArcadeInitialBalance([-10, Number.NaN, 800])).toBe(800);
  });
});

describe('recordArcadeLeaderChange', () => {
  function makeTx(leader, previous) {
    return {
      $executeRaw: () => Promise.resolve(),
      arcadeWallet: { findFirst: () => Promise.resolve(leader) },
      arcadeLedger: {
        findFirst: () => Promise.resolve(previous),
        create: (args) => Promise.resolve(args.data)
      }
    };
  }

  it('같은 1등이 자기 기록을 갱신해도 이벤트를 만들지 않는다', async () => {
    const leader = { id: 'wallet-1', email: 'one@example.com', nickname: '일등', balance: 5000n };
    const tx = makeTx(leader, { email: 'one@example.com' });

    await expect(recordArcadeLeaderChange(tx, 'slot')).resolves.toBeNull();
  });

  it('기존 1등이 오링나 다른 사용자가 승격하면 교체 이벤트를 만든다', async () => {
    const leader = { id: 'wallet-2', email: 'two@example.com', nickname: '이등', balance: 4000n };
    const tx = makeTx(leader, { email: 'one@example.com' });

    await expect(recordArcadeLeaderChange(tx, 'ssamchi')).resolves.toMatchObject({
      walletId: 'wallet-2',
      email: 'two@example.com',
      game: 'ssamchi',
      kind: 'leader-change',
      balance: 4000n,
      meta: { previousLeaderEmail: 'one@example.com' }
    });
  });

  it('최초 관측 1등은 축하 없는 기준점으로만 기록한다', async () => {
    const leader = {
      id: 'wallet-3',
      email: 'three@example.com',
      nickname: '삼등',
      balance: 3000n
    };
    const tx = makeTx(leader, null);

    await expect(recordArcadeLeaderChange(tx, 'medal-janken')).resolves.toMatchObject({
      email: 'three@example.com',
      kind: 'leader-baseline'
    });
  });
});
