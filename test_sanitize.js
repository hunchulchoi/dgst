import sanitizeHtml from 'sanitize-html';
const input = '<pre class="language-js"><code class="language-js"><span class="token keyword">const</span></code></pre>';
const output = sanitizeHtml(input, {
  allowedTags: ['pre', 'code', 'span'],
  allowedAttributes: {
    pre: ['class'],
    code: ['class'],
    span: ['class']
  }
});
console.log(output);
