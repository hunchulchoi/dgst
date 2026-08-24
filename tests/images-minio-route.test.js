import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

const mocks = vi.hoisted(() => ({
  getUploadObject: vi.fn(),
  statUploadObject: vi.fn()
}));

vi.mock('../src/lib/server/minioStorage.js', () => ({
  getUploadObject: mocks.getUploadObject,
  statUploadObject: mocks.statUploadObject
}));

describe('/images MinIO download route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('streams a ranged video response with the preserved original filename', async () => {
    const object = {
      size: 100,
      etag: 'etag',
      lastModified: new Date('2026-07-30T01:02:03.000Z'),
      contentType: 'video/mp4',
      originalFileName: '원본 영상.mp4'
    };
    mocks.statUploadObject.mockResolvedValue(object);
    mocks.getUploadObject.mockResolvedValue({
      ...object,
      stream: Readable.from(Buffer.from('0123456789'))
    });
    const { GET } = await import('../src/routes/images/[...filepath]/+server.js');

    const response = await GET({
      params: { filepath: 'jjal/2026/7/30/video.mp4' },
      request: new Request('https://dgst.example/images/jjal/2026/7/30/video.mp4', {
        headers: { range: 'bytes=10-19' }
      })
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 10-19/100');
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.headers.get('content-disposition')).toContain(
      `filename*=UTF-8''${encodeURIComponent('원본 영상.mp4')}`
    );
    expect(mocks.getUploadObject).toHaveBeenCalledWith(
      'jjal/2026/7/30/video.mp4',
      {
        offset: 10,
        length: 10
      },
      object
    );
  });

  it('rejects traversal before contacting MinIO', async () => {
    const { GET } = await import('../src/routes/images/[...filepath]/+server.js');

    await expect(
      GET({
        params: { filepath: '../secret' },
        request: new Request('https://dgst.example/images/secret')
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.getUploadObject).not.toHaveBeenCalled();
    expect(mocks.statUploadObject).not.toHaveBeenCalled();
  });

  it('returns original PDF metadata without opening the object stream', async () => {
    mocks.statUploadObject.mockResolvedValue({
      size: 1_572_864,
      contentType: 'application/pdf',
      originalFileName: '사용 설명서.pdf'
    });
    const { HEAD } = await import('../src/routes/images/[...filepath]/+server.js');

    const response = await HEAD({ params: { filepath: 'jjal/manual.pdf' } });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('1572864');
    expect(response.headers.get('content-disposition')).toContain(
      `filename*=UTF-8''${encodeURIComponent('사용 설명서.pdf')}`
    );
    expect(mocks.getUploadObject).not.toHaveBeenCalled();
  });
});
