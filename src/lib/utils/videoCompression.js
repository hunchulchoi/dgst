import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpeg;
let isFFmpegLoaded = false;

export async function getFFmpegInstance() {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
    await ffmpeg.load();
    isFFmpegLoaded = true;
  }
  return ffmpeg;
}

export async function compressVideo(file) {
  if (!isFFmpegLoaded) {
    ffmpeg = await getFFmpegInstance();
  }

  ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));
  await ffmpeg.run(
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
  const data = ffmpeg.FS('readFile', 'output.mp4');
  const compressedBlob = new Blob([data.buffer], { type: 'video/mp4' });
  return new File([compressedBlob], file.name, { type: 'video/mp4' });
}
