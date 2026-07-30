import { describe, expect, it } from 'vitest';
import { encodeMultipartFormData } from '../src/lib/util/multipartFormData.js';

describe('encodeMultipartFormData', () => {
  it('preserves binary data, fields, and the original filename', async () => {
    const formData = new FormData();
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    formData.append('upload', new File([bytes], '원본 사진.png', { type: 'image/png' }));
    formData.set('serverCompressVideo', 'true');

    const multipart = encodeMultipartFormData(formData, 'dgst-test-boundary');
    const request = new Request('http://localhost/board/upload', {
      method: 'POST',
      headers: { 'Content-Type': multipart.contentType },
      body: multipart.body
    });
    const parsed = await request.formData();
    const parsedFile = parsed.get('upload');

    expect(multipart.contentType).toBe(
      'multipart/form-data; boundary=dgst-test-boundary'
    );
    expect(parsedFile).toBeInstanceOf(File);
    expect(parsedFile.name).toBe('원본 사진.png');
    expect(parsedFile.type).toBe('image/png');
    expect(new Uint8Array(await parsedFile.arrayBuffer())).toEqual(bytes);
    expect(parsed.get('serverCompressVideo')).toBe('true');
  });
});
