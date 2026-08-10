import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

const mocks = vi.hoisted(() => {
  const uploadRoot = '/tmp/dgst-upload-test';
  const finalBuffer = Buffer.from('converted-webp');
  const sharpPipeline = {
    resize: vi.fn(() => sharpPipeline),
    rotate: vi.fn(() => sharpPipeline),
    webp: vi.fn(() => sharpPipeline),
    toBuffer: vi.fn(async () => finalBuffer),
    toFile: vi.fn(async () => undefined)
  };

  return {
    uploadRoot,
    finalBuffer,
    sharpPipeline,
    sharp: vi.fn(() => sharpPipeline),
    fs: {
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn(() => finalBuffer),
      unlinkSync: vi.fn(),
      rmSync: vi.fn(),
      statSync: vi.fn(() => ({ size: finalBuffer.length })),
      unlink: vi.fn(),
      renameSync: vi.fn(),
      readdirSync: vi.fn(() => [])
    },
    execFile: vi.fn((command, args, options, callback) => callback(null)),
    putUploadObject: vi.fn(async () => ({ etag: 'etag' }))
  };
});

vi.mock('$env/static/private', () => ({
  UPLOAD_PATH: mocks.uploadRoot
}));

vi.mock('fs', () => mocks.fs);

vi.mock('child_process', () => ({
  execFile: mocks.execFile
}));

vi.mock('sharp', () => ({
  default: mocks.sharp
}));

vi.mock('../src/lib/server/minioStorage.js', () => ({
  putUploadObject: mocks.putUploadObject
}));

vi.mock('../src/lib/util/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('fileUpload image resizing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fs.existsSync.mockReturnValue(true);
    mocks.fs.readdirSync.mockReturnValue([]);
    mocks.fs.statSync.mockReturnValue({ size: mocks.finalBuffer.length });
    mocks.sharp.mockReturnValue(mocks.sharpPipeline);
  });

  it('returns a PDF cover URL and verified page count', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T00:00:00.000Z'));
    const source = await PDFDocument.create();
    source.addPage([300, 400]);
    source.addPage([300, 400]);
    const file = new File([await source.save()], 'manual.pdf', { type: 'application/pdf' });
    const { write } = await import('../src/lib/util/fileUpload.js');

    const result = await write(file, 'person@example.com', 'jjal', { returnMetadata: true });

    expect(result).toEqual({
      url: '/images/jjal/2026/7/29/persone_manual_1785283200000.pdf',
      previewUrl: '/images/jjal/2026/7/29/persone_manual_1785283200000.pdf.cover.webp',
      pageCount: 2
    });
    expect(mocks.execFile).toHaveBeenCalledWith(
      'pdftoppm',
      expect.arrayContaining(['-f', '1', '-singlefile', '-png']),
      expect.objectContaining({ timeout: 30000 }),
      expect.any(Function)
    );
    expect(mocks.sharpPipeline.toFile).toHaveBeenCalledWith(
      '/tmp/dgst-upload-test/jjal/2026/7/29/persone_manual_1785283200000.pdf.cover.webp'
    );
    expect(mocks.putUploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'jjal/2026/7/29/persone_manual_1785283200000.pdf',
        originalFileName: 'manual.pdf',
        uploader: 'person@example.com',
        uploadedAt: new Date('2026-07-29T00:00:00.000Z')
      })
    );
    vi.useRealTimers();
  });

  it('converts large gif uploads on the server for clients that cannot compress them', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T00:00:00.000Z'));

    const { write } = await import('../src/lib/util/fileUpload.js');
    const sourceBytes = Buffer.alloc(1024 * 1024 + 1, 7);
    const image = new File([sourceBytes], 'motion.gif', { type: 'image/gif' });

    const url = await write(image, 'person@example.com', 'jjal');

    expect(url).toBe('/images/jjal/2026/6/16/persone_motion_1781568000000.gif.webp');
    expect(mocks.sharp).toHaveBeenCalledWith(expect.any(Buffer), { animated: true });
    expect(mocks.sharpPipeline.toBuffer).toHaveBeenCalled();
    expect(mocks.sharpPipeline.toFile).not.toHaveBeenCalled();
    expect(mocks.fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/dgst-upload-test/jjal/2026/6/16/persone_motion_1781568000000.gif.webp',
      mocks.finalBuffer
    );

    vi.useRealTimers();
  });

  it('resizes large images from the upload buffer and writes only the final webp file', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T00:00:00.000Z'));

    const { write } = await import('../src/lib/util/fileUpload.js');
    const sourceBytes = Buffer.alloc(1024 * 1024 + 1, 7);
    const image = new File([sourceBytes], 'sample.jpg', { type: 'image/jpeg' });

    const url = await write(image, 'person@example.com', 'jjal');

    expect(url).toBe('/images/jjal/2026/6/16/persone_sample_1781568000000.jpg.webp');
    expect(mocks.sharp).toHaveBeenCalledWith(expect.any(Buffer), { animated: true });
    expect(mocks.sharpPipeline.toBuffer).toHaveBeenCalled();
    expect(mocks.sharpPipeline.toFile).not.toHaveBeenCalled();
    expect(mocks.fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(mocks.fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/dgst-upload-test/jjal/2026/6/16/persone_sample_1781568000000.jpg.webp',
      mocks.finalBuffer
    );
    const writePaths = mocks.fs.writeFileSync.mock.calls.map(([filePath]) => filePath);
    expect(writePaths).not.toContain(
      '/tmp/dgst-upload-test/jjal/2026/6/16/persone_sample_1781568000000.jpg'
    );
    expect(mocks.fs.unlink).not.toHaveBeenCalled();
    expect(mocks.fs.renameSync).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('normalizes small WebP uploads with the server width-only resize', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T00:00:00.000Z'));

    const { write } = await import('../src/lib/util/fileUpload.js');
    const image = new File([Buffer.alloc(128 * 1024, 7)], 'tall.webp', {
      type: 'image/webp'
    });

    const url = await write(image, 'person@example.com', 'jjal');

    expect(url).toBe('/images/jjal/2026/8/10/persone_tall_1786320000000.webp');
    expect(mocks.sharp).toHaveBeenCalledWith(expect.any(Buffer), { animated: true });
    expect(mocks.sharpPipeline.resize).toHaveBeenCalledWith({
      width: 1400,
      withoutEnlargement: true
    });
    expect(mocks.fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/dgst-upload-test/jjal/2026/8/10/persone_tall_1786320000000.webp',
      mocks.finalBuffer
    );

    vi.useRealTimers();
  });

  it('trusts an explicit WebP MIME over a stale HEIC filename', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T00:00:00.000Z'));

    const { write } = await import('../src/lib/util/fileUpload.js');
    const browserCompressed = new File(
      [Buffer.alloc(1024 * 1024 + 1, 7)],
      'browser-compressed.HEIC',
      { type: 'image/webp' }
    );

    const url = await write(browserCompressed, 'person@example.com', 'jjal');

    expect(url).toBe('/images/jjal/2026/7/22/persone_browser_co_1784678400000.HEIC.webp');
    expect(mocks.execFile).not.toHaveBeenCalledWith(
      'heif-convert',
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(mocks.sharp).toHaveBeenCalledWith(expect.any(Buffer), { animated: true });

    vi.useRealTimers();
  });

  it('decodes HEIC with libheif before converting it to WebP', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T00:00:00.000Z'));

    const { write } = await import('../src/lib/util/fileUpload.js');
    const sourceBytes = Buffer.alloc(512 * 1024, 7);
    const image = new File([sourceBytes], 'sample.HEIC', { type: 'image/heic' });

    const url = await write(image, 'person@example.com', 'jjal');

    expect(url).toBe('/images/jjal/2026/7/22/persone_sample_1784678400000.HEIC.webp');
    expect(mocks.execFile).toHaveBeenCalledWith(
      'heif-convert',
      [expect.stringMatching(/\.heic-[\w-]+\.HEIC$/), expect.stringMatching(/\.heic-[\w-]+\.jpg$/)],
      expect.objectContaining({ timeout: 120000 }),
      expect.any(Function)
    );
    expect(mocks.sharp).toHaveBeenCalledWith(expect.stringMatching(/\.heic-[\w-]+\.jpg$/), {
      animated: true
    });
    expect(mocks.fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/dgst-upload-test/jjal/2026/7/22/persone_sample_1784678400000.HEIC.webp',
      mocks.finalBuffer
    );
    expect(mocks.fs.unlinkSync).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('rejects HEIC instead of preserving an incompatible original when decoding fails', async () => {
    mocks.execFile.mockImplementationOnce((command, args, options, callback) => {
      callback(new Error('Support for this compression format has not been built in'));
    });

    const { write } = await import('../src/lib/util/fileUpload.js');
    const image = new File([Buffer.alloc(512 * 1024, 7)], 'sample.heic', { type: 'image/heic' });

    await expect(write(image, 'person@example.com', 'jjal')).rejects.toMatchObject({
      status: 415,
      body: expect.objectContaining({ message: expect.stringContaining('JPEG 또는 PNG') })
    });
    expect(mocks.fs.writeFileSync).not.toHaveBeenCalledWith(
      expect.stringMatching(/persone_sample_\d+\.heic$/),
      expect.any(Buffer)
    );
  });

  it('compresses videos on the server when client compression failed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T00:00:00.000Z'));

    const { write } = await import('../src/lib/util/fileUpload.js');
    const sourceBytes = Buffer.alloc(1024 * 1024 + 1, 7);
    const video = new File([sourceBytes], 'clip.mov', { type: 'video/quicktime' });

    const url = await write(video, 'person@example.com', 'jjal', { compressVideo: true });

    expect(url).toBe('/images/jjal/2026/6/16/persone_clip_1781568000000.mp4');
    expect(mocks.execFile).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-i', expect.stringContaining('.input')]),
      expect.objectContaining({ timeout: 120000 }),
      expect.any(Function)
    );
    expect(mocks.fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/dgst-upload-test/jjal/2026/6/16/persone_clip_1781568000000.mov.input',
      expect.any(Buffer)
    );
    expect(mocks.fs.writeFileSync).not.toHaveBeenCalledWith(
      '/tmp/dgst-upload-test/jjal/2026/6/16/persone_clip_1781568000000.mov',
      expect.any(Buffer)
    );

    vi.useRealTimers();
  });
});
