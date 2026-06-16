import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const writePage = readFileSync(
  'src/routes/board/[boardId=boardId]/write/[[articleId]]/+page.svelte',
  'utf8'
);
const lexicalEditor = readFileSync('src/lib/components/LexicalEditor.svelte', 'utf8');
const uploadRoute = readFileSync('src/routes/board/upload/+server.js', 'utf8');
const uploadLimits = readFileSync('src/lib/util/uploadLimits.js', 'utf8');
const apiLogRoute = readFileSync('src/routes/api/log/+server.js', 'utf8');
const dockerfile = readFileSync('Dockerfile', 'utf8');
const dockerCompose = readFileSync('conf/docker-compose.yml', 'utf8');
const packageJson = readFileSync('package.json', 'utf8');

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
    expect(apiLogRoute).toContain('sanitizeClientLogDetails');
    expect(apiLogRoute).toContain('details: sanitizeClientLogDetails(logData.details)');
  });

  it('reports failed image uploads to server logs', () => {
    expect(lexicalEditor).toContain('reportClientError(error');
    expect(lexicalEditor).toContain('lexical-image-upload-failed');
  });

  it('asks the server to compress videos only when client compression did not produce a new file', () => {
    expect(uploadRoute).toContain('serverCompressVideo');
    expect(uploadRoute).toContain('compressVideo');
  });

  it('passes server compression context so server logs explain device and fallback reason', () => {
    expect(lexicalEditor).toContain('createServerVideoCompressionContext');
    expect(lexicalEditor).toContain("formData.set('serverCompressVideoReason'");
    expect(lexicalEditor).toContain("formData.set('serverCompressVideoClient'");
    expect(lexicalEditor).toContain("formData.set('serverCompressVideoWebCodecs'");
    expect(lexicalEditor).toContain('userAgent: nav?.userAgent');
    expect(uploadRoute).toContain('serverCompressVideoReason');
    expect(uploadRoute).toContain('serverCompressVideoClient');
    expect(uploadRoute).toContain('serverCompressVideoWebCodecs');
    expect(uploadRoute).toContain('serverCompressVideoContext');
    expect(uploadRoute).toContain('Server video compression upload requested');
    expect(uploadRoute).toContain("request.headers.get('user-agent')");
    const fileUpload = readFileSync('src/lib/util/fileUpload.js', 'utf8');
    expect(fileUpload).toContain('serverCompressVideoContext');
    expect(fileUpload).toContain('logger.warn({');
    expect(fileUpload).toContain('Server video compression requested');
    expect(fileUpload).toContain('Server video compression failed; saving original');
  });

  it('skips client ffmpeg on iOS Safari/WebView and sends the video to server compression', () => {
    expect(lexicalEditor).toContain('shouldUseServerVideoCompression(file)');
    expect(lexicalEditor).toContain('isIOSLikeClient()');
    expect(lexicalEditor).toContain('isSafariLikeClient()');
    expect(lexicalEditor).toContain('const webCodecsFile = await compressVideoWithWebCodecs(file)');
    expect(lexicalEditor).toContain("formData.set('serverCompressVideo', 'true')");
  });

  it('tries Mediabunny WebCodecs MP4 compression before server compression on iOS Safari videos', () => {
    expect(packageJson).toContain('"mediabunny"');
    expect(packageJson).not.toContain('"mp4-muxer"');
    expect(lexicalEditor).toContain("import('mediabunny')");
    expect(lexicalEditor).toContain('Conversion.init');
    expect(lexicalEditor).toContain('BlobSource');
    expect(lexicalEditor).toContain('BufferTarget');
    expect(lexicalEditor).toContain('Mp4OutputFormat');
    expect(lexicalEditor).toContain('forceTranscode: true');
    expect(lexicalEditor).toContain("type: 'lexical-video-webcodecs-compressed'");
  });

  it('can upload videos without audio when the mute option is enabled', () => {
    expect(lexicalEditor).toContain('removeVideoAudio');
    expect(lexicalEditor).toContain('동영상 음성 제거');
    expect(lexicalEditor).toContain("audio: removeVideoAudio");
    expect(lexicalEditor).toContain("formData.set('removeVideoAudio', 'true')");
    expect(uploadRoute).toContain('removeVideoAudio');
    const fileUpload = readFileSync('src/lib/util/fileUpload.js', 'utf8');
    expect(fileUpload).toContain('removeVideoAudio');
    expect(fileUpload).toContain("'-an'");
  });

  it('can extract and upload only audio from selected videos', () => {
    expect(lexicalEditor).toContain('extractVideoAudio');
    expect(lexicalEditor).toContain('동영상 음성만 업로드');
    expect(lexicalEditor).toContain("'-vn'");
    expect(lexicalEditor).toContain("formData.set('extractVideoAudio', 'true')");
    expect(lexicalEditor).toContain('<audio src="${escapeHtml(url)}" controls');
    expect(uploadRoute).toContain('extractVideoAudio');
    const fileUpload = readFileSync('src/lib/util/fileUpload.js', 'utf8');
    expect(fileUpload).toContain('extractVideoAudio');
    expect(fileUpload).toContain("'.m4a'");
    expect(fileUpload).toContain("mimeType.startsWith('audio')");
    const articlePage = readFileSync(
      'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
      'utf8'
    );
    expect(articlePage).toContain("'audio'");
    expect(articlePage).toContain("audio: ['src', 'controls', 'style']");
    const sanitizeArticleContent = readFileSync('src/lib/server/sanitizeArticleContent.js', 'utf8');
    expect(sanitizeArticleContent).toContain("'audio'");
    expect(sanitizeArticleContent).toContain("audio: ['src', 'controls', 'style']");
  });

  it('compresses 4K videos aggressively on client and server fallback', () => {
    expect(lexicalEditor).toContain('CLIENT_VIDEO_MAX_EDGE = 720');
    expect(lexicalEditor).toContain('CLIENT_VIDEO_BITRATE = 800_000');
    expect(lexicalEditor).toContain('CLIENT_AUDIO_BITRATE = 64_000');
    const fileUpload = readFileSync('src/lib/util/fileUpload.js', 'utf8');
    expect(fileUpload).toContain("scale='min(720,iw)':'min(720,ih)'");
    expect(fileUpload).toContain("'-b:v'");
    expect(fileUpload).toContain("'800k'");
    expect(fileUpload).toContain("'64k'");
  });

  it('logs WebCodecs capability before sending iOS Safari videos to server compression', () => {
    expect(lexicalEditor).toContain('getWebCodecsCapabilityDetails');
    expect(lexicalEditor).toContain('VideoEncoder');
    expect(lexicalEditor).toContain('VideoDecoder');
    expect(lexicalEditor).toContain('AudioEncoder');
    expect(lexicalEditor).toContain('video/mp4; codecs="avc1.42E01E"');
    expect(lexicalEditor).toContain("type: 'lexical-video-server-compression-selected'");
    expect(lexicalEditor).toContain("level: 'warn'");
    expect(lexicalEditor).toContain("reason: 'ios-safari-webcodecs-preflight'");
    expect(lexicalEditor).toContain('webCodecs: await getWebCodecsCapabilityDetails()');
  });

  it('allows normal client telemetry to be logged at info level', () => {
    const reportClientPageError = readFileSync('src/lib/util/reportClientPageError.js', 'utf8');
    expect(reportClientPageError).toContain("@property {'error' | 'warn' | 'info'} [level]");
    expect(reportClientPageError).toContain("level: context.level ?? 'error'");
    expect(apiLogRoute).toContain(
      "logData.level === 'error' || logData.level === 'warn' || logData.level === 'info'"
    );
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

  it('distinguishes server body-limit 413 from the app 100MB upload limit', () => {
    expect(lexicalEditor).toContain('createServerUploadLimitError');
    expect(lexicalEditor).toContain('ServerUploadLimitError');
    expect(lexicalEditor).toContain('서버 업로드 제한에 걸렸습니다');
    expect(lexicalEditor).toContain('responseText');
    expect(lexicalEditor).toContain('serverLimitExceeded');
  });

  it('sets adapter-node BODY_SIZE_LIMIT to the board upload limit in production', () => {
    expect(uploadLimits).toContain("BOARD_UPLOAD_BODY_SIZE_LIMIT = `${BOARD_UPLOAD_MAX_MB}M`");
    expect(dockerfile).toContain('ENV BODY_SIZE_LIMIT=100M');
    expect(dockerfile).toContain('BODY_SIZE_LIMIT=100M exec node .');
    expect(dockerCompose).toContain('BODY_SIZE_LIMIT: 100M');
  });

  it('installs ffmpeg in the production container for server-side video compression', () => {
    expect(dockerfile).toContain('apt-get install -y --no-install-recommends ffmpeg');
    expect(dockerfile).toContain('rm -rf /var/lib/apt/lists/*');
  });

  it('returns a 413 upload response when request.formData hits the body limit', () => {
    expect(uploadRoute).toContain('isBodySizeLimitError');
    expect(uploadRoute).toContain('throw error(413');
    expect(uploadRoute).toContain('Content-length of');
    expect(uploadRoute).toContain('request body size exceeded');
  });
});
