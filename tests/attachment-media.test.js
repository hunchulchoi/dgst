import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createWebpUploadFile, isVideoAttachment } from '../src/lib/util/attachmentMedia.js';

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

  it('renames browser-compressed HEIC files to a matching WebP extension', () => {
    const compressed = new File(['webp'], 'camera.HEIC', { type: 'image/webp' });
    const upload = createWebpUploadFile(compressed, 'camera.HEIC');

    expect(upload.name).toBe('camera.webp');
    expect(upload.type).toBe('image/webp');
  });
});
