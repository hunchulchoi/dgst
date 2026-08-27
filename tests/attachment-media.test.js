import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createWebpUploadFile,
  formatAttachmentFileSize,
  isPdfAttachment,
  isVideoAttachment,
  parseAttachmentFileName
} from '../src/lib/util/attachmentMedia.js';

const commentRoute = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/comment/+server.js',
  'utf8'
);
const attachmentComponent = readFileSync('src/lib/components/AttachmentMedia.svelte', 'utf8');

describe('attachment media detection', () => {
  it.each([
    '/images/jjal/example.mp4',
    '/images/jjal/example.MOV?cache=1',
    '/images/jjal/example.webm#preview'
  ])('recognizes a video URL: %s', (url) => {
    expect(isVideoAttachment(url)).toBe(true);
  });

  it('recognizes a video file by MIME type', () => {
    expect(isVideoAttachment({ name: 'upload.bin', type: 'video/mp4' })).toBe(true);
  });

  it('keeps images as images', () => {
    expect(isVideoAttachment('/images/jjal/example.webp')).toBe(false);
    expect(isVideoAttachment({ name: 'photo.jpg', type: 'image/jpeg' })).toBe(false);
  });

  it.each([
    '/images/jjal/manual.pdf',
    '/images/jjal/manual.PDF?download=1',
    { name: 'upload.bin', type: 'application/pdf' }
  ])('recognizes a PDF attachment: %s', (attachment) => {
    expect(isPdfAttachment(attachment)).toBe(true);
  });

  it('renders PDFs as download links instead of images', () => {
    expect(attachmentComponent).toContain('{:else if pdf || isPdfAttachment(src)}');
    expect(attachmentComponent).toContain('download');
    expect(attachmentComponent).toContain('PDF 다운로드');
    expect(attachmentComponent).toContain('{displayFileName}');
    expect(attachmentComponent).toContain('formatAttachmentFileSize(displayFileSize)');
  });

  it('reads the original UTF-8 filename from Content-Disposition', () => {
    expect(
      parseAttachmentFileName(
        `inline; filename="manual.pdf"; filename*=UTF-8''${encodeURIComponent('사용 설명서.pdf')}`
      )
    ).toBe('사용 설명서.pdf');
  });

  it.each([
    [512, '1KB'],
    [1536, '2KB'],
    [1024 * 1024, '1.0MB'],
    [12 * 1024 * 1024, '12MB']
  ])('formats attachment size %d as %s', (bytes, expected) => {
    expect(formatAttachmentFileSize(bytes)).toBe(expected);
  });

  it('asks the server upload pipeline to normalize comment videos', () => {
    expect(commentRoute.match(/compressVideo: isVideoAttachment\(image\)/g)).toHaveLength(2);
  });

  it('uses Android-friendly inline video controls in the shared component', () => {
    expect(attachmentComponent).toContain('playsinline');
    expect(attachmentComponent).toContain('preload="metadata"');
    expect(attachmentComponent).toContain('controls');
    expect(attachmentComponent).toContain('muted');
  });

  it('loads an early video frame so attachments show a thumbnail before playback', () => {
    expect(attachmentComponent).toContain('withVideoPreviewTime');
    expect(attachmentComponent).toContain('#t=0.1');
    expect(attachmentComponent).toContain('element.currentTime = previewTime');
  });

  it('sizes comment videos with the same viewport limit as tall attachments', () => {
    expect(attachmentComponent).toContain('tallAttachmentSize = false');
    expect(attachmentComponent).toContain('applyTallAttachmentSizing(element.style)');
    expect(attachmentComponent).toContain(
      'class:attachment-video--tall-attachment={tallAttachmentSize}'
    );
  });

  it('applies the same responsive sizing calculation to videos and images', () => {
    expect(attachmentComponent).toContain("from '$lib/util/attachmentImageSizing.js'");
    expect(attachmentComponent).toContain('applyAttachmentImageSizing(element.style');
    expect(attachmentComponent).toContain('onloadedmetadata={handleVideoMetadata}');
    expect(attachmentComponent).toContain('naturalWidth: element.videoWidth');
    expect(attachmentComponent).toContain('naturalHeight: element.videoHeight');
  });

  it('ignores stale image load callbacks after client-side navigation', () => {
    expect(attachmentComponent).toContain("if (typeof onimageload === 'function')");
    expect(attachmentComponent).toContain('onload={handleImageLoad}');
    expect(attachmentComponent).not.toContain('onload={onimageload}');
  });

  it('renames browser-compressed HEIC files to a matching WebP extension', () => {
    const compressed = new File(['webp'], 'camera.HEIC', { type: 'image/webp' });
    const upload = createWebpUploadFile(compressed, 'camera.HEIC');

    expect(upload.name).toBe('camera.webp');
    expect(upload.type).toBe('image/webp');
  });
});
