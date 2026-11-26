import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const lexicalEditor = readFileSync('src/lib/components/LexicalEditor.svelte', 'utf8');

describe('Lexical upload transport', () => {
  it('sends an explicitly encoded multipart body for Safari uploads', () => {
    expect(lexicalEditor).toContain('encodeMultipartFormData(formData)');
    expect(lexicalEditor).toContain(
      "sendUploadRequest('/board/upload', multipart.body, multipart.contentType)"
    );
    expect(lexicalEditor).toContain("xhr.setRequestHeader('Content-Type', contentType)");
    expect(lexicalEditor).toContain('await postUploadFormData(formData)');
  });

  it('sends files over the Cloudflare body limit in chunks', () => {
    expect(lexicalEditor).toContain('upload.size > BOARD_UPLOAD_CHUNK_THRESHOLD_BYTES');
    expect(lexicalEditor).toContain('`/board/upload/chunk?${params}`');
    expect(lexicalEditor).toContain("'/board/upload/complete'");
  });

  it('downsizes large client images before upload while the server keeps final sizing canonical', () => {
    expect(lexicalEditor).toContain('maxSizeMB: 8');
    expect(lexicalEditor).toContain('maxWidthOrHeight: 2560');
    expect(lexicalEditor).not.toContain('alwaysKeepResolution: true');
    expect(lexicalEditor).toContain("fileType: 'image/jpeg'");
    expect(lexicalEditor).toContain('WebP encoding unsupported; retrying upload image as JPEG');
  });
});
