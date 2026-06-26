// 이모지 감지 유틸리티
const graphemeSegmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

const rgiEmojiPattern = createRegex('\\p{RGI_Emoji}', 'v');
const emojiSequencePattern = createRegex(
  '(?:\\p{Extended_Pictographic}|[#*0-9]\\uFE0F?\\u20E3)(?:\\uFE0F|\\u200D\\p{Extended_Pictographic}|\\p{Emoji_Modifier})*',
  'u'
);

/**
 * @param {string} source
 * @param {string} flags
 * @returns {RegExp | null}
 */
function createRegex(source, flags) {
  try {
    return new RegExp(`^(?:${source})$`, flags);
  } catch {
    return null;
  }
}

/**
 * @param {string} str
 * @returns {string[]}
 */
function splitGraphemes(str) {
  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(str), ({ segment }) => segment);
  }
  return Array.from(str);
}

/**
 * @param {string} segment
 * @returns {boolean}
 */
function isEmojiSegment(segment) {
  return Boolean(rgiEmojiPattern?.test(segment) || emojiSequencePattern?.test(segment));
}

/**
 * 문자열에서 이모지 개수를 세는 함수
 * @param {string} str
 * @returns {number} 이모지 개수
 */
export function countEmojis(str) {
  if (typeof str !== 'string' || !str) return 0;
  return splitGraphemes(str).filter(isEmojiSegment).length;
}

/**
 * 문자열이 이모지 1개만 포함하는지 확인
 * @param {string} str
 * @returns {boolean} 이모지 1개만 포함하면 true
 */
export function isOnlyOneEmoji(str) {
  if (typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (!trimmed) return false;
  const segments = splitGraphemes(trimmed);
  return segments.length === 1 && isEmojiSegment(segments[0]);
}
