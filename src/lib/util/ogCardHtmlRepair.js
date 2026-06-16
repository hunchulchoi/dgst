/**
 * @param {string} value
 * @returns {string}
 */
function decodeHtmlEntities(value) {
  /** @type {Record<string, string>} */
  const namedEntities = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  };

  return String(value ?? '').replaceAll(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const isHex = entity[1]?.toLowerCase() === 'x';
      const codePointText = isHex ? entity.slice(2) : entity.slice(1);
      const codePoint = Number.parseInt(codePointText, isHex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return namedEntities[String(entity).toLowerCase()] ?? match;
  });
}

/**
 * @param {string} value
 * @returns {string}
 */
function decodeHtmlEntitiesDeep(value) {
  let decoded = String(value ?? '');

  for (let i = 0; i < 3; i += 1) {
    const next = decodeHtmlEntities(decoded);
    if (next === decoded) break;
    decoded = next;
  }

  return decoded;
}

/** @param {string} text */
function isUrlText(text) {
  return /^https?:\/\//i.test(decodeHtmlEntitiesDeep(text).trim());
}

/**
 * @param {string} html
 * @returns {string}
 */
function repairAttributeTaggedOgText(html) {
  return html.replaceAll(
    /(<div[^>]+data-og-(?:title|description|site)[^>]*>)([\s\S]*?)(<\/div>)/gi,
    (_, openTag, text, closeTag) => `${openTag}${decodeHtmlEntitiesDeep(text)}${closeTag}`
  );
}

/**
 * @param {string} html
 * @returns {string}
 */
function repairPlainDivText(html) {
  return html.replaceAll(
    /(<div\b[^>]*>)([^<>]*&(?:#x?[0-9a-f]+|[a-z]+);[^<>]*)(<\/div>)/gi,
    (token, openTag, text, closeTag) =>
      isUrlText(text) ? token : `${openTag}${decodeHtmlEntitiesDeep(text)}${closeTag}`
  );
}

/**
 * Stored OG cards can contain doubly-escaped text like `&amp;apos;`.
 * Decode only the human-readable OG text fields and leave href/image URLs untouched.
 *
 * @param {string} html
 * @returns {string}
 */
export function repairOgCardHtmlEntities(html) {
  return repairPlainDivText(repairAttributeTaggedOgText(String(html ?? '')));
}
