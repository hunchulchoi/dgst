import { evaluateHand, handStrength } from './seotdaEngine.js';

const TELL_COPY = {
  bluffer: {
    strong: '입꼬리가 슬쩍 올라간다.',
    neutral: '큰소리만 치며 눈을 부릅뜬다.',
    weak: '칩을 괜히 세게 내려놓는다.'
  },
  calm: {
    strong: '호흡이 유난히 고르다.',
    neutral: '표정이 돌처럼 굳어 있다.',
    weak: '시선이 자꾸 패로 돌아간다.'
  },
  gambler: {
    strong: '손끝이 멈추고 눈빛이 선다.',
    neutral: '미소만 남긴 채 반응이 없다.',
    weak: '잔칩을 만지작거리는 손이 바쁘다.'
  }
};

/**
 * NPC의 실제 패와 어느 정도 연결되지만 가끔 거짓인 공개 힌트.
 * @param {import('./seotdaEngine.js').SeotdaCard[]} cards
 * @param {'bluffer' | 'calm' | 'gambler' | string | undefined} style
 * @param {{ revenge?: boolean; aggression?: number } | null | undefined} emotion
 * @param {() => number} [rng]
 */
export function createNpcTell(cards, style, emotion, rng = Math.random) {
  const strength = handStrength(evaluateHand(cards));
  const actual = strength >= 0.68 ? 'strong' : strength <= 0.34 ? 'weak' : 'neutral';
  const normalizedStyle =
    style === 'calm' || style === 'gambler' || style === 'bluffer' ? style : 'calm';
  const baseAccuracy =
    normalizedStyle === 'calm' ? 0.72 : normalizedStyle === 'gambler' ? 0.62 : 0.52;
  const emotionPenalty = emotion?.revenge ? 0.12 : Number(emotion?.aggression ?? 0) * 0.025;
  const accurate = rng() < Math.max(0.4, baseAccuracy - emotionPenalty);
  const signal = accurate
    ? actual
    : actual === 'strong'
      ? 'weak'
      : actual === 'weak'
        ? 'strong'
        : normalizedStyle === 'calm'
          ? 'weak'
          : 'strong';

  return {
    signal,
    label:
      signal === 'strong' ? '강한 기색' : signal === 'weak' ? '흔들림' : '포커페이스',
    text: TELL_COPY[normalizedStyle][signal]
  };
}
