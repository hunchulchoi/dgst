import fs from 'fs';
import { viewComment } from './src/lib/util/embeder.js';

const text = fs.readFileSync('/tmp/article_content.txt', 'utf8');
const result = viewComment(text);
const match = result.indexOf('span class="token');
console.log(result.substring(match - 50, match + 100));
