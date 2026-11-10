import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

const mocks = vi.hoisted(() => ({
  getUploadObject: vi.fn(),
  statUploadObject: vi.fn(),
  putUploadObject: vi.fn(),
  sharp: vi.fn(),
  sharpPipeline: {
    resize: vi.fn(),
    rotate: vi.fn(),
    toBuffer: vi.fn(),
    webp: vi.fn()
  }
}));

vi.mock('../src/lib/server/minioStorage.js', () => ({
  getUploadObject: mocks.getUploadObject,
  statUploadObject: mocks.statUploadObject,
  putUploadObject: mocks.putUploadObject
}));

vi.mock('sharp', () => ({ default: mocks.sharp }));

describe('/images MinIO download route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sharp.mockReturnValue(mocks.sharpPipeline);
    mocks.sharpPipeline.rotate.mockReturnValue(mocks.sharpPipeline);
    mocks.sharpPipeline.resize.mockReturnValue(mocks.sharpPipeline);
    mocks.sharpPipeline.webp.mockReturnValue(mocks.sharpPipeline);
    mocks.sharpPipeline.toBuffer.mockResolvedValue(Buffer.from('thumbnail'));
  });

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
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
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
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('content-disposition')).toContain(
      `filename*=UTF-8''${encodeURIComponent('사용 설명서.pdf')}`
    );
    expect(mocks.getUploadObject).not.toHaveBeenCalled();
  });

  it('generates a square WebP thumbnail and stores it in MinIO on miss', async () => {
    const object = {
      size: 10,
      etag: 'image-etag',
      contentType: 'image/jpeg',
      originalFileName: '프로필.jpg'
    };
    const notFound = Object.assign(new Error('NotFound'), { code: 'NotFound' });
    mocks.statUploadObject.mockImplementation(async (key) => {
      if (key === 'profiles/avatar.jpg.thumb80.webp') throw notFound;
      return object;
    });
    mocks.getUploadObject.mockResolvedValue({
      ...object,
      stream: Readable.from(Buffer.from('original'))
    });
    mocks.putUploadObject.mockResolvedValue({ etag: 'thumb-put' });
    const { GET } = await import('../src/routes/images/[...filepath]/+server.js');

    const response = await GET({
      params: { filepath: 'profiles/avatar.jpg' },
      request: new Request('https://dgst.example/images/profiles/avatar.jpg?thumbnail=80')
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(response.headers.get('etag')).toBe('"image-etag-thumb-80"');
    expect(mocks.sharp).toHaveBeenCalledWith(expect.any(Buffer), { animated: true });
    expect(mocks.sharpPipeline.resize).toHaveBeenCalledWith(80, 80, { fit: 'cover' });
    expect(mocks.putUploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'profiles/avatar.jpg.thumb80.webp',
        contentType: 'image/webp',
        body: expect.any(Buffer)
      })
    );
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('thumbnail');
  });

  it('serves a MinIO-cached thumbnail without regenerating', async () => {
    const original = {
      size: 10,
      etag: 'image-etag',
      contentType: 'image/jpeg',
      originalFileName: '프로필.jpg'
    };
    const cached = {
      size: 9,
      etag: 'cached-thumb-etag',
      contentType: 'image/webp',
      originalFileName: 'avatar.webp',
      sourceEtag: 'image-etag'
    };
    mocks.statUploadObject.mockImplementation(async (key) => {
      if (key === 'profiles/avatar.jpg.thumb80.webp') return cached;
      return original;
    });
    mocks.getUploadObject.mockResolvedValue({
      ...cached,
      stream: Readable.from(Buffer.from('cached-thumb'))
    });
    const { GET } = await import('../src/routes/images/[...filepath]/+server.js');

    const response = await GET({
      params: { filepath: 'profiles/avatar.jpg' },
      request: new Request('https://dgst.example/images/profiles/avatar.jpg?thumbnail=80')
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('cached-thumb');
    expect(mocks.sharp).not.toHaveBeenCalled();
    expect(mocks.putUploadObject).not.toHaveBeenCalled();
    expect(mocks.getUploadObject).toHaveBeenCalledWith(
      'profiles/avatar.jpg.thumb80.webp',
      undefined,
      cached
    );
  });
});
