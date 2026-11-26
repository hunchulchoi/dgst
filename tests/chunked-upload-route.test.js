import { describe, expect, it, vi } from 'vitest';

const writeMock = vi.hoisted(() => vi.fn());
vi.mock('#lib/util/fileUpload.js', () => ({ write: writeMock }));

import { POST as postChunk } from '../src/routes/board/upload/chunk/+server.js';
import { POST as postComplete } from '../src/routes/board/upload/complete/+server.js';
import { BOARD_UPLOAD_CHUNK_BYTES } from '../src/lib/util/uploadLimits.js';

const user = { email: 'route-chunk@example.com', nickname: '청크' };
const locals = { auth: vi.fn().mockResolvedValue({ user }) };

/** @param {string} url @param {BodyInit} body @param {string} type */
function request(url, body, type) {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    body,
    headers: { 'content-type': type }
  });
}

describe('chunked upload routes', () => {
  it('joins chunks and hands one File with the form fields to the normal writer', async () => {
    const uploadId = `route-test-${Date.now()}-abcdef`;
    const totalSize = BOARD_UPLOAD_CHUNK_BYTES + 5;
    const parts = [new Uint8Array(BOARD_UPLOAD_CHUNK_BYTES).fill(7), new Uint8Array(5).fill(9)];

    for (const [index, part] of parts.entries()) {
      const params = new URLSearchParams({
        uploadId,
        index: String(index),
        totalChunks: '2',
        totalSize: String(totalSize),
        name: 'big.mp4',
        type: 'video/mp4'
      });
      const url = `/board/upload/chunk?${params}`;
      const response = await postChunk(
        /** @type {any} */ ({
          request: request(url, part, 'application/octet-stream'),
          locals,
          url: new URL(`http://localhost${url}`)
        })
      );
      expect(response.status).toBe(200);
    }

    writeMock.mockImplementationOnce(async (/** @type {File} */ file) => {
      const data = new Uint8Array(await file.arrayBuffer());
      expect(file.name).toBe('big.mp4');
      expect(file.size).toBe(totalSize);
      expect(data[0]).toBe(7);
      expect(data[totalSize - 1]).toBe(9);
      return { url: '/images/jjal/big.mp4' };
    });

    const response = await postComplete(
      /** @type {any} */ ({
        request: request(
          '/board/upload/complete',
          JSON.stringify({ uploadId, fields: { serverCompressVideo: 'true' } }),
          'application/json'
        ),
        locals
      })
    );
    expect(await response.json()).toEqual({ url: '/images/jjal/big.mp4' });
    expect(writeMock).toHaveBeenCalledWith(
      expect.any(File),
      user.email,
      'jjal',
      expect.objectContaining({ compressVideo: true })
    );

    // The upload is removed after completion, so it cannot be completed twice.
    await expect(
      postComplete(
        /** @type {any} */ ({
          request: request(
            '/board/upload/complete',
            JSON.stringify({ uploadId, fields: {} }),
            'application/json'
          ),
          locals
        })
      )
    ).rejects.toMatchObject({ status: 404 });
  });

  it('requires sign-in', async () => {
    const url = '/board/upload/chunk?uploadId=x';
    await expect(
      postChunk(
        /** @type {any} */ ({
          request: request(url, new Uint8Array(1), 'application/octet-stream'),
          locals: { auth: vi.fn().mockResolvedValue(null) },
          url: new URL(`http://localhost${url}`)
        })
      )
    ).rejects.toMatchObject({ status: 401 });
  });
});
