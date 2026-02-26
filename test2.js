import Prism from 'prismjs';
globalThis.Prism = Prism;
await import('prismjs/components/prism-javascript.js');
const html = Prism.highlight('const a = 1;', Prism.languages.javascript, 'javascript');
console.log(html);
