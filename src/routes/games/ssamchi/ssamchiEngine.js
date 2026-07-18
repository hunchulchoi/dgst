/** 홀짝·쌈치기 규칙·정산 엔진 */

export const SSAMCHI_GAME = 'ssamchi';
export const INITIAL_BALANCE = 1000;
export const MIN_BET = 10;
export const MIN_MARBLES = 1;
export const MAX_MARBLES = 15;

export const SSAMCHI_NAMES = ['쌈', '으찌', '니'];
export const SSAMCHI_CALLS = [
  [1, 2],
  [1, 0],
  [2, 1],
  [2, 0],
  [0, 1],
  [0, 2]
];

/** 선이 아닌 NPC가 보유 잔고 안에서 판돈을 건다. @param {number} balance @param {() => number} [random] */
export function chooseNpcBet(balance, random = Math.random) {
  const options = [10, 50, 100, 500, 1000].filter((amount) => amount <= balance);
  if (!options.length) throw new Error('판돈을 걸 구슬이 부족합니다.');
  return options[Math.floor(random() * options.length)];
}

/** @param {() => number} [random] */
export function drawMarbles(random = Math.random) {
  return MIN_MARBLES + Math.floor(random() * (MAX_MARBLES - MIN_MARBLES + 1));
}

/** @param {unknown} value */
function validBet(value) {
  return Number.isSafeInteger(value) && Number(value) >= MIN_BET;
}

/** @param {unknown} value */
function validMarbles(value) {
  return Number.isInteger(value) && Number(value) >= MIN_MARBLES && Number(value) <= MAX_MARBLES;
}

/** @param {'win'|'lose'|'draw'} outcome @param {number} bet */
function settle(outcome, bet) {
  const payout = outcome === 'win' ? bet * 2 : outcome === 'draw' ? bet : 0;
  return { payout, delta: payout - bet };
}

/**
 * @param {{ choice?: 'odd'|'even'; marbles?: number; userIsHost?: boolean; bet: number }} input
 * @param {() => number} [random]
 */
export function playOddEven(input, random = Math.random) {
  if (!validBet(input.bet)) throw new Error('판돈이 잘못됐습니다.');
  if (input.userIsHost && !validMarbles(input.marbles))
    throw new Error('접을 구슬 수를 골라 주세요.');
  if (!input.userIsHost && !['odd', 'even'].includes(input.choice ?? ''))
    throw new Error('홀 또는 짝을 골라 주세요.');
  const marbles = input.userIsHost ? Number(input.marbles) : drawMarbles(random);
  const answer = marbles % 2 === 0 ? 'even' : 'odd';
  const choice = input.userIsHost ? (random() < 0.5 ? 'odd' : 'even') : input.choice;
  const bettorHit = choice === answer;
  const outcome = input.userIsHost ? (bettorHit ? 'lose' : 'win') : bettorHit ? 'win' : 'lose';
  return {
    mode: 'odd-even',
    userIsHost: !!input.userIsHost,
    choice,
    answer,
    marbles,
    outcome,
    bet: input.bet,
    ...settle(outcome, input.bet)
  };
}

/**
 * 쌈치기: take는 내가 먹는 결과, give는 상대가 먹는 결과.
 * 나머지 한 결과는 무승부로 판돈을 돌려준다.
 * @param {{ take?: 0|1|2; give?: 0|1|2; marbles?: number; userIsHost?: boolean; bet: number }} input
 * @param {() => number} [random]
 */
export function playSsamchi(input, random = Math.random) {
  if (input.userIsHost && !validMarbles(input.marbles))
    throw new Error('접을 구슬 수를 골라 주세요.');
  if (
    !input.userIsHost &&
    (![0, 1, 2].includes(input.take ?? -1) ||
      ![0, 1, 2].includes(input.give ?? -1) ||
      input.take === input.give)
  ) {
    throw new Error('서로 다른 쌈치기 결과를 골라 주세요.');
  }
  if (!validBet(input.bet)) throw new Error('판돈이 잘못됐습니다.');
  const marbles = input.userIsHost ? Number(input.marbles) : drawMarbles(random);
  const call = input.userIsHost
    ? SSAMCHI_CALLS[Math.floor(random() * SSAMCHI_CALLS.length)]
    : [input.take, input.give];
  const take = call[0];
  const give = call[1];
  const answer = /** @type {0|1|2} */ (marbles % 3);
  const bettorOutcome = answer === take ? 'win' : answer === give ? 'lose' : 'draw';
  const outcome =
    input.userIsHost && bettorOutcome !== 'draw'
      ? bettorOutcome === 'win'
        ? 'lose'
        : 'win'
      : bettorOutcome;
  return {
    mode: 'ssamchi',
    userIsHost: !!input.userIsHost,
    take,
    give,
    answer,
    marbles,
    outcome,
    bet: input.bet,
    ...settle(outcome, input.bet)
  };
}
