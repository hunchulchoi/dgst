import Prism from 'prismjs';
import loadLanguages from 'prismjs/components/index.js';
loadLanguages(['javascript', 'python', 'svelte', 'typescript', 'bash', 'json', 'yaml', 'markdown']);

const html = Prism.highlight('const a = 1;', Prism.languages.javascript, 'javascript');
console.log(html);
