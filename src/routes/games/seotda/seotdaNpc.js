import { evaluateHand, handStrength, raiseAmount, minRaisePay, ANTE } from './seotdaEngine.js';

/**
 * @typedef {'die' | 'call' | 'raise'} SeotdaAction
 * @typedef {{ id: string; name: string; style: 'bluffer' | 'calm' | 'gambler'; bluff: number }} NpcProfile
 */

/** @type {NpcProfile[]} */
export const NPC_PROFILES = [
  { id: 'npc_agwi', name: '아귀', style: 'bluffer', bluff: 0.55 },
  { id: 'npc_goni', name: '고니', style: 'calm', bluff: 0.35 },
  { id: 'npc_madam', name: '정마담', style: 'gambler', bluff: 0.6 }
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

  const canFullCall = toCall <= chips;
  const canRaise = chips > toCall;
  const commitRatio = toCall > 0 ? toCall / Math.max(chips, 1) : 0;

  // 콜 금액 > 보유칩 → 올인 콜 vs 다이 (무조건 다이 금지)
  if (toCall > 0 && !canFullCall) {
    let allInChance = strength * 0.65 + profile.bluff * 0.2;
    if (strength >= 0.55) allInChance += 0.25;
    else if (strength >= 0.35) allInChance += 0.1;
    // 아귀·정마담은 큰 벳에도 가끔 따라감
    if (profile.style !== 'calm') allInChance += 0.08;
    allInChance = Math.min(0.92, allInChance);
    return rng() < allInChance ? 'call' : 'die';
  }

  // 큰 벳(칩의 40%+) — 폴드 남발 줄이고 콜/올인 비중↑
  if (commitRatio >= 0.4) {
    let stayChance = strength * 0.75 + profile.bluff * 0.12 + 0.12;
    if (strength >= 0.5) stayChance += 0.2;
    stayChance = Math.min(0.9, stayChance);
    if (rng() < stayChance) {
      if (canRaise && strength >= 0.55 && rng() < 0.3) return 'raise';
      return 'call';
    }
    // 약한 패만 다이 쪽으로
    if (strength < 0.4) return 'die';
    return rng() < 0.45 ? 'call' : 'die';
  }

  // 전원 공통: 가끔 랜덤 뻥카 레이즈 (약한 패에서도)
  if (canRaise && strength < 0.4 && rng() < 0.18 + profile.bluff * 0.15) {
    return 'raise';
  }

  // 압박 담당 — 랜덤
  if (forcePressure && canRaise && toCall < chips) {
    const roll = rng();
    if (roll < 0.45) return 'raise';
    if (roll < 0.75 && canFullCall) return 'call';
  }

  if (profile.style === 'bluffer') {
    const mood = rng();
    const bluffChance = profile.bluff * (0.5 + mood * 0.9);

    if (strength < 0.35) {
      if (canRaise && rng() < bluffChance * 0.7) return 'raise';
      if (raiseSeen && canFullCall && rng() < 0.4 + mood * 0.25) return 'call';
      if (rng() < 0.35) return 'die';
      return canFullCall ? 'call' : 'die';
    }
    if (strength < 0.55) {
      if (canRaise && rng() < 0.32 + bluffChance * 0.3) return 'raise';
      return canFullCall ? (rng() < 0.1 ? 'die' : 'call') : 'die';
    }
    if (canRaise && rng() < 0.5 + mood * 0.25) return 'raise';
    return canFullCall ? 'call' : 'die';
  }

  if (profile.style === 'calm') {
    if (strength < 0.4) {
      if (toCall === 0) return rng() < 0.12 && canRaise ? 'raise' : 'call';
      if (raiseSeen) return rng() < 0.4 ? 'call' : 'die';
      if (canRaise && rng() < 0.12) return 'raise';
      return canFullCall && rng() < 0.4 ? 'call' : 'die';
    }
    if (strength < 0.7) {
      if (canRaise && rng() < 0.28) return 'raise';
      return canFullCall ? 'call' : 'die';
    }
    if (canRaise && rng() < 0.55) return 'raise';
    return canFullCall ? 'call' : 'die';
  }

  // 정마담
  if (strength < 0.45) {
    const r = rng();
    if (canRaise && r < profile.bluff * 0.85) return 'raise';
    if (r < 0.45) return 'die';
    return canFullCall ? 'call' : 'die';
  }
  if (canRaise && rng() < 0.5 + rng() * 0.35) return 'raise';
  return canFullCall ? 'call' : 'die';
}

/**
 * @param {NpcProfile[]} profiles
 * @param {() => number} [rng]
 */
export function pickPressureNpc(profiles, rng = Math.random) {
  const idx = Math.floor(rng() * profiles.length);
  return profiles[idx]?.id ?? profiles[0].id;
}

/**
 * NPC 레이즈 금액 — 최소~올인 랜덤 (뻥카 크기 다양)
 * @param {number} toCall
 * @param {number} chips
 * @param {() => number} [rng]
 */
export function npcRaiseChips(toCall, chips, rng = Math.random) {
  const minPay = minRaisePay(toCall);
  if (chips <= minPay) return Math.min(chips, Math.max(toCall, minPay));

  const roll = rng();
  let target;
  if (roll < 0.3) target = minPay;
  else if (roll < 0.5) target = minPay + ANTE * (1 + Math.floor(rng() * 3));
  else if (roll < 0.68) target = Math.floor(chips * (0.15 + rng() * 0.15));
  else if (roll < 0.82) target = Math.floor(chips * (0.3 + rng() * 0.2));
  else if (roll < 0.93) target = Math.floor(chips * 0.5);
  else target = chips;

  return raiseAmount(toCall, chips, target);
}
