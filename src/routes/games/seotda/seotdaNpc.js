import { evaluateHand, handStrength, raiseAmount, ANTE } from './seotdaEngine.js';

/**
 * @typedef {'die' | 'call' | 'raise'} SeotdaAction
 * @typedef {{ id: string; name: string; style: 'bluffer' | 'calm' | 'gambler'; bluff: number }} NpcProfile
 */

/** @type {NpcProfile[]} */
export const NPC_PROFILES = [
  { id: 'npc_agwi', name: '아귀', style: 'bluffer', bluff: 0.48 },
  { id: 'npc_goni', name: '고니', style: 'calm', bluff: 0.28 },
  { id: 'npc_madam', name: '정마담', style: 'gambler', bluff: 0.55 }
];

/**
 * @param {import('./seotdaEngine.js').SeotdaCard[]} cards
 * @param {NpcProfile} profile
 * @param {{ toCall: number; chips: number; pot: number; raiseSeen: boolean; forcePressure?: boolean }} ctx
 * @param {() => number} [rng]
 * @returns {SeotdaAction}
 */
export function chooseNpcAction(cards, profile, ctx, rng = Math.random) {
  const hand = evaluateHand(cards);
  const strength = handStrength(hand);
  const { toCall, chips, raiseSeen, forcePressure } = ctx;
  if (chips <= 0) return 'die';

  const canCall = toCall <= chips;
  const canRaise = chips > toCall;

  // 압박 담당이어도 매번 레이즈 아님 — 랜덤
  if (forcePressure && canRaise && toCall < chips) {
    const roll = rng();
    if (roll < 0.4) return 'raise';
    if (roll < 0.7 && canCall) return 'call';
    // 나머지: 아래 성향 로직으로
  }

  if (profile.style === 'bluffer') {
    // 아귀: 허세 있지만 무대뽀 아님. 매 판 기복
    const mood = rng(); // 판 기질
    const bluffChance = profile.bluff * (0.55 + mood * 0.7); // ~0.26~0.82

    if (strength < 0.35) {
      if (canRaise && rng() < bluffChance * 0.55) return 'raise';
      if (raiseSeen && canCall && rng() < 0.4 + mood * 0.2) return 'call';
      if (!canCall || rng() < 0.45) return 'die';
      return canCall ? 'call' : 'die';
    }
    if (strength < 0.55) {
      if (canRaise && rng() < 0.28 + bluffChance * 0.25) return 'raise';
      if (!canCall) return 'die';
      return rng() < 0.15 ? 'die' : 'call';
    }
    // 강한 패: 가끔 슬로우, 가끔 레이즈
    if (canRaise && rng() < 0.45 + mood * 0.25) return 'raise';
    return canCall ? 'call' : 'die';
  }

  if (profile.style === 'calm') {
    // 고니: 신중
    if (strength < 0.4) {
      if (toCall === 0) return 'call';
      if (raiseSeen) return rng() < 0.22 ? 'call' : 'die';
      return canCall && rng() < 0.35 ? 'call' : 'die';
    }
    if (strength < 0.7) {
      if (canRaise && rng() < 0.18) return 'raise';
      return canCall ? 'call' : 'die';
    }
    if (canRaise && rng() < 0.5) return 'raise';
    return canCall ? 'call' : 'die';
  }

  // 정마담: 기복 큰 도박
  if (strength < 0.45) {
    const r = rng();
    if (canRaise && r < profile.bluff * 0.7) return 'raise';
    if (r < 0.55) return 'die';
    return canCall ? 'call' : 'die';
  }
  if (canRaise && rng() < 0.55 + rng() * 0.25) return 'raise';
  return canCall ? 'call' : 'die';
}

/**
 * 판에서 압박 담당 NPC 1명 고름
 * @param {NpcProfile[]} profiles
 * @param {() => number} [rng]
 */
export function pickPressureNpc(profiles, rng = Math.random) {
  const idx = Math.floor(rng() * profiles.length);
  return profiles[idx]?.id ?? profiles[0].id;
}

/**
 * @param {number} toCall
 * @param {number} chips
 */
export function npcRaiseChips(toCall, chips) {
  return raiseAmount(Math.max(toCall, ANTE), chips);
}
