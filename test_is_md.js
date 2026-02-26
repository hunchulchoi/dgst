import { isMarkdownContent } from './src/lib/util/embeder.js';
import fs from 'fs';
const text = fs.readFileSync('/tmp/article_content.txt', 'utf8');
console.log("isMarkdown Content:", isMarkdownContent(text));
