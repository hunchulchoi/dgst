import {
  ANTE,
  compareHands,
  createDeck,
  dynamicAnte,
  evaluateHand,
  handStrength,
  minRaisePay,
  raiseAmount,
  settlePot,
  shuffleDeck,
  cardLabel
} from './seotdaEngine.js';
import {
  NPC_PROFILES,
  SPARK_TAUNT_COOLDOWN_ROUNDS,
  chooseNpcAction,
  localNpcTauntForAction,
  npcRaiseChips,
  pickPressureNpc,
  publicBluffSuspicionChance
} from './seotdaNpc.js';

export const NPC_MAX_REFILL = 10_000_000;
export const NPC_MAX_USER_BALANCE_RATIO = 0.9;
export const NPC_REFILL_THRESHOLD_ANTE_MULTIPLIER = 4;
/** 한 판 레이즈 횟수 상한 — 무한 콜/레이즈 방지 */
export const MAX_RAISES = 3;

/** 판돈은 유지하고 NPC 의사결정만 완화하는 잔고 구간 계수. */
export function npcPlayerRelief(userBalance) {
  const balance = Number(userBalance);
  if (balance < 100_000) return 1.45;
  if (balance < 1_000_000) return 1.2;
  return 0.07;
}

/**
 * @param {number} ante
 * @param {number} [userChips]
 * @returns {number} 스테이크·유저 잔액 연동 NPC 바이인
 */
export function npcStartingChips(ante = ANTE, userChips = 0) {
  if (Number(userChips) <= 0) return Math.max(ante, ANTE);
  return Math.max(
    ante,
    Math.min(
      NPC_MAX_REFILL,
      Math.floor(Number(userChips) * NPC_MAX_USER_BALANCE_RATIO)
    )
  );
}

/**
 * 다음 판 입장 시에만 저스택 리필·과대 스택 절단을 적용한다.
 * @param {number | null | undefined} savedChips
 * @param {number} userChips
 * @param {number} ante
 */
export function npcStackForNextRound(savedChips, userChips, ante = ANTE) {
  const target = npcStartingChips(ante, userChips);
  if (!Number.isFinite(Number(savedChips))) return { chips: target, reason: 'initial' };

  const stack = Math.max(0, Number(savedChips));
  if (stack < ante * NPC_REFILL_THRESHOLD_ANTE_MULTIPLIER) {
    return { chips: target, reason: 'refill' };
  }

  const trimAt = target;
  if (stack > trimAt) return { chips: trimAt, reason: 'trim' };
  return { chips: stack, reason: 'keep' };
}

/**
 * @param {number} bankroll
 * @param {number} ante
 * @param {number} [opponentStack]
 */
export function maxRoundContribution(bankroll, ante = ANTE, opponentStack = Infinity) {
  const safeBankroll = Math.max(0, Number(bankroll) || 0);
  return Math.min(safeBankroll, Math.max(0, opponentStack));
}

/**
 * @param {import('./seotdaEngine.js').SeotdaCard[]} cards
 * @param {number} ante
 */
export function ddaengValue(cards, ante) {
  const hand = evaluateHand(cards);
  if (hand.tier >= 90) return ante * 3;
  if (hand.tier === 80 && hand.sub === 10) return ante * 2;
  if (hand.tier === 80) return ante;
  return 0;
}

/**
 * 최종 승자만 수령. 다른 땡 보유자는 지급 면제.
 * @template {{ id: string; cards: import('./seotdaEngine.js').SeotdaCard[]; chips: number; contrib?: number; totalContrib?: number }} T
 * @param {T[]} seats
 * @param {string} winnerId
 * @param {number} ante
 */
export function settleDdaengValue(seats, winnerId, ante) {
  const next = seats.map((seat) => ({ ...seat }));
  const winner = next.find((seat) => seat.id === winnerId);
  const valuePerLoser = winner ? ddaengValue(winner.cards, ante) : 0;
  /** @type {string[]} */
  const payerIds = [];
  let totalPaid = 0;

  if (winner && valuePerLoser > 0) {
    for (const loser of next) {
      if (loser.id === winnerId || ddaengValue(loser.cards, ante) > 0) continue;
      const paid = Math.min(valuePerLoser, Math.max(0, loser.chips));
      if (paid <= 0) continue;
      loser.chips -= paid;
      loser.totalContrib = (loser.totalContrib ?? loser.contrib ?? 0) + paid;
      totalPaid += paid;
      payerIds.push(loser.id);
    }
    winner.chips += totalPaid;
  }

  return { seats: next, valuePerLoser, totalPaid, payerIds };
}

/**
 * @param {{ antePaid: number; pot: number; seats: Array<{ id: string; isNpc: boolean; folded: boolean; chips: number; contrib: number; totalContrib?: number }> }} round
 * @param {{ id: string; isNpc: boolean; chips: number; contrib: number; totalContrib?: number }} seat
 */
export function contributionCapacity(round, seat) {
  const totalContrib = seat.totalContrib ?? seat.contrib;
  const bankroll = seat.chips + totalContrib;
  const userOpponent = round.seats.find(
    (candidate) => seat.isNpc && candidate.id === 'user' && !candidate.folded
  );
  const opponents = userOpponent
    ? [userOpponent]
    : round.seats.filter((candidate) => candidate.id !== seat.id && !candidate.folded);
  const actualOpponentStack = Math.max(
    0,
    ...opponents.map((candidate) => candidate.chips + (candidate.totalContrib ?? candidate.contrib))
  );
  const hasActiveNpc = opponents.some((candidate) => candidate.isNpc);
  const creditCover = seat.isNpc && userOpponent ? actualOpponentStack : hasActiveNpc ? bankroll : 0;
  const effectiveBankroll = seat.isNpc && userOpponent ? actualOpponentStack : bankroll;
  const opponentStack = Math.max(actualOpponentStack, creditCover);
  const contributionLimit = maxRoundContribution(effectiveBankroll, round.antePaid, opponentStack);
  const totalLimit = contributionLimit - totalContrib;
  return Math.max(0, seat.isNpc ? totalLimit : Math.min(seat.chips, totalLimit));
}

/**
 * NPC가 유저 커버 범위 안에서 부족한 베팅 칩을 외상으로 충당한다.
 * @param {import('./seotdaState.js').SeotdaRound} round
 * @param {import('./seotdaState.js').SeotdaSeat} seat
 * @param {number} pay
 */
export function fundNpcCredit(round, seat, pay) {
  if (!seat.isNpc) return 0;
  const borrowed = Math.max(0, (Number(pay) || 0) - seat.chips);
  if (borrowed <= 0) return 0;
  seat.chips += borrowed;
  seat.borrowedChips = Number(seat.borrowedChips ?? 0) + borrowed;
  round.log.push(`${seat.name}: 외상 ${borrowed} (상환 없음)`);
  return borrowed;
}

function createRoundId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/**
 * @param {number} userChips
 * @param {() => number} [rng]
 * @param {Record<string, number>} [npcChipMap] 이전 판 NPC 잔고
 * @param {string} [openingActorId] 직전 판 승자
 * @param {number} [sparkTauntCooldown] 도발 노출 남은 판 수
 * @param {{ active?: boolean; npcId?: string | null; taunt?: string | null; difficulty?: string; npcStyle?: string | null; directPlay?: boolean; reason?: string } | null} [sparkDecision]
 */
export function createNewRound(
  userChips,
  rng = Math.random,
  npcChipMap = {},
  openingActorId = 'user',
  sparkTauntCooldown = 0,
  sparkDecision = null
) {
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
      totalContrib: 0,
      lastAction: null,
      lastActionAmount: 0,
      needsAction: true
    }
  ];
  deck = deck.slice(2);

  const log = /** @type {string[]} */ ([]);

  for (const profile of NPC_PROFILES) {
    const hasSavedStack = Object.prototype.hasOwnProperty.call(npcChipMap, profile.id);
    const prepared = npcStackForNextRound(
      hasSavedStack ? npcChipMap[profile.id] : null,
      userChips,
      ante
    );
    const chips = prepared.chips;
    if (prepared.reason === 'refill') log.push(`${profile.name} 재입장 (${chips})`);
    if (prepared.reason === 'trim') log.push(`${profile.name} 스택 조정 (${chips})`);
    seats.push({
      id: profile.id,
      name: profile.name,
      isNpc: true,
      style: profile.style,
      chips,
      cards: [deck[0], deck[1]],
      folded: false,
      contrib: 0,
      totalContrib: 0,
      lastAction: null,
      lastActionAmount: 0,
      needsAction: true
    });
    deck = deck.slice(2);
  }

  let pot = 0;
  for (const s of seats) {
    const pay = Math.min(ante, s.chips);
    s.chips -= pay;
    s.contrib += pay;
    s.totalContrib = (s.totalContrib ?? 0) + pay;
    pot += pay;
  }
  log.push(`판돈 ${ante}씩 (팟 ${pot})`);

  const pressureNpcId = pickPressureNpc(NPC_PROFILES, rng);
  const requestedSparkNpcId = String(sparkDecision?.npcId ?? '');
  const sparkNpcId = NPC_PROFILES.some((profile) => profile.id === requestedSparkNpcId)
    ? requestedSparkNpcId
    : null;
  const sparkIntervention = !!sparkDecision?.active && !!sparkNpcId;
  const sparkTaunt =
    sparkIntervention && sparkTauntCooldown <= 0 ? (sparkDecision?.taunt ?? null) : null;
  const sparkDifficulty = sparkIntervention
    ? String(sparkDecision?.difficulty ?? 'balanced')
    : 'balanced';
  const difficultyRelief =
    sparkDifficulty === 'give-room' ? 0.25 : sparkDifficulty === 'challenge' ? -0.2 : 0;
  const openingIndex = Math.max(
    0,
    seats.findIndex((seat) => seat.id === openingActorId)
  );
  log.push(`${seats[openingIndex].name} 선`);

  return {
    roundId: createRoundId(),
    phase: /** @type {'betting'} */ ('betting'),
    pot,
    currentBet: ante,
    seats,
    turnIndex: openingIndex,
    openingActorId: seats[openingIndex].id,
    openingActionTaken: false,
    pressureNpcId,
    sparkIntervention,
    sparkNpcId: sparkIntervention ? sparkNpcId : null,
    sparkTaunt,
    sparkDecisionSource: sparkDecision ? 'codex-app-server' : 'none',
    sparkDecisionReason: String(sparkDecision?.reason ?? '').slice(0, 160),
    sparkDifficulty,
    sparkNpcStyle: sparkIntervention ? (sparkDecision?.npcStyle ?? null) : null,
    sparkDirectPlay: sparkIntervention && !!sparkDecision?.directPlay,
    npcPlayerRelief: Math.max(0, npcPlayerRelief(userChips) + difficultyRelief),
    sparkTaunted: false,
    sparkTauntCooldown: Math.max(0, sparkTauntCooldown),
    lastAggressorId: null,
    lastRaisePay: 0,
    potBeforeRaise: pot,
    userRaiseCount: 0,
    ddaengWinnerId: null,
    ddaengHandName: null,
    ddaengValuePerLoser: 0,
    ddaengTotalPaid: 0,
    raiseCount: 0,
    log,
    winnerId: null,
    showdown: false,
    antePaid: ante,
    handHistory: []
  };
}

/**
 * 아직 행동해야 하는 좌석 (폴드·올인 제외)
 * @param {import('./seotdaState.js').SeotdaRound} round
 */
export function nextSeatNeedingAction(round) {
  const startIndex =
    Number.isInteger(round.turnIndex) && round.turnIndex >= 0
      ? round.turnIndex % round.seats.length
      : 0;
  for (let offset = 0; offset < round.seats.length; offset++) {
    const index = (startIndex + offset) % round.seats.length;
    const seat = round.seats[index];
    if (
      !seat.folded &&
      seat.needsAction &&
      (!seat.isNpc || contributionCapacity(round, seat) > 0)
    ) {
      return seat;
    }
  }
  return undefined;
}

/** @param {import('./seotdaState.js').SeotdaRound} round @param {string} actorId */
function advanceTurn(round, actorId) {
  const actorIndex = round.seats.findIndex((seat) => seat.id === actorId);
  round.turnIndex = actorIndex >= 0 ? (actorIndex + 1) % round.seats.length : 0;
  if (actorId === round.openingActorId) round.openingActionTaken = true;
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
      if (s.id !== actorId && !s.folded && contributionCapacity(round, s) > 0) {
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
    seat.lastActionAmount = 0;
    seat.needsAction = false;
    round.log.push(`${seat.name}: 다이`);
  } else if (action === 'call') {
    const pay = Math.min(toCall, contributionCapacity(round, seat));
    seat.chips -= pay;
    seat.contrib += pay;
    seat.totalContrib = (seat.totalContrib ?? seat.contrib - pay) + pay;
    round.pot += pay;
    seat.lastAction = pay < toCall ? '올인' : toCall === 0 ? '체크' : '콜';
    seat.lastActionAmount = pay;
    round.log.push(`${seat.name}: ${seat.lastAction} (${pay})`);
    markActed(round, seatId, false);
  } else if (action === 'raise') {
    if ((round.raiseCount ?? 0) >= MAX_RAISES) {
      const pay = Math.min(toCall, contributionCapacity(round, seat));
      seat.chips -= pay;
      seat.contrib += pay;
      seat.totalContrib = (seat.totalContrib ?? seat.contrib - pay) + pay;
      round.pot += pay;
      seat.lastAction = toCall === 0 ? '체크' : '콜';
      seat.lastActionAmount = pay;
      round.log.push(`${seat.name}: ${seat.lastAction} (레이즈 상한)`);
      markActed(round, seatId, false);
    } else {
      const potBeforeRaise = round.pot;
      const available = contributionCapacity(round, seat);
      const amount = raiseAmount(toCall, available, raisePay, round.antePaid);
      const pay = Math.min(amount, seat.chips);
      seat.chips -= pay;
      seat.contrib += pay;
      seat.totalContrib = (seat.totalContrib ?? seat.contrib - pay) + pay;
      round.pot += pay;
      const newBet = Math.max(round.currentBet, seat.contrib);
      wasRaise = newBet > round.currentBet && pay > toCall;
      round.currentBet = newBet;
      seat.lastAction = pay <= toCall ? '올인' : wasRaise ? '레이즈' : '올인';
      seat.lastActionAmount = pay;
      round.log.push(`${seat.name}: ${seat.lastAction} (${pay})`);
      if (wasRaise) {
        round.lastAggressorId = seatId;
        round.lastRaisePay = pay;
        round.potBeforeRaise = potBeforeRaise;
        if (seatId === 'user') round.userRaiseCount = (round.userRaiseCount ?? 0) + 1;
      }
      markActed(round, seatId, wasRaise);
    }
  } else {
    throw new Error('알 수 없는 액션');
  }
  advanceTurn(round, seatId);
}

/**
 * NPC 한 명 행동
 * @param {import('./seotdaState.js').SeotdaRound} round
 * @param {import('./seotdaState.js').SeotdaSeat} seat
 * @param {() => number} [rng]
 * @param {{ action: 'die' | 'call' | 'raise'; raiseScale?: 'min' | 'half' | 'max' | null; taunt?: string | null } | null} [sparkChoice]
 */
export function applyNpcSeatAction(round, seat, rng = Math.random, sparkChoice = null) {
  const profile = NPC_PROFILES.find((p) => p.id === seat.id);
  if (!profile) {
    seat.needsAction = false;
    return null;
  }

  const toCall = Math.max(0, round.currentBet - seat.contrib);
  const raiseSeen = (round.raiseCount ?? 0) > 0;
  const forcePressure =
    seat.id === round.pressureNpcId && !raiseSeen && (round.raiseCount ?? 0) < MAX_RAISES;
  const sparkAssigned = round.sparkIntervention && seat.id === round.sparkNpcId;
  const bluffSuspicion = sparkAssigned
    ? publicBluffSuspicionChance({
        lastAggressorId: round.lastAggressorId,
        lastRaisePay: round.lastRaisePay,
        potBeforeRaise: round.potBeforeRaise,
        userRaiseCount: round.userRaiseCount
      })
    : 0;

  let action =
    sparkChoice?.action ??
    chooseNpcAction(
      seat.cards,
      profile,
      {
        toCall,
        chips: contributionCapacity(round, seat),
        pot: round.pot,
        raiseSeen,
        forcePressure,
        sparkIntervention: sparkAssigned,
        playerRelief: Number(round.npcPlayerRelief ?? 0),
        sparkStyle: sparkAssigned ? (round.sparkNpcStyle ?? null) : null,
        suspectedUserBluff: bluffSuspicion > 0 && rng() < bluffSuspicion,
        isOpening: seat.id === round.openingActorId && !round.openingActionTaken,
        bluffCatcher: seat.id === round.pressureNpcId && raiseSeen,
        ante: round.antePaid,
        activeOpponents: round.seats.filter((other) => other.id !== seat.id && !other.folded).length
      },
      rng
    );

  if (action === 'raise' && (round.raiseCount ?? 0) >= MAX_RAISES) {
    action = toCall > 0 ? 'call' : 'call';
  }
  if (action === 'raise' && contributionCapacity(round, seat) <= toCall) action = 'call';

  let borrowed = 0;
  if (action === 'raise') {
    const potBeforeRaise = round.pot;
    const available = contributionCapacity(round, seat);
    const strongHand = handStrength(evaluateHand(seat.cards)) >= 0.65;
    const minPay = minRaisePay(toCall, round.antePaid);
    const forcedTarget =
      sparkChoice?.raiseScale === 'max'
        ? available
        : sparkChoice?.raiseScale === 'half'
          ? Math.max(minPay, Math.floor(available / 2))
          : sparkChoice?.raiseScale === 'min'
            ? minPay
            : null;
    const pay =
      forcedTarget == null
        ? npcRaiseChips(toCall, available, rng, round.antePaid, strongHand)
        : Math.min(available, forcedTarget);
    borrowed = fundNpcCredit(round, seat, pay);
    seat.chips -= pay;
    seat.contrib += pay;
    seat.totalContrib = (seat.totalContrib ?? seat.contrib - pay) + pay;
    round.pot += pay;
    const newBet = Math.max(round.currentBet, seat.contrib);
    const wasRaise = newBet > round.currentBet && pay > toCall;
    round.currentBet = newBet;
    seat.lastAction = pay <= toCall ? '올인' : wasRaise ? '레이즈' : '올인';
    seat.lastActionAmount = pay;
    round.log.push(`${seat.name}: ${seat.lastAction}! (${pay})`);
    if (wasRaise) {
      round.lastAggressorId = seat.id;
      round.lastRaisePay = pay;
      round.potBeforeRaise = potBeforeRaise;
    }
    markActed(round, seat.id, wasRaise);
  } else if (action === 'call') {
    const pay = Math.min(toCall, contributionCapacity(round, seat));
    borrowed = fundNpcCredit(round, seat, pay);
    seat.chips -= pay;
    seat.contrib += pay;
    seat.totalContrib = (seat.totalContrib ?? seat.contrib - pay) + pay;
    round.pot += pay;
    seat.lastAction = toCall === 0 ? '체크' : pay < toCall ? '올인' : '콜';
    seat.lastActionAmount = pay;
    round.log.push(`${seat.name}: ${seat.lastAction} (${pay})`);
    markActed(round, seat.id, false);
  } else {
    seat.folded = true;
    seat.lastAction = '다이';
    seat.lastActionAmount = 0;
    seat.needsAction = false;
    round.log.push(`${seat.name}: 다이`);
  }
  const taunt =
    borrowed > 0
      ? '빌려 간다. 갚는단 말은 안 했다.'
      : localNpcTauntForAction(
          {
            taunted: !!round.sparkTaunted,
            cooldown: Number(round.sparkTauntCooldown ?? 0)
          },
          seat.lastAction ?? '',
          rng
        );
  if (taunt) {
    round.sparkTaunted = true;
    round.log.push(`${seat.name}: “${taunt}”`);
  }
  advanceTurn(round, seat.id);
  return {
    seatId: seat.id,
    name: seat.name,
    action: seat.lastAction ?? '',
    amount: seat.lastActionAmount ?? 0,
    taunt
  };
}

/** @param {{ sparkTaunted?: boolean; sparkTauntCooldown?: number } | undefined} round */
export function sparkTauntCooldownAfterRound(round) {
  if (!round) return 0;
  if (round.sparkTaunted) return SPARK_TAUNT_COOLDOWN_ROUNDS;
  return Math.max(0, Number(round.sparkTauntCooldown ?? 0) - 1);
}

/**
 * 유저 행동 후 NPC를 유저 차례 또는 쇼다운까지 진행
 * @param {import('./seotdaState.js').SeotdaRound} round
 * @param {() => number} [rng]
 */
export function runNpcTurns(round, rng = Math.random) {
  /** @type {Array<{ seatId: string; name: string; action: string; amount: number; taunt?: string | null }>} */
  const actions = [];
  if (round.phase !== 'betting') return actions;

  for (let guard = 0; guard < 40; guard++) {
    finishIfNeeded(round, rng);
    if (round.phase !== 'betting') return actions;

    const next = nextSeatNeedingAction(round);
    if (!next) {
      showdown(round, rng);
      if (round.phase === 'betting') continue;
      return actions;
    }
    if (!next.isNpc) {
      round.turnIndex = round.seats.indexOf(next);
      return actions; // 유저 입력 대기
    }
    const action = applyNpcSeatAction(round, next, rng);
    if (action) actions.push(action);
  }

  // 안전장치: 루프 초과 시 강제 쇼다운
  if (round.phase === 'betting') {
    round.log.push('베팅 종료 (상한)');
    showdown(round);
  }
  return actions;
}

/**
 * Spark가 직접 플레이하기로 한 판만 지정 NPC 행동을 app-server 판단으로 진행한다.
 * @param {import('./seotdaState.js').SeotdaRound} round
 * @param {(context: Record<string, unknown>) => Promise<{ action: string; raiseScale?: string | null; taunt?: string | null } | null>} decideAction
 * @param {() => number} [rng]
 */
export async function runNpcTurnsWithSpark(round, decideAction, rng = Math.random) {
  if (!round.sparkDirectPlay || !round.sparkNpcId) return runNpcTurns(round, rng);
  /** @type {Array<{ seatId: string; name: string; action: string; amount: number; taunt?: string | null }>} */
  const actions = [];
  if (round.phase !== 'betting') return actions;

  for (let guard = 0; guard < 40; guard++) {
    finishIfNeeded(round, rng);
    if (round.phase !== 'betting') return actions;
    const next = nextSeatNeedingAction(round);
    if (!next) {
      showdown(round, rng);
      if (round.phase === 'betting') continue;
      return actions;
    }
    if (!next.isNpc) {
      round.turnIndex = round.seats.indexOf(next);
      return actions;
    }

    let sparkChoice = null;
    if (next.id === round.sparkNpcId) {
      const hand = evaluateHand(next.cards);
      sparkChoice = await decideAction({
        npcId: next.id,
        npcName: next.name,
        npcStyle: round.sparkNpcStyle ?? next.style ?? null,
        cards: next.cards.map((card) => ({ month: card.month, gwang: card.gwang })),
        handName: hand.name,
        handStrength: handStrength(hand),
        chips: next.chips,
        toCall: Math.max(0, round.currentBet - next.contrib),
        pot: round.pot,
        currentBet: round.currentBet,
        ante: round.antePaid,
        raiseCount: round.raiseCount ?? 0,
        lastAggressorId: round.lastAggressorId ?? null,
        lastRaisePay: round.lastRaisePay ?? 0,
        userRaiseCount: round.userRaiseCount ?? 0,
        activeOpponents: round.seats.filter((seat) => seat.id !== next.id && !seat.folded).length,
        difficulty: round.sparkDifficulty ?? 'balanced',
        history: round.sparkHistory ?? null,
        tauntAllowed: !round.sparkTaunted && Number(round.sparkTauntCooldown ?? 0) <= 0
      });
    }
    const action = applyNpcSeatAction(
      round,
      next,
      rng,
      /** @type {{ action: 'die' | 'call' | 'raise'; raiseScale?: 'min' | 'half' | 'max' | null; taunt?: string | null } | null} */ (
        sparkChoice
      )
    );
    if (action) actions.push(action);
  }

  if (round.phase === 'betting') {
    round.log.push('베팅 종료 (상한)');
    showdown(round);
  }
  return actions;
}

/**
 * @param {import('./seotdaState.js').SeotdaRound} round
 */
export function finishIfNeeded(round, rng = Math.random) {
  const alive = round.seats.filter((s) => !s.folded);
  if (alive.length === 1) {
    recordHandSnapshot(round);
    const winner = alive[0];
    const settled = settlePot(round.seats, round.pot, winner.id);
    round.seats = /** @type {typeof round.seats} */ (settled.players);
    round.pot = 0;
    round.winnerId = winner.id;
    round.winnerIds = [winner.id];
    round.phase = 'showdown';
    round.showdown = true;
    round.log.push(`${winner.name} 승리 (나머지 다이)`);
    applyDdaengValueToRound(round, winner.id);
    return;
  }

  const someoneNeeds = round.seats.some((s) => !s.folded && s.needsAction && s.chips > 0);
  const matched = alive.every(
    (s) => s.contrib >= round.currentBet || contributionCapacity(round, s) === 0
  );
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

  recordHandSnapshot(round);

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
  applyDdaengValueToRound(round, winnerIds[0]);
}

/**
 * @param {import('./seotdaState.js').SeotdaRound} round
 * @param {string} winnerId
 */
function applyDdaengValueToRound(round, winnerId) {
  const winner = round.seats.find((seat) => seat.id === winnerId);
  if (!winner) return;
  const hand = evaluateHand(winner.cards);
  const result = settleDdaengValue(round.seats, winnerId, round.antePaid);
  if (result.valuePerLoser <= 0) return;

  round.seats = /** @type {typeof round.seats} */ (result.seats);
  round.ddaengWinnerId = winnerId;
  round.ddaengHandName = hand.name;
  round.ddaengValuePerLoser = result.valuePerLoser;
  round.ddaengTotalPaid = result.totalPaid;
  round.log.push(`땡값 ${hand.name}: ${result.valuePerLoser}씩 · 총 ${result.totalPaid}`);
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
    seat.lastActionAmount = 0;
    seat.needsAction = false;
  }
  for (const seat of active) {
    seat.cards = [deck[0], deck[1]];
    deck = deck.slice(2);
    seat.needsAction = !seat.isNpc || contributionCapacity(round, seat) > 0;
  }

  const activeProfiles = NPC_PROFILES.filter((profile) =>
    active.some((seat) => seat.id === profile.id)
  );
  round.phase = 'betting';
  round.currentBet = 0;
  round.raiseCount = 0;
  round.pressureNpcId = activeProfiles.length > 0 ? pickPressureNpc(activeProfiles, rng) : null;
  const openingIndex = round.seats.findIndex(
    (seat) => seat.id === round.openingActorId && !seat.folded && seat.needsAction
  );
  round.turnIndex =
    openingIndex >= 0
      ? openingIndex
      : round.seats.findIndex((seat) => !seat.folded && seat.needsAction);
  round.openingActorId = round.seats[round.turnIndex]?.id ?? 'user';
  round.openingActionTaken = false;
  round.winnerId = null;
  round.winnerIds = [];
  round.ddaengWinnerId = null;
  round.ddaengHandName = null;
  round.ddaengValuePerLoser = 0;
  round.ddaengTotalPaid = 0;
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
  const bet = user?.totalContrib ?? user?.contrib ?? Math.max(0, -delta);
  const payout = Math.max(0, bet + delta);
  return { after, delta, bet, payout };
}

/**
 * 공개 화면과 별개로 서버 저장용 패 스냅샷을 남긴다.
 * @param {import('./seotdaState.js').SeotdaRound} round
 */
function recordHandSnapshot(round) {
  round.handHistory ??= [];
  round.handHistory.push({
    deal: round.handHistory.length + 1,
    seats: round.seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      folded: seat.folded,
      cards: seat.cards.map(cardLabel),
      hand: evaluateHand(seat.cards).name
    }))
  });
}

/**
 * game_scores.reels에 저장할 수 있는 읽기 쉬운 패 기록.
 * @param {import('./seotdaState.js').SeotdaRound} round
 */
export function seotdaHandLogEntries(round) {
  return (round.handHistory ?? []).flatMap((snapshot) =>
    snapshot.seats.map(
      (seat) =>
        `hand:${snapshot.deal}:${seat.id}:${seat.cards.join('·')}:${seat.hand}:${seat.folded ? 'folded' : 'alive'}`
    )
  );
}

/**
 * 한 판을 재구성할 수 있는 DB 감사 기록.
 * @param {import('./seotdaState.js').SeotdaRound} round
 */
export function seotdaAuditLogEntries(round) {
  const totalPot = round.seats.reduce((sum, seat) => sum + (seat.totalContrib ?? seat.contrib), 0);
  return [
    `round:${round.roundId ?? 'legacy'}`,
    `pot:${totalPot}`,
    ...seotdaHandLogEntries(round),
    ...round.log.map((entry, index) => `action:${index + 1}:${entry}`)
  ];
}
