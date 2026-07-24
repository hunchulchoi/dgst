/** @param {number} value @param {number} min @param {number} max */
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

/**
 * @typedef {{ heat: number; confidence: number }} NpcEmotion
 * @typedef {Record<string, NpcEmotion>} NpcEmotionMap
 */

/**
 * 끝난 판을 바탕으로 다음 판 감정을 계산한다.
 * 유저의 공격적인 승리는 살아서 맞선 NPC에게 더 큰 복수심을 남긴다.
 * @param {NpcEmotionMap} current
 * @param {{ winnerId?: string | null; winnerIds?: string[]; userRaiseCount?: number; seats: Array<{ id: string; isNpc: boolean; folded: boolean }> }} round
 * @returns {NpcEmotionMap}
 */
export function nextNpcEmotions(current, round) {
  /** @type {NpcEmotionMap} */
  const next = { ...current };
  const winnerIds = round.winnerIds?.length
    ? round.winnerIds
    : round.winnerId
      ? [round.winnerId]
      : [];
  const userWon = winnerIds.length === 1 && winnerIds[0] === 'user';
  const aggressiveUserWin = userWon && Number(round.userRaiseCount ?? 0) >= 2;

  for (const seat of round.seats.filter((candidate) => candidate.isNpc)) {
    const before = current[seat.id] ?? { heat: 0, confidence: 0 };
    if (userWon) {
      const heatGain = aggressiveUserWin && !seat.folded ? 2 : 1;
      next[seat.id] = {
        heat: clamp(before.heat + heatGain, 0, 3),
        confidence: clamp(before.confidence - 1, 0, 2)
      };
      continue;
    }

    if (winnerIds.length === 1 && winnerIds[0] === seat.id) {
      next[seat.id] = {
        heat: clamp(before.heat - 1, 0, 3),
        confidence: clamp(before.confidence + 1, 0, 2)
      };
      continue;
    }

    next[seat.id] = {
      heat: clamp(before.heat - 1, 0, 3),
      confidence: clamp(before.confidence - 1, 0, 2)
    };
  }
  return next;
}

/**
 * @param {NpcEmotion | null | undefined} emotion
 */
export function emotionView(emotion) {
  const heat = clamp(emotion?.heat ?? 0, 0, 3);
  const confidence = clamp(emotion?.confidence ?? 0, 0, 2);
  if (heat >= 3) {
    return {
      mood: '복수심 폭발',
      line: '이번 판은 끝까지 안 물러선다.',
      revenge: true,
      aggression: 3
    };
  }
  if (heat >= 2) {
    return {
      mood: '벼르는 중',
      line: '아까 그 판, 잊지 않았다.',
      revenge: true,
      aggression: 2
    };
  }
  if (heat === 1) {
    return {
      mood: '경계',
      line: '이번에는 수를 읽어주지.',
      revenge: false,
      aggression: 1
    };
  }
  if (confidence >= 2) {
    return {
      mood: '기세등등',
      line: '오늘 패가 내 편이군.',
      revenge: false,
      aggression: 2
    };
  }
  if (confidence === 1) {
    return {
      mood: '자신만만',
      line: '흐름이 좋군.',
      revenge: false,
      aggression: 1
    };
  }
  return { mood: '침착', line: '패부터 보자고.', revenge: false, aggression: 0 };
}
