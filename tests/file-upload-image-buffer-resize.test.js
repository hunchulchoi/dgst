import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      unlinkSync: vi.fn(),
      statSync: vi.fn(() => ({ size: finalBuffer.length })),
      unlink: vi.fn(),
      renameSync: vi.fn(),
      readdirSync: vi.fn(() => [])
    },
    execFile: vi.fn((command, args, options, callback) => callback(null))
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
