import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

/** @type {FFmpeg | null} */
let ffmpeg;
let isFFmpegLoaded = false;

/** @returns {any} */
function getLegacyFfmpeg() {
  return /** @type {any} */ (ffmpeg);
}

/** @returns {Promise<FFmpeg>} */
export async function getFFmpegInstance() {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
    await ffmpeg.load();
    isFFmpegLoaded = true;
  }
  return ffmpeg;
}

/**
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function compressVideo(file) {
  if (!isFFmpegLoaded) {
    ffmpeg = await getFFmpegInstance();
  }

  const legacy = getLegacyFfmpeg();
  legacy.FS('writeFile', 'input.mp4', await fetchFile(file));
  await legacy.run(
    '-i',
    'input.mp4',
    '-c:v',
    'libx264',
    '-crf',
    '28',
    '-preset',
    'medium',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    'output.mp4'
  );
  const data = legacy.FS('readFile', 'output.mp4');
  const compressedBlob = new Blob([data.buffer], { type: 'video/mp4' });
  return new File([compressedBlob], file.name, { type: 'video/mp4' });
}
