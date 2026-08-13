// @ts-nocheck -- Constructor mocks intentionally implement only the exercised MinIO surface.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  putObject: vi.fn(),
  statObject: vi.fn(),
  getObject: vi.fn(),
  getPartialObject: vi.fn(),
  Client: vi.fn()
}));

vi.mock('$env/static/private', () => ({
  MINIO_ENDPOINT: 'https://minio.example.com:9443',
  MINIO_ACCESS_KEY: 'access',
  MINIO_SECRET_KEY: 'secret',
  MINIO_BUCKET: 'local/dgst',
  MINIO_REGION: 'ap-northeast-2'
}));

vi.mock('minio', () => ({
  Client: mocks.Client
}));

describe('MinIO storage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // @ts-expect-error Vitest accepts class implementations for constructor mocks.
    mocks.Client.mockImplementation(
      class {
        putObject = mocks.putObject;
        statObject = mocks.statObject;
        getObject = mocks.getObject;
        getPartialObject = mocks.getPartialObject;
      }
    );
  });

  it('parses endpoint configuration and preserves upload audit metadata', async () => {
    mocks.putObject.mockResolvedValue({ etag: 'etag' });
    const { putUploadObject } = await import('../src/lib/server/minioStorage.js');

    await putUploadObject({
      key: 'jjal/2026/7/30/stored.webp',
      body: Buffer.from('image'),
      contentType: 'image/webp',
      originalFileName: '한글 원본.jpg',
      uploader: 'person@example.com',
      uploadedAt: new Date('2026-07-30T01:02:03.000Z')
    });

    expect(mocks.Client).toHaveBeenCalledWith({
      endPoint: 'minio.example.com',
      port: 9443,
      useSSL: true,
      accessKey: 'access',
      secretKey: 'secret',
      region: 'ap-northeast-2'
    });
    expect(mocks.putObject).toHaveBeenCalledWith(
      'local',
      'dgst/jjal/2026/7/30/stored.webp',
      expect.any(Buffer),
      5,
      expect.objectContaining({
        'Content-Type': 'image/webp',
        'X-Amz-Meta-Original-Filename': encodeURIComponent('한글 원본.jpg'),
        'X-Amz-Meta-Uploader': encodeURIComponent('person@example.com'),
        'X-Amz-Meta-Uploaded-At': '2026-07-30T01:02:03.000Z'
      })
    );
  });

  it('returns decoded metadata and a partial stream for range downloads', async () => {
    const stream = { stream: true };
    mocks.statObject.mockResolvedValue({
      size: 100,
      etag: 'etag',
      lastModified: new Date('2026-07-30T01:02:03.000Z'),
      metaData: {
        'content-type': 'video/mp4',
        'original-filename': encodeURIComponent('원본 영상.mp4'),
        uploader: encodeURIComponent('person@example.com'),
        'uploaded-at': '2026-07-30T01:02:03.000Z'
      }
    });
    mocks.getPartialObject.mockResolvedValue(stream);
    const { getUploadObject } = await import('../src/lib/server/minioStorage.js');

    const result = await getUploadObject('jjal/video.mp4', { offset: 10, length: 20 });

    expect(mocks.getPartialObject).toHaveBeenCalledWith('local', 'dgst/jjal/video.mp4', 10, 20);
    expect(result).toMatchObject({
      stream,
      size: 100,
      contentType: 'video/mp4',
      originalFileName: '원본 영상.mp4',
      uploader: 'person@example.com',
      uploadedAt: '2026-07-30T01:02:03.000Z'
    });
  });
});
