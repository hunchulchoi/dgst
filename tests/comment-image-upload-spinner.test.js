import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);

describe('comment image upload spinner', () => {
  it('shows an image upload message while comment images are being processed or submitted', () => {
    expect(articlePage).toContain("let commentLoadingMessage = $state('댓글 저장 중...')");
    expect(articlePage).toContain("commentLoadingMessage = '이미지를 업로드 중입니다...'");
    expect(articlePage).toContain('{commentLoadingMessage}');
  });

  it('can upload and record audio into comment content', () => {
    expect(articlePage).toContain("accept=\"image/*,audio/*\"");
    expect(articlePage).toContain('appendCommentAudio');
    expect(articlePage).toContain('uploadCommentAudioFile');
    expect(articlePage).toContain('toggleCommentAudioRecording');
    expect(articlePage).toContain('navigator.mediaDevices.getUserMedia({ audio: true })');
    expect(articlePage).toContain('new MediaRecorder(stream)');
    expect(articlePage).toContain('comment-recorded-audio');
    expect(articlePage).toContain('<audio src="${escapeHtml(url)}" controls');
    expect(articlePage).toContain('음성 파일 첨부');
    expect(articlePage).toContain("commentLoadingMessage = '음성을 업로드 중입니다...'");
  });
});
