/**
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {string}
 */
export function formatAlarmCommentPreview(value, maxLength = 60) {
  const normalized = String(value ?? '')
    .replace(/<audio\b[^>]*>[\s\S]*?<\/audio>/gi, ' 🎧 ')
    .replace(/<audio\b[^>]*\/>/gi, ' 🎧 ')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(normalized);
  if (chars.length <= maxLength) return normalized;

  return `${chars.slice(0, maxLength).join('')}...`;
}
