import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const writePage = readFileSync(
  'src/routes/board/[boardId=boardId]/write/[[articleId]]/+page.svelte',
  'utf8'
);

describe('write page image upload spinner', () => {
  it('shows the blocking spinner overlay while an image upload is in progress', () => {
    expect(writePage).toContain('{#if formSubmitting || uploading > 0 || isLoadingOG}');
    expect(writePage).toContain('uploadStatusText');
    expect(writePage).toContain('파일을 업로드 중입니다...');
  });

  it('shows the blocking spinner overlay while the article is being submitted', () => {
    expect(writePage).toContain('글을 저장 중입니다...');
    expect(writePage).toContain(': formSubmitting');
    expect(writePage).toContain("? '글을 저장 중입니다...'");
  });
});
