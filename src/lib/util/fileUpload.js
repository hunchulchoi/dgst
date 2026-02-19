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
    logger.info({ fileName: file.name, preservePath, email, filesize: file.size, type: file.type, message: 'fileUpload.write called' });

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

    console.debug('Writing file to:', fullPath);
    fs.writeFileSync(fullPath, fileBuffer);
    console.debug('File written successfully');

    // 이미지만 처리 (비디오는 제외)
    if (file.type.startsWith('image')) {

      logger.info({
        type: file.type,
        size: file.size,
        sizeMB: (file.size / (1024 * 1024)).toFixed(2),
        name: file.name,
        message: 'fileUpload.write - image file received'
      });

      // 프로필 움짤(GIF): 변환하지 않고 원본 유지
      const isProfileGif = preservePath === 'profiles' && (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif'));
      // 이미지는 1MB 이상일 때 리사이즈 (프로필 GIF 제외)
      const isCommentImage = false;
      const isWebP = file.type === 'image/webp' || file.name.endsWith('.webp');
      const shouldResize = !isProfileGif && (isCommentImage || file.size > 1024 * 1024);

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
          message: isWebP ? 'Large WebP image - reprocessing with Sharp' : 'Large image - processing WebP conversion'
        });

        try {
          const convertStart = Date.now();
          // 이미 .webp 확장자가 있으면 그대로 사용, 없으면 추가
          const finalFileName = fileName.endsWith('.webp') ? fileName : `${fileName}.webp`;

          // 입력 파일과 출력 파일이 같으면 임시 파일명 사용
          let webpPath = `${UPLOAD_PATH}${dir}/${finalFileName}`;
          const isSamePath = fullPath === webpPath;
          let tempWebpPath = null;

          logger.info({
            fullPath,
            finalFileName,
            webpPath,
            isSamePath,
            message: 'WebP conversion path setup'
          });

          if (isSamePath) {
            // 임시 파일명 사용 (원본 파일명 기반)
            const dotIdx = fileName.lastIndexOf('.');
            const baseName = dotIdx > -1 ? fileName.substring(0, dotIdx) : fileName;
            tempWebpPath = `${UPLOAD_PATH}${dir}/${baseName}.temp.webp`;
            webpPath = tempWebpPath;

            logger.info({
              tempWebpPath,
              webpPath,
              message: 'Using tempWebpPath for conversion'
            });
          }

          // 모든 이미지는 1400px로 리사이즈
          const maxWidth = 1400;

          // Sharp를 사용한 안전한 WebP 변환
          // 이미 WebP인 경우에도 리사이즈 및 재압축을 위해 다시 처리
          await sharp(fullPath, { animated: true })
            .resize({ width: maxWidth, withoutEnlargement: true })
            .rotate()
            .webp({ quality: 85, effort: 4 })
            .toFile(webpPath);

          const convertElapsedMs = Date.now() - convertStart;
          const webpBytes = fs.statSync(webpPath).size;

          // 원본 파일 삭제
          fs.unlink(fullPath, (err) => err && console.error('Error deleting original:', err));

          // 임시 파일을 최종 파일명으로 이동 또는 webpPath 확인
          if (tempWebpPath) {
            const finalWebpPath = `${UPLOAD_PATH}${dir}/${finalFileName}`;

            // 임시 파일 존재 확인
            if (!fs.existsSync(tempWebpPath)) {
              logger.error({ tempWebpPath, webpPath, message: 'tempWebpPath does not exist before rename' });
              throw new Error('Temp WebP file not found before rename');
            }

            logger.info({
              tempWebpPath,
              finalWebpPath,
              tempExists: fs.existsSync(tempWebpPath),
              finalExistsBeforeRename: fs.existsSync(finalWebpPath),
              message: 'Before renameSync'
            });

            fs.renameSync(tempWebpPath, finalWebpPath);

            // 파일 시스템 동기화를 위한 대기 (최대 3회 재시도)
            let retries = 3;
            let fileExists = false;
            while (retries > 0 && !fileExists) {
              fileExists = fs.existsSync(finalWebpPath);
              if (!fileExists) {
                // 10ms 대기 후 재시도
                await new Promise(resolve => setTimeout(resolve, 10));
                retries--;
              }
            }

            // 최종 파일 경로로 업데이트 (존재 확인용)
            fullPath = finalWebpPath;
            fileName = finalFileName;

            logger.info({
              tempWebpPath,
              finalWebpPath,
              fileName,
              exists: fileExists,
              retries: 3 - retries,
              message: 'tempWebpPath renamed to finalWebpPath'
            });

            if (!fileExists) {
              logger.error({ finalWebpPath, message: 'finalWebpPath does not exist after rename' });
              throw new Error('Final WebP file not found after rename');
            }
          } else {
            // tempWebpPath가 없으면 webpPath가 이미 최종 파일명
            // webpPath에서 실제 파일명 추출
            const actualWebpPath = webpPath;
            if (fs.existsSync(actualWebpPath)) {
              fileName = finalFileName;
              fullPath = actualWebpPath;

              logger.info({
                actualWebpPath,
                fileName,
                finalFileName,
                exists: true,
                message: 'No tempWebpPath - using webpPath directly'
              });
            } else {
              logger.error({
                actualWebpPath,
                finalFileName,
                exists: false,
                message: 'webpPath does not exist (no tempWebpPath used)'
              });
              throw new Error('WebP file not found after conversion');
            }
          }

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
          // 변환 실패 시 원본 파일 유지
        }
      }
    } else {
      console.debug('Video file - skipping WebP conversion');
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

export async function read(file, preservePath) {
  if (!safeString(file.name, preservePath)) {
    logger.error({ fileName: file.name, preservePath, message: 'read safeString failed' });
    throw error(400, { message: '잘못된 요청입니다.' });
  }
}
