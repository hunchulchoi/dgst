import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const writePage = readFileSync(
  'src/routes/board/[boardId=boardId]/write/[[articleId]]/+page.svelte',
  'utf8'
);
const lexicalEditor = readFileSync('src/lib/components/LexicalEditor.svelte', 'utf8');
const uploadRoute = readFileSync('src/routes/board/upload/+server.js', 'utf8');
const uploadLimits = readFileSync('src/lib/util/uploadLimits.js', 'utf8');
const dockerfile = readFileSync('Dockerfile', 'utf8');
const dockerCompose = readFileSync('conf/docker-compose.yml', 'utf8');

describe('write page video upload', () => {
  it('tries client-side ffmpeg compression before uploading videos', () => {
    expect(writePage).not.toContain('disableVideoCompression={true}');
    expect(lexicalEditor).toContain('serverCompressVideo');
  });

  it('uses different MIME filters for image and video upload buttons', () => {
    expect(lexicalEditor).toContain("const accept = kind === 'image' ? 'image/*' : 'video/*'");
    expect(lexicalEditor).toContain('fileInput.accept = accept');
    expect(lexicalEditor).toContain('accept={selectedUploadAccept}');
    expect(lexicalEditor).toContain("onclick={() => openFilePicker('image')}");
    expect(lexicalEditor).toContain("onclick={() => openFilePicker('video')}");
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
    expect(lexicalEditor).toContain('lastFfmpegLoadDetails');
    expect(lexicalEditor).toContain('getClientCapabilityDetails');
    expect(lexicalEditor).toContain("FFMPEG_CORE_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd'");
    expect(lexicalEditor).toContain('loadFfmpegCoreBlobUrl');
    expect(lexicalEditor).toContain("loadDetails.phase = 'downloading-core-assets'");
    expect(lexicalEditor).toContain("loadDetails.phase = 'importing-modules'");
    expect(lexicalEditor).toContain("loadDetails.phase = 'loading-core'");
    expect(lexicalEditor).toContain('`${key}DownloadMs`');
    expect(lexicalEditor).toContain('`${key}Bytes`');
    expect(lexicalEditor).toContain('ffmpeg.load({ coreURL, wasmURL })');
    expect(lexicalEditor).toContain('loadTimeoutMs: 60000');
    expect(lexicalEditor).toContain('fileSizeMB');
    expect(lexicalEditor).toContain('ffmpegLoad: lastFfmpegLoadDetails');
    expect(lexicalEditor).toContain('connectionEffectiveType');
    expect(lexicalEditor).toContain('sharedArrayBuffer');
  });

  it('sends client log detail payloads to the server', () => {
    const reportClientPageError = readFileSync('src/lib/util/reportClientPageError.js', 'utf8');
    expect(reportClientPageError).toContain('@property {Record<string, unknown>} [details]');
    expect(reportClientPageError).toContain('...(details && { details })');
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
    expect(uploadLimits).toContain('BOARD_UPLOAD_MAX_BYTES = 100 * 1024 * 1024');
    expect(lexicalEditor).toContain('preparedFile.size > BOARD_UPLOAD_MAX_BYTES');
    expect(lexicalEditor).toContain('UploadTooLargeError');
    expect(lexicalEditor).toContain('BOARD_UPLOAD_MAX_MB');
    expect(lexicalEditor).toContain('MB 이하 파일만 업로드할 수 있어요');
  });

  it('shows the same size warning for server 413 responses', () => {
    expect(lexicalEditor).toContain('response.status === 413');
    expect(lexicalEditor).toContain('파일이 너무 큽니다');
  });

  it('sets adapter-node BODY_SIZE_LIMIT to the board upload limit in production', () => {
    expect(uploadLimits).toContain("BOARD_UPLOAD_BODY_SIZE_LIMIT = `${BOARD_UPLOAD_MAX_MB}M`");
    expect(dockerfile).toContain('ENV BODY_SIZE_LIMIT=100M');
    expect(dockerCompose).toContain('BODY_SIZE_LIMIT: 100M');
  });

  it('returns a 413 upload response when request.formData hits the body limit', () => {
    expect(uploadRoute).toContain('isBodySizeLimitError');
    expect(uploadRoute).toContain('throw error(413');
    expect(uploadRoute).toContain('Content-length of');
    expect(uploadRoute).toContain('request body size exceeded');
  });
});
