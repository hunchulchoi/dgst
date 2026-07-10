import {
  ANTE,
  compareHands,
  createDeck,
  evaluateHand,
  raiseAmount,
  settlePot,
  shuffleDeck,
  cardLabel
} from './seotdaEngine.js';
import { NPC_PROFILES, chooseNpcAction, pickPressureNpc, npcRaiseChips } from './seotdaNpc.js';

const NPC_START_CHIPS = 1000;

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
      lastAction: null
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
      lastAction: null
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
    turnIndex: 0, // user first
    pressureNpcId,
    log,
    winnerId: null,
    showdown: false,
    antePaid: ANTE
  };
}

/**
 * NPC 파산 시 리필
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
 * @param {import('./seotdaState.js').SeotdaRound} round
 * @param {string} seatId
 * @param {'die' | 'call' | 'raise'} action
 */
export function applyPlayerAction(round, seatId, action) {
  const seat = round.seats.find((s) => s.id === seatId);
  if (!seat || seat.folded || round.phase !== 'betting') {
    throw new Error('지금은 행동할 수 없습니다.');
  }
  const toCall = Math.max(0, round.currentBet - seat.contrib);

  if (action === 'die') {
    seat.folded = true;
    seat.lastAction = '다이';
    round.log.push(`${seat.name}: 다이`);
  } else if (action === 'call') {
    const pay = Math.min(toCall, seat.chips);
    seat.chips -= pay;
    seat.contrib += pay;
    round.pot += pay;
    seat.lastAction = pay < toCall ? '올인' : toCall === 0 ? '체크' : '콜';
    round.log.push(`${seat.name}: ${seat.lastAction} (${pay})`);
  } else if (action === 'raise') {
    const amount = raiseAmount(toCall, seat.chips);
    const pay = Math.min(amount, seat.chips);
    seat.chips -= pay;
    seat.contrib += pay;
    round.pot += pay;
    round.currentBet = Math.max(round.currentBet, seat.contrib);
    seat.lastAction = pay <= toCall ? '올인' : '레이즈';
    round.log.push(`${seat.name}: ${seat.lastAction} (${pay})`);
  } else {
    throw new Error('알 수 없는 액션');
  }
}

/**
 * @param {import('./seotdaState.js').SeotdaRound} round
 * @param {() => number} [rng]
 */
export function runNpcTurns(round, rng = Math.random) {
  if (round.phase !== 'betting') return;

  // 유저 다음부터 한 바퀴 NPC
  for (let i = 1; i < round.seats.length; i++) {
    const seat = round.seats[i];
    if (seat.folded || !seat.isNpc) continue;
    if (aliveCount(round) <= 1) break;

    const profile = NPC_PROFILES.find((p) => p.id === seat.id);
    if (!profile) continue;

    const toCall = Math.max(0, round.currentBet - seat.contrib);
    const raiseSeen = round.seats.some(
      (s) => s.id !== seat.id && (s.lastAction === '레이즈' || s.lastAction === '올인')
    );
    const forcePressure = seat.id === round.pressureNpcId && !raiseSeen;

    const action = chooseNpcAction(
      seat.cards,
      profile,
      { toCall, chips: seat.chips, pot: round.pot, raiseSeen, forcePressure },
      rng
    );

    if (action === 'raise') {
      const pay = npcRaiseChips(toCall, seat.chips);
      seat.chips -= pay;
      seat.contrib += pay;
      round.pot += pay;
      round.currentBet = Math.max(round.currentBet, seat.contrib);
      seat.lastAction = pay <= toCall ? '올인' : '레이즈';
      round.log.push(`${seat.name}: ${seat.lastAction}! (${pay})`);
    } else if (action === 'call') {
      const pay = Math.min(toCall, seat.chips);
      seat.chips -= pay;
      seat.contrib += pay;
      round.pot += pay;
      seat.lastAction = toCall === 0 ? '체크' : pay < toCall ? '올인' : '콜';
      round.log.push(`${seat.name}: ${seat.lastAction} (${pay})`);
    } else {
      seat.folded = true;
      seat.lastAction = '다이';
      round.log.push(`${seat.name}: 다이`);
    }
  }

  finishIfNeeded(round);
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
    round.phase = 'showdown';
    round.showdown = true;
    round.log.push(`${winner.name} 승리 (나머지 다이)`);
    refillBustNpcs(round);
    return;
  }

  // 베팅 라운드 종료: 전원 행동했고 콜 맞춤 (간단: NPC 턴 후 쇼다운)
  const allActed = round.seats.every((s) => s.folded || s.lastAction != null);
  const matched = round.seats
    .filter((s) => !s.folded)
    .every((s) => s.contrib >= round.currentBet || s.chips === 0);
  if (allActed && matched && alive.length >= 2) {
    showdown(round);
  }
}

/**
 * @param {import('./seotdaState.js').SeotdaRound} round
 */
export function showdown(round) {
  const alive = round.seats.filter((s) => !s.folded);
  let best = alive[0];
  let bestHand = evaluateHand(best.cards);
  for (let i = 1; i < alive.length; i++) {
    const h = evaluateHand(alive[i].cards);
    if (compareHands(h, bestHand) > 0) {
      best = alive[i];
      bestHand = h;
    }
  }
  for (const s of alive) {
    const h = evaluateHand(s.cards);
    round.log.push(
      `${s.name}: ${s.cards.map(cardLabel).join('·')} → ${h.name}`
    );
  }
  const settled = settlePot(round.seats, round.pot, best.id);
  round.seats = /** @type {typeof round.seats} */ (settled.players);
  round.pot = 0;
  round.winnerId = best.id;
  round.phase = 'showdown';
  round.showdown = true;
  round.log.push(`${best.name} 승리! ${bestHand.name}`);
  refillBustNpcs(round);
}

/**
 * 유저 칩 변화량 (정산용)
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
