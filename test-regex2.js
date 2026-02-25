import { isMarkdownContent } from './src/lib/util/embeder.js';
const text = `Sources
[1] Secure Markdown Rendering in React https://www.hackerone.com/blog/secure-markdown-rendering-react-balancing-flexibility-and-safety`;

console.log('Result:', isMarkdownContent(text));
