/** 짤짤이(쌈치기) 규칙·정산 엔진 */

export const SSAMCHI_GAME = 'ssamchi';
export const INITIAL_BALANCE = 1000;
export const MIN_BET = 10;
export const MAX_COINS = 3;
export const NPC_COUNT = 3;
export const MAX_TOTAL = MAX_COINS * (NPC_COUNT + 1);
export const HIT_MULTIPLIER = 4;

/** @param {unknown} value @param {number} min @param {number} max */
export function integerInRange(value, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max;
}

/** @param {() => number} [random] */
export function drawHiddenCoins(random = Math.random) {
  return Math.floor(random() * (MAX_COINS + 1));
}

/**
 * @param {{ hiddenCoins: number; guess: number; bet: number }} input
 * @param {() => number} [random]
 */
export function playSsamchi(input, random = Math.random) {
  const { hiddenCoins, guess, bet } = input;
  if (!integerInRange(hiddenCoins, 0, MAX_COINS)) throw new Error('숨긴 동전 수가 잘못됐습니다.');
  if (!integerInRange(guess, hiddenCoins, hiddenCoins + MAX_COINS * NPC_COUNT)) {
    throw new Error('가능한 합계를 골라 주세요.');
  }
  if (!Number.isSafeInteger(bet) || bet < MIN_BET) throw new Error('판돈이 잘못됐습니다.');

  const npcCoins = Array.from({ length: NPC_COUNT }, () => drawHiddenCoins(random));
  const total = hiddenCoins + npcCoins.reduce((sum, coins) => sum + coins, 0);
  const hit = guess === total;
  const payout = hit ? bet * HIT_MULTIPLIER : 0;

  return {
    hiddenCoins,
    npcCoins,
    guess,
    total,
    hit,
    bet,
    payout,
    delta: payout - bet
  };
}
