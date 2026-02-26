import sanitizeHtml from 'sanitize-html';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import Prism from 'prismjs';

// Require core components first
import 'prismjs/components/prism-clike.js';
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-java.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-yaml.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-css.js';
import 'prismjs/components/prism-markup.js';
import 'prismjs/components/prism-markdown.js';
import 'prismjs/components/prism-sql.js';

marked.use(markedHighlight({
  langPrefix: 'language-',
  highlight(code, lang) {
    if (Prism.languages[lang]) {
      return Prism.highlight(code, Prism.languages[lang], lang);
    }
    return code;
  }
}));

function youtubeEmbeder(url) {
  url = url.replace('https://', '').replace('http://', '').replace('www.', '');

  const youtubeUrls = [
    /^youtube\.com\/shorts\/([\w-]+)(?:\?si=[\w-]+)?/, // Shorts 우선 처리
    /^(?:m\.)?youtube\.com\/watch\?v=([\w-]+)(?:&t=(\d+))?/,
    /^(?:m\.)?youtube\.com\/v\/([\w-]+)(?:\?t=(\d+))?/,
    /^youtube\.com\/embed\/([\w-]+)(?:\?start=(\d+))?/,
    /^youtu\.be\/([\w-]+)(?:\?t=(\d+))?/
  ];

  for (let i = 0; i < youtubeUrls.length; i++) {
    const _match = url.match(youtubeUrls[i]);

    if (_match) {
      const id = _match[1];
      const time = _match[2];

      const paddingBottom = i === 0 ? '177.77%' : '56.25%';
      const width = i === 0 ? '315px' : '560px';

      return `<div style="max-width: 100%; width: ${width}; margin: 0 auto;">
           <div style="position: relative; width: 100%; height: 0; padding-bottom: ${paddingBottom};">
            <iframe src="https://www.youtube.com/embed/${id}${time ? `?start=${time}` : ''}"
              style="position: absolute; width: 100%; height: 100%; top: 0; left: 0;"
              frameborder="0" allow="autoplay; encrypted-media" allowfullscreen>
            </iframe>
          </div>
        </div>`;
    }
  }

  return null;
}

export function isMarkdownContent(text) {
  if (!text) return false;
  // 제목, 리스트, 인용구, 코드, 볼드체/이탤릭체, 링크, 표 등 다양한 마크다운 식별 
  return /(^#{1,6}\s+|^\s*[-*+]\s+|^>\s+|^\d+\.\s+|^\[[^\]]+\]\s+|`[^`]+`|\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)]+\)|!\[[^\]]*\]\([^)]+\))/m.test(text);
}

export function viewComment(comment) {
  // 마크다운 문법 감지
  const isMarkdown = isMarkdownContent(comment);

  if (isMarkdown) {
    // 동기식 변환 지원 후 article 태그로 래핑
    let parsedHtml = /** @type {string} */ (marked.parse(comment, { breaks: true }));
    // Prism-themes는 pre 태그에 'language-' 클래스가 있어야 배경색/패딩이 정상 적용되므로 클래스 복사
    parsedHtml = parsedHtml.replace(/<pre><code class="([^"]+)">/g, '<pre class="$1"><code class="$1">');
    comment = `<article class="markdown-body">${parsedHtml}</article>`;
  } else {
    comment = comment.replace(/(?:\r\n|\r|\n)/g, '<br>');
  }

  // 안전 태그 (Instagram 임베드 허용 및 마크다운 관련 태그 추가)
  comment = sanitizeHtml(comment, {
    allowedTags: [
      'br',
      'strong',
      'em',
      'u',
      's',
      'p',
      'div',
      'blockquote',
      'img',
      'iframe',
      'a',
      'span',
      'article',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'code', 'pre', 'hr'
    ],
    allowedAttributes: {
      blockquote: ['class', 'data-instgrm-permalink', 'style'],
      iframe: [
        'src',
        'width',
        'height',
        'frameborder',
        'allow',
        'allowfullscreen',
        'style',
        'position'
      ],
      div: ['style', 'class'],
      article: ['class'],
      pre: ['class'],
      code: ['class'],
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'style'],
      span: ['style', 'class']
    },
    // XSS 방지를 위한 프로토콜 철저한 차단 (javascript: 스키마 차단 등)
    allowedSchemes: ['http', 'https', 'ftp', 'mailto', 'tel'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data']
    },
    allowedStyles: {
      '*': {
        'aspect-ratio': [/.*/],
        width: [/.*/],
        height: [/.*/],
        'max-width': [/.*/],
        margin: [/.*/],
        display: [/.*/],
        position: [/.*/],
        'padding-bottom': [/.*/]
      }
    }
  });

  const httpRegexG =
    /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/g;

  const matched = comment.match(httpRegexG);

  if (matched) {
    matched.forEach((m) => {
      // YouTube 임베드 우선 처리
      const youtubeEmbed = youtubeEmbeder(m);
      if (youtubeEmbed) {
        comment = comment.replace(m, youtubeEmbed);
        return;
      }

      // 일반 링크는 마크다운이 아닐 때만 제거 (OG 미리보기로 대체됨)
      // 마크다운에서는 a 태그가 그대로 동작해야 함
      if (!isMarkdown) {
        comment = comment.replace(m, '');
      }
    });
  }

  return comment;
}
