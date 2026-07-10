import {
  ANTE,
  compareHands,
  createDeck,
  evaluateHand,
  raiseAmount,
  settlePot,
  settlePotSplit,
  shuffleDeck,
  cardLabel
} from './seotdaEngine.js';
import { NPC_PROFILES, chooseNpcAction, pickPressureNpc, npcRaiseChips } from './seotdaNpc.js';

const NPC_START_CHIPS = 1000;
/** 한 판 레이즈 횟수 상한 — 무한 콜/레이즈 방지 */
export const MAX_RAISES = 3;

/**
 * @param {number} userChips
 * @param {() => number} [rng]
 */
export function createNewRound(userChips, rng = Math.random) {
  let deck = shuffleDeck(createDeck(), rng);
  /** @type {import('./seotdaState.js').SeotdaSeat[]} */
  const seats = [
    {
      id: 'user',
      name: '나',
      isNpc: false,
      chips: userChips,
      cards: [deck[0], deck[1]],
      folded: false,
      contrib: 0,
      lastAction: null,
      needsAction: true
    }
  ];
  deck = deck.slice(2);

  for (const profile of NPC_PROFILES) {
    seats.push({
      id: profile.id,
      name: profile.name,
      isNpc: true,
      style: profile.style,
      chips: NPC_START_CHIPS,
      cards: [deck[0], deck[1]],
      folded: false,
      contrib: 0,
      lastAction: null,
      needsAction: true
    });
    deck = deck.slice(2);
  }

  let pot = 0;
  const log = /** @type {string[]} */ ([]);
  for (const s of seats) {
    const pay = Math.min(ANTE, s.chips);
    s.chips -= pay;
    s.contrib += pay;
    pot += pay;
  }
  log.push(`판돈 ${ANTE}씩 (팟 ${pot})`);

  const pressureNpcId = pickPressureNpc(NPC_PROFILES, rng);

  return {
    phase: /** @type {'betting'} */ ('betting'),
    pot,
    currentBet: ANTE,
    seats,
    turnIndex: 0,
    pressureNpcId,
    raiseCount: 0,
    log,
    winnerId: null,
    showdown: false,
    antePaid: ANTE
  };
}

/**
 * @param {import('./seotdaState.js').SeotdaRound} round
 */
export function refillBustNpcs(round) {
  for (const s of round.seats) {
    if (s.isNpc && s.chips <= 0) {
      s.chips = NPC_START_CHIPS;
      round.log.push(`${s.name} 칩 리필`);
    }
  }
}

/**
 * 아직 행동해야 하는 좌석 (폴드·올인 제외)
 * @param {import('./seotdaState.js').SeotdaRound} round
 */
export function nextSeatNeedingAction(round) {
  return round.seats.find(
    (s) => !s.folded && s.needsAction && (s.chips > 0 || s.contrib < round.currentBet)
  );
}

/**
 * @param {import('./seotdaState.js').SeotdaRound} round
 * @param {string} actorId
 * @param {boolean} wasRaise
 */
function markActed(round, actorId, wasRaise) {
  const seat = round.seats.find((s) => s.id === actorId);
  if (seat) seat.needsAction = false;
  if (wasRaise) {
    round.raiseCount = (round.raiseCount ?? 0) + 1;
    for (const s of round.seats) {
      if (s.id !== actorId && !s.folded && s.chips > 0) {
        s.needsAction = true;
      }
    }
  }
}

/**
 * @param {import('./seotdaState.js').SeotdaRound} round
 * @param {string} seatId
 * @param {'die' | 'call' | 'raise'} action
 */
export function applyPlayerAction(round, seatId, action) {
  const seat = round.seats.find((s) => s.id === seatId);
  if (!seat || seat.folded || round.phase !== 'betting') {
    throw new Error('지금은 행동할 수 없습니다.');
  }
  if (!seat.needsAction) {
    throw new Error('지금은 당신 차례가 아닙니다.');
  }
  const toCall = Math.max(0, round.currentBet - seat.contrib);
  let wasRaise = false;

  if (action === 'die') {
    seat.folded = true;
    seat.lastAction = '다이';
    seat.needsAction = false;
    round.log.push(`${seat.name}: 다이`);
  } else if (action === 'call') {
    const pay = Math.min(toCall, seat.chips);
    seat.chips -= pay;
    seat.contrib += pay;
    round.pot += pay;
    seat.lastAction = pay < toCall ? '올인' : toCall === 0 ? '체크' : '콜';
    round.log.push(`${seat.name}: ${seat.lastAction} (${pay})`);
    markActed(round, seatId, false);
  } else if (action === 'raise') {
    if ((round.raiseCount ?? 0) >= MAX_RAISES) {
      // 상한 초과 시 콜로 강등
      const pay = Math.min(toCall, seat.chips);
      seat.chips -= pay;
      seat.contrib += pay;
      round.pot += pay;
      seat.lastAction = toCall === 0 ? '체크' : '콜';
      round.log.push(`${seat.name}: ${seat.lastAction} (레이즈 상한)`);
      markActed(round, seatId, false);
    } else {
      const amount = raiseAmount(toCall, seat.chips);
      const pay = Math.min(amount, seat.chips);
      seat.chips -= pay;
      seat.contrib += pay;
      round.pot += pay;
      const newBet = Math.max(round.currentBet, seat.contrib);
      wasRaise = newBet > round.currentBet && pay > toCall;
      round.currentBet = newBet;
      seat.lastAction = pay <= toCall ? '올인' : wasRaise ? '레이즈' : '올인';
      round.log.push(`${seat.name}: ${seat.lastAction} (${pay})`);
      markActed(round, seatId, wasRaise);
    }
  } else {
    throw new Error('알 수 없는 액션');
  }
}

/**
 * NPC 한 명 행동
 * @param {import('./seotdaState.js').SeotdaRound} round
 * @param {import('./seotdaState.js').SeotdaSeat} seat
 * @param {() => number} [rng]
 */
function applyNpcSeatAction(round, seat, rng = Math.random) {
  const profile = NPC_PROFILES.find((p) => p.id === seat.id);
  if (!profile) {
    seat.needsAction = false;
    return;
  }

  const toCall = Math.max(0, round.currentBet - seat.contrib);
  const raiseSeen = (round.raiseCount ?? 0) > 0;
  const forcePressure =
    seat.id === round.pressureNpcId && !raiseSeen && (round.raiseCount ?? 0) < MAX_RAISES;

  let action = chooseNpcAction(
    seat.cards,
    profile,
    { toCall, chips: seat.chips, pot: round.pot, raiseSeen, forcePressure },
    rng
  );

  if (action === 'raise' && (round.raiseCount ?? 0) >= MAX_RAISES) {
    action = toCall > 0 ? 'call' : 'call';
  }

  if (action === 'raise') {
    const pay = npcRaiseChips(toCall, seat.chips);
    seat.chips -= pay;
    seat.contrib += pay;
    round.pot += pay;
    const newBet = Math.max(round.currentBet, seat.contrib);
    const wasRaise = newBet > round.currentBet && pay > toCall;
    round.currentBet = newBet;
    seat.lastAction = pay <= toCall ? '올인' : wasRaise ? '레이즈' : '올인';
    round.log.push(`${seat.name}: ${seat.lastAction}! (${pay})`);
    markActed(round, seat.id, wasRaise);
  } else if (action === 'call') {
    const pay = Math.min(toCall, seat.chips);
    seat.chips -= pay;
    seat.contrib += pay;
    round.pot += pay;
    seat.lastAction = toCall === 0 ? '체크' : pay < toCall ? '올인' : '콜';
    round.log.push(`${seat.name}: ${seat.lastAction} (${pay})`);
    markActed(round, seat.id, false);
  } else {
    seat.folded = true;
    seat.lastAction = '다이';
    seat.needsAction = false;
    round.log.push(`${seat.name}: 다이`);
  }
}

/**
 * 유저 행동 후 NPC를 유저 차례 또는 쇼다운까지 진행
 * @param {import('./seotdaState.js').SeotdaRound} round
 * @param {() => number} [rng]
 */
export function runNpcTurns(round, rng = Math.random) {
  if (round.phase !== 'betting') return;

  for (let guard = 0; guard < 40; guard++) {
    finishIfNeeded(round);
    if (round.phase !== 'betting') return;

    const next = nextSeatNeedingAction(round);
    if (!next) {
      showdown(round);
      return;
    }
    if (!next.isNpc) {
      round.turnIndex = round.seats.indexOf(next);
      return; // 유저 입력 대기
    }
    applyNpcSeatAction(round, next, rng);
  }

  // 안전장치: 루프 초과 시 강제 쇼다운
  if (round.phase === 'betting') {
    round.log.push('베팅 종료 (상한)');
    showdown(round);
  }
}

/**
 * @param {import('./seotdaState.js').SeotdaRound} round
 */
function aliveCount(round) {
  return round.seats.filter((s) => !s.folded).length;
}

/**
 * @param {import('./seotdaState.js').SeotdaRound} round
 */
export function finishIfNeeded(round) {
  const alive = round.seats.filter((s) => !s.folded);
  if (alive.length === 1) {
    const winner = alive[0];
    const settled = settlePot(round.seats, round.pot, winner.id);
    round.seats = /** @type {typeof round.seats} */ (settled.players);
    round.pot = 0;
    round.winnerId = winner.id;
    round.winnerIds = [winner.id];
    round.phase = 'showdown';
    round.showdown = true;
    round.log.push(`${winner.name} 승리 (나머지 다이)`);
    refillBustNpcs(round);
    return;
  }

  const someoneNeeds = round.seats.some((s) => !s.folded && s.needsAction && s.chips > 0);
  const matched = alive.every((s) => s.contrib >= round.currentBet || s.chips === 0);
  if (!someoneNeeds && matched && alive.length >= 2) {
    showdown(round);
  }
}

/**
 * @param {import('./seotdaState.js').SeotdaRound} round
 */
export function showdown(round) {
  const alive = round.seats.filter((s) => !s.folded);
  if (alive.length === 0) return;

  /** @type {{ seat: (typeof alive)[0]; hand: ReturnType<typeof evaluateHand> }[]} */
  const ranked = alive.map((seat) => ({ seat, hand: evaluateHand(seat.cards) }));
  let bestHand = ranked[0].hand;
  for (let i = 1; i < ranked.length; i++) {
    if (compareHands(ranked[i].hand, bestHand) > 0) bestHand = ranked[i].hand;
  }
  const winners = ranked.filter((r) => compareHands(r.hand, bestHand) === 0);
  const winnerIds = winners.map((w) => w.seat.id);

  for (const r of ranked) {
    round.log.push(`${r.seat.name}: ${r.seat.cards.map(cardLabel).join('·')} → ${r.hand.name}`);
  }

  const settled = settlePotSplit(round.seats, round.pot, winnerIds);
  round.seats = /** @type {typeof round.seats} */ (settled.players);
  round.pot = 0;
  round.winnerIds = winnerIds;
  round.winnerId = winnerIds.length === 1 ? winnerIds[0] : null;
  round.phase = 'showdown';
  round.showdown = true;
  if (winnerIds.length > 1) {
    const names = winners.map((w) => w.seat.name).join('·');
    round.log.push(`무승부! ${names} (${bestHand.name}) — 팟 분배`);
  } else {
    round.log.push(`${winners[0].seat.name} 승리! ${bestHand.name}`);
  }
  refillBustNpcs(round);
}

/**
 * @param {number} chipsBefore
 * @param {import('./seotdaState.js').SeotdaRound} round
 */
export function userChipResult(chipsBefore, round) {
  const user = round.seats.find((s) => s.id === 'user');
  const after = user?.chips ?? 0;
  const delta = after - chipsBefore;
  const bet = user?.contrib ?? Math.max(0, -delta);
  const payout = Math.max(0, bet + delta);
  return { after, delta, bet, payout };
}
