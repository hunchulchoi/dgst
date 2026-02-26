import Prism from 'prismjs';
import 'prismjs/components/prism-css.js';

const code = `/* 1. 기본 폰트 및 배경 설정 */
:root {--notion-font: -apple-system;}`;

console.log(Prism.highlight(code, Prism.languages.css, 'css'));
