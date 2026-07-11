/** 섯다 라이트 엔진 — 덱·족보·팟 */

export const ANTE = 10;
export const SEOTDA_GAME = 'seotda';

/**
 * @typedef {{ month: number; gwang: boolean }} SeotdaCard
 * @typedef {{ tier: number; sub: number; name: string; cards: SeotdaCard[] }} SeotdaHand
 * @typedef {{ id: string; chips: number; folded: boolean; contrib: number }} SeotdaPlayerPot
 */

/** @returns {SeotdaCard[]} */
export function createDeck() {
  /** @type {SeotdaCard[]} */
  const deck = [];
  for (let month = 1; month <= 10; month++) {
    if (month === 1 || month === 3 || month === 8) {
      deck.push({ month, gwang: true });
      deck.push({ month, gwang: false });
    } else {
      deck.push({ month, gwang: false });
      deck.push({ month, gwang: false });
    }
  }
  return deck;
}

/**
 * Fisher–Yates. rng() → [0,1)
 * @param {SeotdaCard[]} deck
 * @param {() => number} [rng]
 * @returns {SeotdaCard[]}
 */
export function shuffleDeck(deck, rng = Math.random) {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * @param {SeotdaCard[]} cards
 * @returns {SeotdaHand}
 */
export function evaluateHand(cards) {
  if (!cards || cards.length !== 2) {
    return { tier: 0, sub: 0, name: '무효', cards: cards ?? [] };
  }
  const [a, b] = cards;
  const m1 = a.month;
  const m2 = b.month;
  const bothGwang = a.gwang && b.gwang;
  const months = [m1, m2].sort((x, y) => x - y);

  // 광땡
  if (bothGwang && months[0] === 3 && months[1] === 8) {
    return { tier: 100, sub: 0, name: '38광땡', cards };
  }
  if (bothGwang && months[0] === 1 && months[1] === 3) {
    return { tier: 90, sub: 1, name: '13광땡', cards };
  }
  if (bothGwang && months[0] === 1 && months[1] === 8) {
    return { tier: 90, sub: 0, name: '18광땡', cards };
  }

  // 땡 (같은 월)
  if (m1 === m2) {
    const names = {
      10: '장땡',
      9: '구땡',
      8: '팔땡',
      7: '칠땡',
      6: '육땡',
      5: '오땡',
      4: '사땡',
      3: '삼땡',
      2: '이땡',
      1: '삥땡'
    };
    return {
      tier: 80,
      sub: m1,
      name: names[/** @type {keyof typeof names} */ (m1)] ?? `${m1}땡`,
      cards
    };
  }

  // 특수 끗 조합
  const key = `${months[0]}-${months[1]}`;
  /** @type {Record<string, { tier: number; sub: number; name: string }>} */
  const specials = {
    '1-2': { tier: 70, sub: 0, name: '알리' },
    '1-4': { tier: 60, sub: 0, name: '독사' },
    '1-9': { tier: 50, sub: 0, name: '구삥' },
    '1-10': { tier: 40, sub: 0, name: '장삥' },
    '4-10': { tier: 30, sub: 0, name: '장사' },
    '4-6': { tier: 20, sub: 0, name: '세륙' }
  };
  if (specials[key]) {
    const s = specials[key];
    return { tier: s.tier, sub: s.sub, name: s.name, cards };
  }

  // 끗
  const ggeut = (m1 + m2) % 10;
  const ggeutNames = {
    9: '갑오',
    8: '8끗',
    7: '7끗',
    6: '6끗',
    5: '5끗',
    4: '4끗',
    3: '3끗',
    2: '2끗',
    1: '1끗',
    0: '망통'
  };
  return {
    tier: 10,
    sub: ggeut,
    name: ggeutNames[/** @type {keyof typeof ggeutNames} */ (ggeut)] ?? `${ggeut}끗`,
    cards
  };
}

/**
 * @param {SeotdaHand} a
 * @param {SeotdaHand} b
 * @returns {number} >0 if a wins
 */
export function compareHands(a, b) {
  if (a.tier !== b.tier) return a.tier - b.tier;
  return a.sub - b.sub;
}

/**
 * 0~1 패 강도 (NPC용)
 * @param {SeotdaHand} hand
 * @returns {number}
 */
export function handStrength(hand) {
  if (!hand?.cards || hand.cards.length !== 2) return 0;

  // 현재 패를 제외한 모든 상대 2장 조합에 대한 실제 승률.
  // 족보 tier 간격을 그대로 나누면 갑오도 망통과 같은 약패로 취급된다.
  const remaining = createDeck();
  for (const card of hand.cards) {
    const index = remaining.findIndex(
      (candidate) => candidate.month === card.month && candidate.gwang === card.gwang
    );
    if (index >= 0) remaining.splice(index, 1);
  }

  let score = 0;
  let matchups = 0;
  for (let i = 0; i < remaining.length - 1; i++) {
    for (let j = i + 1; j < remaining.length; j++) {
      const result = compareHands(hand, evaluateHand([remaining[i], remaining[j]]));
      score += result > 0 ? 1 : result === 0 ? 0.5 : 0;
      matchups += 1;
    }
  }
  return matchups > 0 ? score / matchups : 0;
}

/**
 * @param {SeotdaPlayerPot[]} players
 * @param {number} pot
 * @param {string} winnerId
 */
export function settlePot(players, pot, winnerId) {
  return settlePotSplit(players, pot, [winnerId]);
}

/**
 * 동점 시 팟 균등 분배 (나머지는 첫 승자에게)
 * @param {SeotdaPlayerPot[]} players
 * @param {number} pot
 * @param {string[]} winnerIds
 */
export function settlePotSplit(players, pot, winnerIds) {
  const next = players.map((p) => ({ ...p }));
  const ids = winnerIds.filter((id) => next.some((p) => p.id === id));
  if (ids.length === 0 || pot <= 0) return { players: next, pot: 0 };
  const share = Math.floor(pot / ids.length);
  let remainder = pot - share * ids.length;
  for (const id of ids) {
    const p = next.find((x) => x.id === id);
    if (!p) continue;
    p.chips += share + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return { players: next, pot: 0 };
}

/**
 * 레이즈 최소 지불액 (이번 액션에 넣는 칩)
 * @param {number} toCall
 * @returns {number}
 */
export function minRaisePay(toCall) {
  if (toCall <= 0) return ANTE * 2;
  return toCall + Math.max(ANTE, toCall);
}

/**
 * 레이즈 금액 클램프. requested = 이번 액션에 넣을 칩
 * @param {number} toCall
 * @param {number} chips
 * @param {number} [requested]
 * @returns {number}
 */
export function raiseAmount(toCall, chips, requested) {
  const minPay = minRaisePay(toCall);
  const want =
    requested != null && Number.isFinite(requested) && requested > 0 ? Number(requested) : minPay;
  return Math.min(chips, Math.max(minPay, want));
}

/**
 * @param {SeotdaCard} card
 * @returns {string}
 */
export function cardLabel(card) {
  return `${card.month}${card.gwang ? '광' : ''}`;
}
