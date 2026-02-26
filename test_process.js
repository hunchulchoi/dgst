import sanitizeHtml from 'sanitize-html';

function processArticleContent(htmlContent) {
  return sanitizeHtml(htmlContent, {
    allowedTags: ['p', 'span'],
    allowedAttributes: {
      span: ['style']
    }
  });
}

const input = '<p><pre><code class="language-css"><span class="token comment">/* 1. 기본 폰트 및 배경 설정 */</span></code></pre></p>';
console.log(processArticleContent(input));
