import { evaluateHand, handStrength, raiseAmount, minRaisePay, ANTE } from './seotdaEngine.js';

/**
 * @typedef {'die' | 'call' | 'raise'} SeotdaAction
 * @typedef {{ id: string; name: string; style: 'bluffer' | 'calm' | 'gambler'; bluff: number }} NpcProfile
 */

/** @type {NpcProfile[]} */
export const NPC_PROFILES = [
  { id: 'npc_agwi', name: '아귀', style: 'bluffer', bluff: 0.25 },
  { id: 'npc_goni', name: '고니', style: 'calm', bluff: 0.12 },
  { id: 'npc_madam', name: '정마담', style: 'gambler', bluff: 0.3 }
];

/**
 * @param {number} commitRatio
 * @param {number} strength
 * @param {number} potOdds
 * @param {boolean | undefined} bluffCatcher
 * @param {number} profileBluff
 */
function pressureCallChance(commitRatio, strength, potOdds, bluffCatcher, profileBluff) {
  const requiredStrength = Math.min(0.86, potOdds + 0.18 + commitRatio * 0.15);
  if (strength < requiredStrength) {
    return Math.min(0.1, (bluffCatcher ? 0.08 : 0.065) + profileBluff * 0.1);
  }
  const edge = (strength - requiredStrength) / Math.max(0.01, 1 - requiredStrength);
  return Math.min(0.94, 0.55 + edge * 0.45 + (bluffCatcher ? 0.08 : 0));
}

/**
 * @param {import('./seotdaEngine.js').SeotdaCard[]} cards
 * @param {NpcProfile} profile
 * @param {{ toCall: number; chips: number; pot: number; raiseSeen: boolean; forcePressure?: boolean; bluffCatcher?: boolean; isOpening?: boolean; activeOpponents?: number; ante?: number }} ctx
 * @param {() => number} [rng]
 * @returns {SeotdaAction}
 */
export function chooseNpcAction(cards, profile, ctx, rng = Math.random) {
  const hand = evaluateHand(cards);
  const headsUpStrength = handStrength(hand);
  const { toCall, chips, pot, raiseSeen, forcePressure, bluffCatcher } = ctx;
  const ante = Math.max(ANTE, Number(ctx.ante ?? ANTE));
  const activeOpponents = Math.max(1, Number(ctx.activeOpponents ?? 1));
  const strength = Math.pow(headsUpStrength, activeOpponents);
  if (chips <= 0) return 'die';

  const canFullCall = toCall <= chips;
  const canRaise = chips > toCall;
  const commitRatio = toCall > 0 ? toCall / Math.max(chips, 1) : 0;
  const potOdds = toCall > 0 ? toCall / Math.max(1, pot + toCall) : 0;

  // 선 NPC의 오프닝: 약패 뻥카는 성향별, 강패는 밸류 레이즈.
  if (ctx.isOpening && toCall === 0) {
    if (headsUpStrength < 0.4) {
      const bluffChance =
        profile.style === 'bluffer' ? 0.2 : profile.style === 'gambler' ? 0.14 : 0.05;
      return canRaise && rng() < bluffChance ? 'raise' : 'call';
    }
    if (headsUpStrength >= 0.65) {
      const valueRaiseChance =
        profile.style === 'calm' ? 0.7 : profile.style === 'gambler' ? 0.8 : 0.75;
      return canRaise && rng() < valueRaiseChance ? 'raise' : 'call';
    }
    if (profile.style === 'gambler' && canRaise && rng() < 0.12) return 'raise';
    return 'call';
  }

  // 큰 레이즈는 부담률에 따라 혼합 콜한다. 지정 캐처 외 NPC는 빈도를 낮춘다.
  if (raiseSeen && toCall >= ante * 2 && hand.tier < 80) {
    const catchChance = pressureCallChance(
      commitRatio,
      strength,
      potOdds,
      bluffCatcher,
      profile.bluff
    );
    if (rng() >= catchChance || !canFullCall) return 'die';
    if (canRaise && strength >= 0.68 && commitRatio <= 0.4 && rng() < 0.35) return 'raise';
    return 'call';
  }

  // 콜 가격보다 승산이 크게 낮으면 대부분 포기한다. 성향에 따라 가끔만 따라간다.
  if (toCall > 0 && raiseSeen && strength + 0.08 < potOdds) {
    const stubbornChance = 0.03 + profile.bluff * 0.08;
    return rng() < stubbornChance && canFullCall ? 'call' : 'die';
  }

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
  if (canRaise && strength < 0.4 && rng() < 0.05 + profile.bluff * 0.08) {
    return 'raise';
  }

  // 압박 담당 — 랜덤
  if (forcePressure && canRaise && toCall < chips) {
    const roll = rng();
    if (roll < 0.18) return 'raise';
    if (roll < 0.55 && canFullCall) return 'call';
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
    if (canRaise && r < profile.bluff * 0.28) return 'raise';
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
 * NPC 레이즈 금액 — 기본 2~4 ante, 강패일 때만 큰 베팅
 * @param {number} toCall
 * @param {number} chips
 * @param {() => number} [rng]
 * @param {number} [ante]
 * @param {boolean} [strongHand]
 */
export function npcRaiseChips(toCall, chips, rng = Math.random, ante = ANTE, strongHand = false) {
  const minPay = minRaisePay(toCall, ante);
  if (chips <= minPay) return Math.min(chips, Math.max(toCall, minPay));

  let target = Math.max(minPay, toCall + ante * (1 + Math.floor(rng() * 3)));
  if (strongHand) {
    const roll = rng();
    if (roll < 0.05) target = chips;
    else if (roll < 0.25) target = Math.max(target, Math.floor(chips * (0.25 + rng() * 0.25)));
  }

  return raiseAmount(toCall, chips, target, ante);
}
