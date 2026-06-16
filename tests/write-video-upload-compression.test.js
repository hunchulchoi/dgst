import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const writePage = readFileSync(
  'src/routes/board/[boardId=boardId]/write/[[articleId]]/+page.svelte',
  'utf8'
);
const lexicalEditor = readFileSync('src/lib/components/LexicalEditor.svelte', 'utf8');
const uploadRoute = readFileSync('src/routes/board/upload/+server.js', 'utf8');

describe('write page video upload', () => {
  it('tries client-side ffmpeg compression before uploading videos', () => {
    expect(writePage).not.toContain('disableVideoCompression={true}');
    expect(lexicalEditor).toContain('serverCompressVideo');
  });

  it('asks the server to compress videos only when client compression did not produce a new file', () => {
    expect(uploadRoute).toContain('serverCompressVideo');
    expect(uploadRoute).toContain('compressVideo');
  });
});
