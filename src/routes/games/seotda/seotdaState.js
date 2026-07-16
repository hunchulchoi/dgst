/**
 * 진행 중 라운드 메모리 상태
 * @typedef {import('./seotdaEngine.js').SeotdaCard} SeotdaCard
 * @typedef {{
 *   id: string;
 *   name: string;
 *   isNpc: boolean;
 *   style?: string;
 *   chips: number;
 *   cards: SeotdaCard[];
 *   folded: boolean;
 *   contrib: number;
 *   totalContrib?: number;
 *   lastAction: string | null;
 *   lastActionAmount?: number;
 *   needsAction?: boolean;
 * }} SeotdaSeat
 * @typedef {{
 *   roundId?: string;
 *   phase: 'betting' | 'showdown' | 'idle';
 *   pot: number;
 *   currentBet: number;
 *   seats: SeotdaSeat[];
 *   turnIndex: number;
 *   openingActorId?: string;
 *   openingActionTaken?: boolean;
 *   pressureNpcId: string | null;
 *   sparkIntervention?: boolean;
 *   sparkNpcId?: string | null;
 *   sparkTaunt?: string | null;
 *   sparkTaunted?: boolean;
 *   sparkTauntCooldown?: number;
 *   lastAggressorId?: string | null;
 *   lastRaisePay?: number;
 *   potBeforeRaise?: number;
 *   userRaiseCount?: number;
 *   ddaengWinnerId?: string | null;
 *   ddaengHandName?: string | null;
 *   ddaengValuePerLoser?: number;
 *   ddaengTotalPaid?: number;
 *   raiseCount?: number;
 *   log: string[];
 *   winnerId: string | null;
 *   winnerIds?: string[];
 *   showdown: boolean;
 *   antePaid: number;
 *   handHistory?: Array<{
 *     deal: number;
 *     seats: Array<{
 *       id: string;
 *       name: string;
 *       folded: boolean;
 *       cards: string[];
 *       hand: string;
 *     }>;
 *   }>;
 * }} SeotdaRound
 */

/** @type {Map<string, SeotdaRound>} */
const rounds = new Map();

/** 테이블별 NPC 칩 잔고 (판 넘어가도 유지) @type {Map<string, Record<string, number>>} */
const npcStacks = new Map();

/**
 * @param {string} email
 * @returns {SeotdaRound | undefined}
 */
export function getRound(email) {
  return rounds.get(email);
}

/**
 * @param {string} email
 * @param {SeotdaRound} round
 */
export function setRound(email, round) {
  rounds.set(email, round);
}

/**
 * @param {string} email
 */
export function clearRound(email) {
  rounds.delete(email);
}

/**
 * @param {string} email
 * @returns {Record<string, number>}
 */
export function getNpcStacks(email) {
  return { ...(npcStacks.get(email) ?? {}) };
}

/**
 * 쇼다운 후 NPC 칩 스냅샷
 * @param {string} email
 * @param {SeotdaRound} round
 */
export function saveNpcStacks(email, round) {
  /** @type {Record<string, number>} */
  const stacks = {};
  for (const s of round.seats) {
    if (s.isNpc) stacks[s.id] = Math.max(0, s.chips);
  }
  npcStacks.set(email, stacks);
}

/**
 * 새 테이블(판 시작 버튼) — NPC 칩 초기화
 * @param {string} email
 */
export function resetNpcStacks(email) {
  npcStacks.delete(email);
}

/**
 * 클라용 공개 상태 (NPC 패 숨김, 쇼다운이어도 유저 다이면 NPC 안 깜)
 * @param {SeotdaRound} round
 * @param {string} userSeatId
 * @param {(cards: import('./seotdaEngine.js').SeotdaCard[]) => { name: string }} [evalHand]
 */
export function toPublicState(round, userSeatId = 'user', evalHand) {
  const isShowdown = round.showdown || round.phase === 'showdown';
  const user = round.seats.find((s) => s.id === userSeatId);
  const userFolded = !!user?.folded;
  /** 유저가 살아 있으면 전부, 다이했으면 최종 승자 땡만 공개 */
  const revealNpcHands = isShowdown && !userFolded;
  return {
    phase: round.phase,
    pot: round.pot,
    currentBet: round.currentBet,
    antePaid: round.antePaid,
    turnIndex: round.turnIndex,
    openingActorId: round.openingActorId ?? 'user',
    log: round.log.slice(-12),
    winnerId: round.winnerId,
    winnerIds: round.winnerIds ?? (round.winnerId ? [round.winnerId] : []),
    showdown: isShowdown,
    userFolded,
    revealNpcHands,
    ddaengWinnerId: round.ddaengWinnerId ?? null,
    ddaengHandName: round.ddaengHandName ?? null,
    ddaengValuePerLoser: round.ddaengValuePerLoser ?? 0,
    ddaengTotalPaid: round.ddaengTotalPaid ?? 0,
    seats: round.seats.map((s) => {
      const isUser = s.id === userSeatId;
      const revealDdaeng = isShowdown && userFolded && s.isNpc && s.id === round.ddaengWinnerId;
      const reveal = isUser || (s.isNpc && revealNpcHands) || revealDdaeng;
      /** @type {string | null} */
      let handName = null;
      if (reveal && evalHand && s.cards.length === 2) {
        try {
          handName = evalHand(s.cards).name;
        } catch {
          handName = null;
        }
      }
      return {
        id: s.id,
        name: s.name,
        isNpc: s.isNpc,
        chips: s.chips,
        folded: s.folded,
        contrib: s.contrib,
        totalContrib: s.totalContrib ?? s.contrib,
        lastAction: s.lastAction,
        lastActionAmount: s.lastActionAmount ?? 0,
        needsAction: !!s.needsAction,
        revealDdaeng,
        cards: reveal ? s.cards : s.cards.map(() => ({ month: 0, gwang: false, hidden: true })),
        handName
      };
    })
  };
}
