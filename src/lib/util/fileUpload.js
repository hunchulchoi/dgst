import * as fs from 'fs';
import mime from 'mime';
import { format } from 'date-fns';

import { UPLOAD_PATH } from '$env/static/private';
import { error } from '@sveltejs/kit';
import path from 'path';
import sharp from 'sharp';
import logger from './logger';

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

  const normalizedPath = path.normalize(path.join(UPLOAD_PATH, _path, _name));
  const isPathSafe = normalizedPath.startsWith(UPLOAD_PATH);

  console.debug('Path safety check:', { normalizedPath, UPLOAD_PATH, isPathSafe });

  return isPathSafe;
}

export async function write(file, email, preservePath = 'jjal') {
  try {
    console.debug('fileUpload.write called:', { fileName: file.name, preservePath, email });

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
    const fullPath = `${UPLOAD_PATH}${dir}/${fileName}`;

    console.debug('Writing file to:', fullPath);
    fs.writeFileSync(fullPath, fileBuffer);
    console.debug('File written successfully');

    // 이미지만 처리 (비디오는 제외)
    if (file.type.startsWith('image')) {

      logger.info({
        type: file.type,
        size: file.size,
        name: file.name,
        message: 'fileUpload.write file.type'
      });

      // GIF는 리사이즈/변환하지 않고 그대로 저장 (서버 별도 파이프라인 처리)
      // GIF가 아닌 큰 이미지(1MB 이상)만 WebP로 변환
      if (file.type === 'image/gif' || (file.size > 1024 * 1024)) {

        logger.info({
          type: file.type,
          size: file.size,
          name: file.name,
          message: 'GIF or large image - skipping WebP conversion'
        });

        try {
          const convertStart = Date.now();
          const webpPath = `${UPLOAD_PATH}${dir}/${fileName}.webp`;

          // Sharp를 사용한 안전한 WebP 변환
          await sharp(fullPath, { animated: true })
            .resize({ width: 1400, withoutEnlargement: true })
            .rotate()
            .webp({ quality: 80, effort: 6 })
            .toFile(webpPath);

          const convertElapsedMs = Date.now() - convertStart;
          const webpBytes = fs.statSync(webpPath).size;

          // 원본 파일 삭제 후 WebP로 교체
          fs.unlink(fullPath, (err) => err && console.error('Error deleting original:', err));
          fileName = `${fileName}.webp`;
          logger.info({
            fileName,
            message: 'Image converted to WebP',
            originalBytes: file.size,
            webpBytes,
            savedBytes: Math.max(0, file.size - webpBytes),
            savedPercent: Number(((1 - webpBytes / file.size) * 100).toFixed(1)),
            elapsedMs: convertElapsedMs
          });
        } catch (err) {
          logger.error({ err, message: 'Image to WebP conversion failed' });
          // 변환 실패 시 원본 파일 유지
        }
      }
    } else {
      console.debug('Video file - skipping WebP conversion');
    }

    const finalPath = `${UPLOAD_PATH}${dir}/${fileName}`;
    if (fs.existsSync(finalPath)) {
      console.debug('File uploaded successfully:', `/images${dir}/${fileName}`);
      return `/images${dir}/${fileName}`;
    } else {
      logger.error({ finalPath, message: 'File not found after save' });
      throw error(500, '파일 저장 중에 오류가 발생하였습니다. 쿠훕ㅠㅠ');
    }
  } catch (err) {
    console.error('File upload error:', err);
    throw err;
  }
}

export async function read(file, preservePath) {
  if (!safeString(file.name, preservePath)) {
    logger.error({ fileName: file.name, preservePath, message: 'read safeString failed' });
    throw error(400, { message: '잘못된 요청입니다.' });
  }
}
