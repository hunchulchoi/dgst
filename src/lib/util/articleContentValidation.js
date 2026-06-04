/**
 * Quill 등에서 오는 HTML 본문이 실질적으로 비어 있는지 판별한다.
 */

const MIN_TEXT_LENGTH = 1;

/**
 * @param {string} html
 * @returns {string}
 */
export function stripArticlePlainText(html) {
  return String(html ?? '')
    .replace(/<p>\s*<br\s*\/?>(\s|\u00A0|&#160;)*<\/p>/gi, '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, '')
    .replace(/[\s\u00A0\u200B\uFEFF]/g, '')
    .trim();
}

/**
 * @param {string} html
 * @returns {boolean}
 */
export function hasArticleMedia(html) {
  return /<(?:img|video|iframe|blockquote)\b/i.test(String(html ?? ''));
}

/**
 * @param {string} html
 * @param {{ minTextLength?: number }} [options]
 * @returns {{ ok: true } | { ok: false; message: string }}
 */
export function validateArticleContent(html, options = {}) {
  const minTextLength = options.minTextLength ?? MIN_TEXT_LENGTH;
  const source = String(html ?? '').trim();

  if (!source) {
    return { ok: false, message: '본문을 입력해주세요.' };
  }

  if (hasArticleMedia(source)) {
    return { ok: true };
  }

  const plain = stripArticlePlainText(source);
  if (plain.length >= minTextLength) {
    return { ok: true };
  }

  if (plain.length === 0) {
    return { ok: false, message: '본문을 입력해주세요.' };
  }

  return {
    ok: false,
    message: `본문이 너무 짧습니다. 최소 ${minTextLength}자 이상 입력해주세요.`
  };
}
