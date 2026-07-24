import { compareHands, evaluateHand } from './seotdaEngine.js';

export const SEOTDA_RULE_BASIC = 'basic';
export const SEOTDA_RULE_CLASSIC = 'classic';

/** @param {unknown} value */
export function normalizeRuleMode(value) {
  return value === SEOTDA_RULE_CLASSIC ? SEOTDA_RULE_CLASSIC : SEOTDA_RULE_BASIC;
}

/**
 * @param {import('./seotdaEngine.js').SeotdaCard[]} cards
 */
export function classicSpecialName(cards) {
  if (!cards || cards.length !== 2) return null;
  const months = cards.map((card) => card.month).sort((a, b) => a - b);
  const key = `${months[0]}-${months[1]}`;
  if (key === '4-7') return '암행어사';
  if (key === '3-7') return '땡잡이';
  if (key === '4-9') return '멍텅구리 구사';
  return null;
}

/**
 * @param {import('./seotdaEngine.js').SeotdaCard[]} cards
 * @param {unknown} ruleMode
 */
export function displayHand(cards, ruleMode) {
  const hand = evaluateHand(cards);
  const special =
    normalizeRuleMode(ruleMode) === SEOTDA_RULE_CLASSIC ? classicSpecialName(cards) : null;
  return special ? { ...hand, name: special } : hand;
}

/**
 * @typedef {{ id: string; cards: import('./seotdaEngine.js').SeotdaCard[] }} HandEntry
 * @typedef {{ type: 'win'; winnerIds: string[]; handName: string } | { type: 'replay'; winnerIds: []; handName: '멍텅구리 구사' }} HandOutcome
 */

/**
 * @param {HandEntry[]} entries
 * @param {unknown} ruleMode
 * @returns {HandOutcome}
 */
export function resolveHandOutcome(entries, ruleMode) {
  if (entries.length === 0) return { type: 'win', winnerIds: [], handName: '무효' };

  const ranked = entries.map((entry) => ({ ...entry, hand: evaluateHand(entry.cards) }));
  let bestHand = ranked[0].hand;
  for (let index = 1; index < ranked.length; index++) {
    if (compareHands(ranked[index].hand, bestHand) > 0) bestHand = ranked[index].hand;
  }

  if (normalizeRuleMode(ruleMode) === SEOTDA_RULE_CLASSIC) {
    const gusa = ranked.filter(
      (entry) => classicSpecialName(entry.cards) === '멍텅구리 구사'
    );
    if (gusa.length > 0 && bestHand.tier <= 80) {
      return { type: 'replay', winnerIds: [], handName: '멍텅구리 구사' };
    }

    if (['13광땡', '18광땡'].includes(bestHand.name)) {
      const inspectors = ranked.filter(
        (entry) => classicSpecialName(entry.cards) === '암행어사'
      );
      if (inspectors.length > 0) {
        return {
          type: 'win',
          winnerIds: inspectors.map((entry) => entry.id),
          handName: '암행어사'
        };
      }
    }

    if (bestHand.tier === 80 && bestHand.sub < 10) {
      const catchers = ranked.filter((entry) => classicSpecialName(entry.cards) === '땡잡이');
      if (catchers.length > 0) {
        return {
          type: 'win',
          winnerIds: catchers.map((entry) => entry.id),
          handName: '땡잡이'
        };
      }
    }
  }

  return {
    type: 'win',
    winnerIds: ranked
      .filter((entry) => compareHands(entry.hand, bestHand) === 0)
      .map((entry) => entry.id),
    handName: bestHand.name
  };
}
