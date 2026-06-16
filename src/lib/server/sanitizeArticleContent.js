import sanitizeHtml from 'sanitize-html';

/** @type {Record<string, unknown>} */
const ARTICLE_SANITIZE_OPTIONS = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'em',
    'u',
    's',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'blockquote',
    'a',
    'img',
    'video',
    'iframe',
    'div',
    'span',
    'pre',
    'code'
  ],
  allowedAttributes: {
    blockquote: ['class', 'data-instgrm-permalink', 'style'],
    iframe: [
      'src',
      'width',
      'height',
      'class',
      'frameborder',
      'allow',
      'allowfullscreen',
      'style',
      'position'
    ],
    video: ['src', 'controls', 'style', 'width', 'height'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'style'],
    div: ['class', 'style', 'position'],
    span: ['style', 'class'],
    pre: ['class'],
    code: ['class']
  },
  allowedStyles: {
    '*': {
      'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
      color: [/^#(?:[0-9a-fA-F]{3,4}){1,2}$/, /^rgb\(/, /^rgba\(/, /^hsl\(/, /^hsla\(/, /^[a-z]+$/],
      'background-color': [
        /^#(?:[0-9a-fA-F]{3,4}){1,2}$/,
        /^rgb\(/,
        /^rgba\(/,
        /^hsl\(/,
        /^hsla\(/,
        /^[a-z]+$/
      ],
      'font-size': [/^\d+(?:px|em|rem|%)$/],
      width: [/^\d+(?:px|em|rem|%)$/],
      height: [/^\d+(?:px|em|rem|%)$/],
      'max-width': [/^\d+(?:px|em|rem|%)$/],
      'aspect-ratio': [/.*/],
      margin: [/.*/],
      display: [/.*/],
      position: [/.*/],
      top: [/.*/],
      left: [/.*/],
      'padding-bottom': [/.*/]
    }
  }
};

/**
 * 게시글 본문 HTML을 서버에서 정화 (저장·표시 규칙 공유).
 * @param {string} htmlContent
 * @returns {string}
 */
export function sanitizeArticleContent(htmlContent) {
  return sanitizeHtml(String(htmlContent ?? ''), ARTICLE_SANITIZE_OPTIONS);
}
