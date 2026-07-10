import { evaluateHand, handStrength, raiseAmount, ANTE } from './seotdaEngine.js';

/**
 * @typedef {'die' | 'call' | 'raise'} SeotdaAction
 * @typedef {{ id: string; name: string; style: 'bluffer' | 'calm' | 'gambler'; bluff: number }} NpcProfile
 */

/** @type {NpcProfile[]} */
export const NPC_PROFILES = [
  { id: 'npc_bluffer', name: '허세왕', style: 'bluffer', bluff: 0.75 },
  { id: 'npc_calm', name: '냉정', style: 'calm', bluff: 0.25 },
  { id: 'npc_gambler', name: '도박사', style: 'gambler', bluff: 0.65 }
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

  // 강제 압박: 콜 가능하면 레이즈 우선
  if (forcePressure && canRaise && toCall < chips) {
    if (rng() < 0.85) return 'raise';
  }

  if (profile.style === 'bluffer') {
    // 약한 패도 레이즈 자주
    if (strength < 0.35) {
      if (canRaise && rng() < profile.bluff) return 'raise';
      if (raiseSeen && canCall && rng() < 0.55) return 'call';
      if (!canCall || rng() < 0.35) return 'die';
      return 'call';
    }
    if (strength < 0.55) {
      if (canRaise && rng() < 0.5 + profile.bluff * 0.3) return 'raise';
      return canCall ? 'call' : 'die';
    }
    // 강한 패: 슬로우 or 레이즈
    if (canRaise && rng() < 0.7) return 'raise';
    return canCall ? 'call' : 'die';
  }

  if (profile.style === 'calm') {
    if (strength < 0.4) {
      if (toCall === 0) return 'call';
      if (raiseSeen) return rng() < 0.2 ? 'call' : 'die';
      return canCall && rng() < 0.35 ? 'call' : 'die';
    }
    if (strength < 0.7) {
      // 가끔 슬로우플레이 (콜만)
      if (canRaise && rng() < 0.2) return 'raise';
      return canCall ? 'call' : 'die';
    }
    if (canRaise && rng() < 0.55) return 'raise';
    return canCall ? 'call' : 'die';
  }

  // gambler: 극단
  if (strength < 0.45) {
    if (canRaise && rng() < profile.bluff) return 'raise';
    return rng() < 0.6 ? 'die' : canCall ? 'call' : 'die';
  }
  if (canRaise && rng() < 0.8) return 'raise';
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
