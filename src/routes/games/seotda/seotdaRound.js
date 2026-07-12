import {
  ANTE,
  compareHands,
  createDeck,
  dynamicAnte,
  evaluateHand,
  raiseAmount,
  settlePot,
  shuffleDeck,
  cardLabel
} from './seotdaEngine.js';
import { NPC_PROFILES, chooseNpcAction, pickPressureNpc, npcRaiseChips } from './seotdaNpc.js';

export const NPC_START_CHIPS = 1000;
/** 한 판 레이즈 횟수 상한 — 무한 콜/레이즈 방지 */
export const MAX_RAISES = 3;
/** 한 판에서 한 좌석이 낼 수 있는 총액 */
export const MAX_BET_ANTE_MULTIPLIER = 20;

/**
 * 플레이어와 비슷한 판돈 (±15% 랜덤)
 * @param {number} userChips
 * @param {() => number} [rng]
 * @returns {number}
 */
export function npcStartingChips(userChips, rng = Math.random) {
  const base = Math.max(ANTE * 10, Math.floor(Number(userChips) || NPC_START_CHIPS));
  const factor = 0.85 + rng() * 0.3; // 0.85 ~ 1.15
  return Math.max(ANTE * 10, Math.round(base * factor));
}

/**
 * @param {number} userChips
 * @param {() => number} [rng]
 * @param {Record<string, number>} [npcChipMap] 이전 판 NPC 잔고
 */
export function createNewRound(userChips, rng = Math.random, npcChipMap = {}) {
  const ante = dynamicAnte(userChips);
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

  const log = /** @type {string[]} */ ([]);
  const hasSavedStacks = Object.keys(npcChipMap).length > 0;

  for (const profile of NPC_PROFILES) {
    let chips;
    if (
      hasSavedStacks &&
      Number.isFinite(Number(npcChipMap[profile.id])) &&
      Number(npcChipMap[profile.id]) > 0
    ) {
      chips = Number(npcChipMap[profile.id]);
    } else {
      chips = npcStartingChips(userChips, rng);
      if (hasSavedStacks) log.push(`${profile.name} 칩 리필 (${chips})`);
    }
    seats.push({
      id: profile.id,
      name: profile.name,
      isNpc: true,
      style: profile.style,
      chips,
      cards: [deck[0], deck[1]],
      folded: false,
      contrib: 0,
      lastAction: null,
      needsAction: true
    });
    deck = deck.slice(2);
  }

  let pot = 0;
  for (const s of seats) {
    const pay = Math.min(ante, s.chips);
    s.chips -= pay;
    s.contrib += pay;
    pot += pay;
  }
  log.push(`판돈 ${ante}씩 (팟 ${pot})`);

  const pressureNpcId = pickPressureNpc(NPC_PROFILES, rng);

  return {
    phase: /** @type {'betting'} */ ('betting'),
    pot,
    currentBet: ante,
    seats,
    turnIndex: 0,
    pressureNpcId,
    raiseCount: 0,
    log,
    winnerId: null,
    showdown: false,
    antePaid: ante
  };
}

/**
 * @param {import('./seotdaState.js').SeotdaRound} round
 * @param {() => number} [rng]
 */
export function refillBustNpcs(round, rng = Math.random) {
  const userChips = round.seats.find((s) => s.id === 'user')?.chips ?? NPC_START_CHIPS;
  for (const s of round.seats) {
    if (s.isNpc && s.chips <= 0) {
      s.chips = npcStartingChips(Math.max(userChips, ANTE * 10), rng);
      round.log.push(`${s.name} 칩 리필 (${s.chips})`);
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
 * @param {number} [raisePay] 레이즈 시 이번 액션에 넣을 칩
 */
export function applyPlayerAction(round, seatId, action, raisePay) {
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
      const pay = Math.min(toCall, seat.chips);
      seat.chips -= pay;
      seat.contrib += pay;
      round.pot += pay;
      seat.lastAction = toCall === 0 ? '체크' : '콜';
      round.log.push(`${seat.name}: ${seat.lastAction} (레이즈 상한)`);
      markActed(round, seatId, false);
    } else {
      const remainingLimit = Math.max(0, round.antePaid * MAX_BET_ANTE_MULTIPLIER - seat.contrib);
      const available = Math.min(seat.chips, remainingLimit);
      const amount = raiseAmount(toCall, available, raisePay, round.antePaid);
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
    {
      toCall,
      chips: seat.chips,
      pot: round.pot,
      raiseSeen,
      forcePressure,
      bluffCatcher: seat.id === round.pressureNpcId && raiseSeen,
      ante: round.antePaid,
      activeOpponents: round.seats.filter((other) => other.id !== seat.id && !other.folded).length
    },
    rng
  );

  if (action === 'raise' && (round.raiseCount ?? 0) >= MAX_RAISES) {
    action = toCall > 0 ? 'call' : 'call';
  }

  if (action === 'raise') {
    const remainingLimit = Math.max(0, round.antePaid * MAX_BET_ANTE_MULTIPLIER - seat.contrib);
    const available = Math.min(seat.chips, remainingLimit);
    const pay = npcRaiseChips(toCall, available, rng, round.antePaid);
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
    finishIfNeeded(round, rng);
    if (round.phase !== 'betting') return;

    const next = nextSeatNeedingAction(round);
    if (!next) {
      showdown(round, rng);
      if (round.phase === 'betting') continue;
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
export function finishIfNeeded(round, rng = Math.random) {
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
    showdown(round, rng);
  }
}

/**
 * @param {import('./seotdaState.js').SeotdaRound} round
 */
export function showdown(round, rng = Math.random) {
  const alive = round.seats.filter((s) => !s.folded);
  if (alive.length === 0) return;

  const userFolded = !!round.seats.find((s) => s.id === 'user')?.folded;

  /** @type {{ seat: (typeof alive)[0]; hand: ReturnType<typeof evaluateHand> }[]} */
  const ranked = alive.map((seat) => ({ seat, hand: evaluateHand(seat.cards) }));
  let bestHand = ranked[0].hand;
  for (let i = 1; i < ranked.length; i++) {
    if (compareHands(ranked[i].hand, bestHand) > 0) bestHand = ranked[i].hand;
  }
  const winners = ranked.filter((r) => compareHands(r.hand, bestHand) === 0);
  const winnerIds = winners.map((w) => w.seat.id);

  // 유저 다이면 NPC 패/족보 로그에 안 남김
  if (!userFolded) {
    for (const r of ranked) {
      round.log.push(`${r.seat.name}: ${r.seat.cards.map(cardLabel).join('·')} → ${r.hand.name}`);
    }
  }

  if (winnerIds.length > 1) {
    restartAfterTie(round, rng);
    return;
  }

  round.seats = settleShowdownPots(round.seats, round.pot);
  round.pot = 0;
  round.winnerIds = winnerIds;
  round.winnerId = winnerIds.length === 1 ? winnerIds[0] : null;
  round.phase = 'showdown';
  round.showdown = true;
  round.log.push(
    userFolded ? `${winners[0].seat.name} 승리` : `${winners[0].seat.name} 승리! ${bestHand.name}`
  );
  refillBustNpcs(round);
}

/**
 * 팟은 유지하고 다이하지 않은 참가자에게만 새 패를 나눠준다.
 * @param {import('./seotdaState.js').SeotdaRound} round
 * @param {() => number} rng
 */
function restartAfterTie(round, rng) {
  let deck = shuffleDeck(createDeck(), rng);
  const active = round.seats.filter((seat) => !seat.folded);

  for (const seat of round.seats) {
    seat.contrib = 0;
    seat.lastAction = null;
    seat.needsAction = false;
  }
  for (const seat of active) {
    seat.cards = [deck[0], deck[1]];
    deck = deck.slice(2);
    seat.needsAction = seat.chips > 0;
  }

  const activeProfiles = NPC_PROFILES.filter((profile) =>
    active.some((seat) => seat.id === profile.id)
  );
  round.phase = 'betting';
  round.currentBet = 0;
  round.raiseCount = 0;
  round.pressureNpcId = activeProfiles.length > 0 ? pickPressureNpc(activeProfiles, rng) : null;
  round.turnIndex = round.seats.findIndex((seat) => !seat.folded && seat.needsAction);
  round.winnerId = null;
  round.winnerIds = [];
  round.showdown = false;
  round.log.push(`무승부! 생존자 ${active.length}명 팟 유지 (${round.pot}) — 재경기`);
}

/**
 * 기여액 층마다 승자를 다시 계산해 메인팟과 사이드팟을 정산한다.
 * @param {import('./seotdaState.js').SeotdaSeat[]} seats
 * @param {number} pot
 */
function settleShowdownPots(seats, pot) {
  const next = seats.map((seat) => ({ ...seat }));
  const levels = [...new Set(next.map((seat) => seat.contrib).filter((amount) => amount > 0))].sort(
    (a, b) => a - b
  );
  let previous = 0;
  let paid = 0;

  for (const level of levels) {
    const contributors = next.filter((seat) => seat.contrib >= level);
    const layerPot = Math.min((level - previous) * contributors.length, pot - paid);
    const contenders = contributors.filter((seat) => !seat.folded);
    if (layerPot <= 0 || contenders.length === 0) {
      previous = level;
      continue;
    }

    let best = evaluateHand(contenders[0].cards);
    for (let i = 1; i < contenders.length; i++) {
      const hand = evaluateHand(contenders[i].cards);
      if (compareHands(hand, best) > 0) best = hand;
    }
    const winners = contenders.filter((seat) => compareHands(evaluateHand(seat.cards), best) === 0);
    const share = Math.floor(layerPot / winners.length);
    let remainder = layerPot - share * winners.length;
    for (const winner of winners) {
      winner.chips += share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    }
    paid += layerPot;
    previous = level;
  }

  // 재경기에서 넘어온 팟은 새 베팅 기여액과 무관하게 최종 승자가 가져간다.
  const carriedPot = pot - paid;
  const alive = next.filter((seat) => !seat.folded);
  if (carriedPot > 0 && alive.length > 0) {
    let best = evaluateHand(alive[0].cards);
    for (let i = 1; i < alive.length; i++) {
      const hand = evaluateHand(alive[i].cards);
      if (compareHands(hand, best) > 0) best = hand;
    }
    const winners = alive.filter((seat) => compareHands(evaluateHand(seat.cards), best) === 0);
    const share = Math.floor(carriedPot / winners.length);
    let remainder = carriedPot - share * winners.length;
    for (const winner of winners) {
      winner.chips += share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    }
  }

  return next;
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
