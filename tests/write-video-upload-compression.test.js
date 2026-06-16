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

  it('shows video compression progress while ffmpeg is running', () => {
    expect(lexicalEditor).toContain("ffmpeg.on?.('progress'");
    expect(lexicalEditor).toContain('동영상 압축 중...');
    expect(lexicalEditor).toContain('경과');
    expect(lexicalEditor).toContain('남은 시간 약');
    expect(lexicalEditor).toContain('onUploadStatusChange?.(text)');
    expect(writePage).toContain('onUploadStatusChange={handleUploadStatusChange}');
    expect(writePage).toContain('? uploadStatusText');
  });

  it('reports client-side video compression failures to server logs', () => {
    expect(lexicalEditor).toContain('reportClientError(error');
    expect(lexicalEditor).toContain("type: 'lexical-video-compression-failed'");
  });

  it('reports failed image uploads to server logs', () => {
    expect(lexicalEditor).toContain('reportClientError(error');
    expect(lexicalEditor).toContain('lexical-image-upload-failed');
  });

  it('asks the server to compress videos only when client compression did not produce a new file', () => {
    expect(uploadRoute).toContain('serverCompressVideo');
    expect(uploadRoute).toContain('compressVideo');
  });

  it('warns when the prepared upload is still over the 100MB upload limit', () => {
    expect(lexicalEditor).toContain('UPLOAD_MAX_BYTES = 100 * 1024 * 1024');
    expect(lexicalEditor).toContain('preparedFile.size > UPLOAD_MAX_BYTES');
    expect(lexicalEditor).toContain('UploadTooLargeError');
    expect(lexicalEditor).toContain('100MB 이하 파일만 업로드할 수 있어요');
  });

  it('shows the same size warning for server 413 responses', () => {
    expect(lexicalEditor).toContain('response.status === 413');
    expect(lexicalEditor).toContain('파일이 너무 큽니다');
  });
});
