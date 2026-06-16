import * as fs from 'fs';
import mime from 'mime';
import { format } from 'date-fns';

import { UPLOAD_PATH } from '$env/static/private';
import { isPathUnderRoot } from '$lib/server/pathSafety.js';
import { error } from '@sveltejs/kit';
import path from 'path';
import sharp from 'sharp';
import logger from './logger';
import { execFile } from 'child_process';

/**
 * @param {string} _name
 * @param {string} _path
 */
function safeString(_name, _path) {
  _name = decodeURIComponent(_name);

  const mimeType = mime.getType(_name);
  // 이미지와 비디오 모두 허용
  const isValid = mimeType && (mimeType.startsWith('image') || mimeType.startsWith('video'));

  if (!isValid) {
    console.debug('Invalid file type:', mimeType, 'for file:', _name);
    return false;
  }

  _path = decodeURIComponent(_path);

  const candidatePath = path.join(UPLOAD_PATH, _path, _name);
  const isPathSafe = isPathUnderRoot(candidatePath, UPLOAD_PATH);

  console.debug('Path safety check:', { candidatePath, UPLOAD_PATH, isPathSafe });

  return isPathSafe;
}

/**
 * @param {string[]} args
 * @returns {Promise<void>}
 */
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: 120000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * @param {File} file
 * @param {string | undefined | null} email
 * @param {string} [preservePath='jjal']
 * @param {{ compressVideo?: boolean, removeVideoAudio?: boolean, serverCompressVideoContext?: unknown }} [options]
 */
export async function write(file, email, preservePath = 'jjal', options = {}) {
  try {
    logger.info({
      fileName: file.name,
      preservePath,
      email,
      filesize: file.size,
      type: file.type,
      message: 'fileUpload.write called'
    });

    const now = new Date();

    if (!safeString(file.name, preservePath)) {
      throw error(400, { message: '잘못된 요청입니다.' });
    }

    // date-fns v4: format 사용
    const year = format(now, 'yyyy');
    const month = format(now, 'M');
    const date = format(now, 'd');

    const dir = `/${preservePath}/${year}/${month}/${date}`;

    if (!fs.existsSync(`${UPLOAD_PATH}${dir}`)) {
      fs.mkdirSync(`${UPLOAD_PATH}${dir}`, { recursive: true });
    }

    console.debug('Upload directory:', `${UPLOAD_PATH}${dir}`);

    // 파일명 생성 (특수문자 안전 처리)
    const emailPrefix = email?.substring(0, 8).replace(/[^a-zA-Z0-9]/g, '') || 'anonymous';
    const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
    const safeName = baseName.substring(0, 10).replace(/[^a-zA-Z0-9가-힣]/g, '_');
    const ext = file.name.substring(file.name.lastIndexOf('.'));

    let fileName = `${emailPrefix}_${safeName}_${now.getTime()}${ext}`;

    console.debug('Generated fileName:', fileName);

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    let fullPath = `${UPLOAD_PATH}${dir}/${fileName}`;
    let fileWritten = false;

    const writeOriginalFile = () => {
      console.debug('Writing file to:', fullPath);
      fs.writeFileSync(fullPath, fileBuffer);
      fileWritten = true;
      console.debug('File written successfully');
    };

    // 이미지만 처리 (비디오는 제외)
    if (file.type.startsWith('image')) {
      logger.info({
        type: file.type,
        size: file.size,
        sizeMB: (file.size / (1024 * 1024)).toFixed(2),
        name: file.name,
        message: 'fileUpload.write - image file received'
      });

      const isCommentImage = false;
      const isWebP = file.type === 'image/webp' || file.name.endsWith('.webp');
      const shouldResize = isCommentImage || file.size > 1024 * 1024;

      logger.info({
        type: file.type,
        size: file.size,
        sizeMB: (file.size / (1024 * 1024)).toFixed(2),
        preservePath,
        isCommentImage,
        isWebP,
        shouldResize,
        message: 'fileUpload.write - resize check'
      });

      if (shouldResize) {
        logger.info({
          type: file.type,
          size: file.size,
          name: file.name,
          isWebP,
          message: isWebP
            ? 'Large WebP image - reprocessing with Sharp'
            : 'Large image - processing WebP conversion'
        });

        try {
          const convertStart = Date.now();
          // 이미 .webp 확장자가 있으면 그대로 사용, 없으면 추가
          const finalFileName = fileName.endsWith('.webp') ? fileName : `${fileName}.webp`;
          const webpPath = `${UPLOAD_PATH}${dir}/${finalFileName}`;

          logger.info({
            fullPath,
            finalFileName,
            webpPath,
            message: 'WebP conversion path setup'
          });

          // 모든 이미지는 1400px로 리사이즈
          const maxWidth = 1400;

          // Sharp를 사용한 안전한 WebP 변환
          // 이미 WebP인 경우에도 리사이즈 및 재압축을 위해 다시 처리
          const webpBuffer = await sharp(fileBuffer, { animated: true })
            .resize({ width: maxWidth, withoutEnlargement: true })
            .rotate()
            .webp({ quality: 85, effort: 4 })
            .toBuffer();

          fs.writeFileSync(webpPath, webpBuffer);
          fileWritten = true;
          fullPath = webpPath;
          fileName = finalFileName;

          const convertElapsedMs = Date.now() - convertStart;
          const webpBytes = webpBuffer.length;

          logger.info({
            fileName,
            message: isWebP ? 'WebP image reprocessed with Sharp' : 'Image converted to WebP',
            originalBytes: file.size,
            webpBytes,
            savedBytes: Math.max(0, file.size - webpBytes),
            savedPercent: Number(((1 - webpBytes / file.size) * 100).toFixed(1)),
            elapsedMs: convertElapsedMs
          });
        } catch (err) {
          logger.error({ message: 'Image to WebP conversion failed', error: err });
          // 변환 실패 시 기존 동작처럼 원본 파일 유지
          if (!fileWritten) writeOriginalFile();
        }
      }
    } else if (file.type.startsWith('video') && options.compressVideo) {
      const inputPath = `${fullPath}.input`;
      const compressedFileName = `${fileName.substring(0, fileName.lastIndexOf('.'))}.mp4`;
      const compressedPath = `${UPLOAD_PATH}${dir}/${compressedFileName}`;
      const serverCompressVideoContext = options.serverCompressVideoContext;
      const removeVideoAudio = options.removeVideoAudio === true;

      try {
        logger.warn({
          fileName,
          originalBytes: file.size,
          removeVideoAudio,
          serverCompressVideoContext,
          message: 'Server video compression requested'
        });

        fs.writeFileSync(inputPath, fileBuffer);
        const audioArgs = removeVideoAudio ? ['-an'] : ['-c:a', 'aac', '-b:a', '64k'];
        await runFfmpeg([
          '-y',
          '-i',
          inputPath,
          '-vf',
          "scale='min(720,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2",
          '-c:v',
          'libx264',
          '-b:v',
          '800k',
          '-maxrate',
          '1000k',
          '-bufsize',
          '1600k',
          '-crf',
          '30',
          '-preset',
          'veryfast',
          ...audioArgs,
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          compressedPath
        ]);

        if (!fs.existsSync(compressedPath)) {
          throw new Error('Compressed video was not created');
        }

        fullPath = compressedPath;
        fileName = compressedFileName;
        fileWritten = true;

        logger.warn({
          fileName,
          originalBytes: file.size,
          removeVideoAudio,
          serverCompressVideoContext,
          message: 'Video compressed with server ffmpeg fallback'
        });
      } catch (err) {
        logger.error({
          message: 'Server video compression failed; saving original',
          error: err,
          fileName,
          originalBytes: file.size,
          serverCompressVideoContext
        });
        if (!fileWritten) writeOriginalFile();
      } finally {
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        } catch (cleanupErr) {
          logger.warn({ message: 'Failed to remove temporary video input', error: cleanupErr });
        }
      }
    } else {
      writeOriginalFile();
      console.debug('Video file - skipping WebP conversion');
    }

    if (file.type.startsWith('image') && !fileWritten) {
      writeOriginalFile();
    }

    // fullPath가 업데이트되었으면 그것을 사용, 아니면 새로 계산
    const finalPath = fullPath || `${UPLOAD_PATH}${dir}/${fileName}`;

    logger.info({
      finalPath,
      fullPath,
      fileName,
      dir,
      exists: fs.existsSync(finalPath),
      message: 'Checking file existence after save'
    });

    if (fs.existsSync(finalPath)) {
      console.debug('File uploaded successfully:', `/images${dir}/${fileName}`);
      return `/images${dir}/${fileName}`;
    } else {
      // 파일이 없으면 디렉토리 내용 확인
      try {
        const dirContents = fs.readdirSync(`${UPLOAD_PATH}${dir}`);
        logger.error({
          finalPath,
          dirContents,
          message: 'File not found after save - directory contents listed'
        });
      } catch (dirErr) {
        logger.error({
          message: 'File not found after save - could not read directory',
          finalPath,
          error: dirErr
        });
      }
      throw error(500, '파일 저장 중에 오류가 발생하였습니다. 쿠훕ㅠㅠ');
    }
  } catch (err) {
    console.error('File upload error:', err);
    logger.error({ message: '파일 저장 실패', fileName: file.name, preservePath, error: err });
    throw err;
  }
}

/**
 * @param {File} file
 * @param {string} preservePath
 */
export async function read(file, preservePath) {
  if (!safeString(file.name, preservePath)) {
    logger.error({ fileName: file.name, preservePath, message: 'read safeString failed' });
    throw error(400, { message: '잘못된 요청입니다.' });
  }
}
