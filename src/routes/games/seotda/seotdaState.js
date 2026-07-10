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
 *   lastAction: string | null;
 * }} SeotdaSeat
 * @typedef {{
 *   phase: 'betting' | 'showdown' | 'idle';
 *   pot: number;
 *   currentBet: number;
 *   seats: SeotdaSeat[];
 *   turnIndex: number;
 *   pressureNpcId: string | null;
 *   log: string[];
 *   winnerId: string | null;
 *   showdown: boolean;
 *   antePaid: number;
 * }} SeotdaRound
 */

/** @type {Map<string, SeotdaRound>} */
const rounds = new Map();

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
 * 클라용 공개 상태 (NPC 패 숨김, 쇼다운 시만 공개)
 * @param {SeotdaRound} round
 * @param {string} userSeatId
 * @param {(cards: import('./seotdaEngine.js').SeotdaCard[]) => { name: string }} [evalHand]
 */
export function toPublicState(round, userSeatId = 'user', evalHand) {
  const revealAll = round.showdown || round.phase === 'showdown';
  return {
    phase: round.phase,
    pot: round.pot,
    currentBet: round.currentBet,
    turnIndex: round.turnIndex,
    log: round.log.slice(-12),
    winnerId: round.winnerId,
    showdown: revealAll,
    seats: round.seats.map((s) => {
      const isUser = s.id === userSeatId;
      const reveal = isUser || revealAll;
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
        lastAction: s.lastAction,
        cards: reveal
          ? s.cards
          : s.cards.map(() => ({ month: 0, gwang: false, hidden: true })),
        handName
      };
    })
  };
}
