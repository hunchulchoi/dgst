const URL_PATTERN =
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:(?:&amp;)|[-a-zA-Z0-9()@:%_.+~#?&/=;])*/g;

const HTML_TAG_PATTERN = /(<[^>]+>)/g;

/** @param {string} value */
function escapeHtmlAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** @param {string} value */
function toHref(value) {
  return escapeHtmlAttribute(value.replaceAll('&amp;', '&'));
}

/** @param {string} text */
function linkifyText(text) {
  return text.replace(URL_PATTERN, (url) => {
    return `<a href="${toHref(url)}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

/** @param {string} html */
export function linkifyPlainUrls(html) {
  let inAnchor = false;

  return String(html ?? '')
    .split(HTML_TAG_PATTERN)
    .map((part) => {
      if (!part) return part;

      if (part.startsWith('<')) {
        if (/^<a(?:\s|>)/i.test(part)) inAnchor = true;
        if (/^<\/a\s*>/i.test(part)) inAnchor = false;
        return part;
      }

      return inAnchor ? part : linkifyText(part);
    })
    .join('');
}
