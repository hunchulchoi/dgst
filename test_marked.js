import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import Prism from 'prismjs';

const md = '```js\nconst a = 1;\n```';

marked.use(markedHighlight({
  langPrefix: 'language-',
  highlight(code, lang) {
    return Prism.highlight(code, Prism.languages[lang], lang);
  }
}));

console.log(marked.parse(md));
