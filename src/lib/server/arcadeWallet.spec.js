import { describe, expect, it } from 'vitest';
import { ARCADE_INITIAL_BALANCE, selectArcadeInitialBalance } from './arcadeWallet.js';

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
