import { isMarkdownContent, viewComment } from './src/lib/util/embeder.js';

const md = "```javascript\nconst a = 1;\n```";
console.log(isMarkdownContent(md));
console.log(viewComment(md));
