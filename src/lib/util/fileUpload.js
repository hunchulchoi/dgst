import * as fs from 'fs';
import mime from 'mime';
import { format } from 'date-fns';
import { tmpdir } from 'os';

import { sanitizePdf } from '$lib/server/pdfSanitizer.js';
import { isPathUnderRoot } from '$lib/server/pathSafety.js';
import { error } from '@sveltejs/kit';
import path from 'path';
import sharp from 'sharp';
import logger from './logger';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { putUploadObject } from '$lib/server/minioStorage.js';

const OBJECT_KEY_SAFETY_ROOT = '/minio-uploads';

/**
 * @param {string} _name
 * @param {string} _path
 */
function safeString(_name, _path) {
  _name = decodeURIComponent(_name);

  const mimeType = mime.getType(_name);
  // 이미지, 비디오, 오디오, PDF만 허용
  const isValid =
    mimeType &&
    (mimeType.startsWith('image') ||
      mimeType.startsWith('video') ||
      mimeType.startsWith('audio') ||
      mimeType === 'application/pdf');

  if (!isValid) {
    console.debug('Invalid file type:', mimeType, 'for file:', _name);
    return false;
  }

  _path = decodeURIComponent(_path);

  const candidatePath = path.resolve(OBJECT_KEY_SAFETY_ROOT, _path, _name);
  const isPathSafe = isPathUnderRoot(candidatePath, OBJECT_KEY_SAFETY_ROOT);

  console.debug('Object key safety check:', { candidatePath, isPathSafe });

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
 * Render only the first page of an already sanitized PDF.
 * @param {string} inputPath
 * @param {string} outputPrefix
 * @returns {Promise<void>}
 */
function runPdfCoverRender(inputPath, outputPrefix) {
  return new Promise((resolve, reject) => {
    execFile(
      'pdftoppm',
      [
        '-f',
        '1',
        '-l',
        '1',
        '-singlefile',
        '-scale-to-x',
        '640',
        '-scale-to-y',
        '-1',
        '-png',
        inputPath,
        outputPrefix
      ],
      { timeout: 30000 },
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Decode a HEIC/HEIF image with the system libheif installation.
 * @param {string} inputPath
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
function runHeifConvert(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    execFile('heif-convert', [inputPath, outputPath], { timeout: 120000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** @param {File} file */
function isHeicImage(file) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type === 'image/heic' || type === 'image/heif') return true;
  if (type.startsWith('image/')) return false;
  return name.endsWith('.heic') || name.endsWith('.heif');
}

/**
 * @param {File} file
 * @param {string | undefined | null} email
 * @param {string} [preservePath='jjal']
 * @param {{ compressVideo?: boolean, removeVideoAudio?: boolean, extractVideoAudio?: boolean, serverCompressVideoContext?: unknown, returnMetadata?: boolean, thumbnail?: { width: number, height: number } }} [options]
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

    // 파일명 생성 (특수문자 안전 처리)
    const emailPrefix = email?.substring(0, 8).replace(/[^a-zA-Z0-9]/g, '') || 'anonymous';
    const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
    const safeName = baseName.substring(0, 10).replace(/[^a-zA-Z0-9가-힣]/g, '_');
    const ext = file.name.substring(file.name.lastIndexOf('.'));

    let fileName = `${emailPrefix}_${safeName}_${now.getTime()}${ext}`;

    console.debug('Generated fileName:', fileName);

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const isPdf = mime.getType(file.name) === 'application/pdf';
    const stagingBase = path.join(tmpdir(), `.dgst-upload-${randomUUID()}`);
    let fullPath = `${stagingBase}${ext}`;
    let fileWritten = false;
    /** @type {string | null} */
    let previewPath = null;
    /** @type {string | null} */
    let thumbnailPath = null;
    /** @type {{ pageCount?: number, previewUrl?: string, thumbnailUrl?: string } | null} */
    let uploadMetadata = null;

    const writeOriginalFile = () => {
      console.debug('Writing file to:', fullPath);
      fs.writeFileSync(fullPath, fileBuffer);
      fileWritten = true;
      console.debug('File written successfully');
    };

    if (isPdf) {
      const sanitizedPdf = await sanitizePdf(fileBuffer);
      fs.writeFileSync(fullPath, sanitizedPdf.buffer, { flag: 'wx' });
      fileWritten = true;
      uploadMetadata = { pageCount: sanitizedPdf.pageCount };

      const coverToken = randomUUID();
      const coverPrefix = `${stagingBase}.pdf-cover-${coverToken}`;
      const renderedCoverPath = `${coverPrefix}.png`;
      previewPath = `${fullPath}.cover.webp`;
      try {
        await runPdfCoverRender(fullPath, coverPrefix);
        await sharp(renderedCoverPath)
          .resize({ width: 480, withoutEnlargement: true })
          .webp({ quality: 82, effort: 4 })
          .toFile(previewPath);
        uploadMetadata.previewUrl = `/images${dir}/${fileName}.cover.webp`;
      } catch (previewError) {
        try {
          if (fs.existsSync(previewPath)) fs.unlinkSync(previewPath);
        } catch {
          // The upload remains valid even when a partial optional preview cannot be removed.
        }
        logger.warn({
          fileName,
          error: previewError,
          message: 'PDF cover preview generation failed'
        });
      } finally {
        try {
          if (fs.existsSync(renderedCoverPath)) fs.unlinkSync(renderedCoverPath);
        } catch (cleanupError) {
          logger.warn({
            fileName,
            error: cleanupError,
            message: 'Failed to remove temporary PDF cover'
          });
        }
      }

      logger.info({
        fileName,
        originalBytes: fileBuffer.length,
        sanitizedBytes: sanitizedPdf.buffer.length,
        pageCount: sanitizedPdf.pageCount,
        previewUrl: uploadMetadata.previewUrl,
        message: 'PDF sanitized and saved'
      });
    }

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
      const isWebP = file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp');
      const isHeic = isHeicImage(file);
      // Normalize every claimed WebP. Some Safari versions return PNG bytes when canvas WebP
      // encoding is requested, and the client intentionally leaves dimensions unchanged.
      const shouldResize = isCommentImage || isHeic || isWebP || file.size > 1024 * 1024;

      logger.info({
        type: file.type,
        size: file.size,
        sizeMB: (file.size / (1024 * 1024)).toFixed(2),
        preservePath,
        isCommentImage,
        isHeic,
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

        /** @type {string[]} */
        const temporaryPaths = [];
        try {
          const convertStart = Date.now();
          // 이미 .webp 확장자가 있으면 그대로 사용, 없으면 추가
          const finalFileName = fileName.endsWith('.webp') ? fileName : `${fileName}.webp`;
          const webpPath = `${stagingBase}.webp`;

          logger.info({
            fullPath,
            finalFileName,
            webpPath,
            message: 'WebP conversion path setup'
          });

          // 가로만 1400px로 제한해 세로로 긴 이미지의 가로 해상도를 보존한다.
          const maxWidth = 1400;

          /** @type {Buffer | string} */
          let sharpInput = fileBuffer;
          if (isHeic) {
            const temporaryToken = randomUUID();
            const heicInputPath = `${stagingBase}.heic-${temporaryToken}${path.extname(file.name) || '.heic'}`;
            const jpegOutputPath = `${stagingBase}.heic-${temporaryToken}.jpg`;
            temporaryPaths.push(heicInputPath, jpegOutputPath);
            fs.writeFileSync(heicInputPath, fileBuffer);
            await runHeifConvert(heicInputPath, jpegOutputPath);
            if (!fs.existsSync(jpegOutputPath)) {
              throw new Error('heif-convert did not create a JPEG output');
            }
            sharpInput = jpegOutputPath;
          }

          // 이미 WebP인 경우에도 리사이즈 및 재압축을 위해 다시 처리
          const webpBuffer = await sharp(sharpInput, { animated: true })
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
          if (isHeic) {
            throw error(415, {
              message:
                'HEIC 이미지를 변환하지 못했습니다. JPEG 또는 PNG로 변경한 뒤 다시 업로드해 주세요.'
            });
          }
          // 일반 이미지 변환 실패 시 기존 동작처럼 원본 파일 유지
          if (!fileWritten) writeOriginalFile();
        } finally {
          for (const temporaryPath of temporaryPaths) {
            try {
              if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
            } catch (cleanupErr) {
              logger.warn({
                message: 'Failed to remove temporary HEIC conversion file',
                temporaryPath,
                error: cleanupErr
              });
            }
          }
        }
      }
    } else if (file.type.startsWith('video') && options.compressVideo) {
      const inputPath = `${fullPath}.input`;
      const extractVideoAudio = options.extractVideoAudio === true;
      const compressedFileName = `${fileName.substring(0, fileName.lastIndexOf('.'))}${
        extractVideoAudio ? '.m4a' : '.mp4'
      }`;
      const compressedPath = `${stagingBase}${extractVideoAudio ? '.m4a' : '.mp4'}`;
      const serverCompressVideoContext = options.serverCompressVideoContext;
      const removeVideoAudio = options.removeVideoAudio === true;

      try {
        logger.warn({
          fileName,
          originalBytes: file.size,
          removeVideoAudio,
          extractVideoAudio,
          serverCompressVideoContext,
          message: extractVideoAudio
            ? 'Server video audio extraction requested'
            : 'Server video compression requested'
        });

        fs.writeFileSync(inputPath, fileBuffer);
        const audioArgs = removeVideoAudio ? ['-an'] : ['-c:a', 'aac', '-b:a', '64k'];
        const ffmpegArgs = extractVideoAudio
          ? [
              '-y',
              '-i',
              inputPath,
              '-vn',
              '-c:a',
              'aac',
              '-b:a',
              '96k',
              '-movflags',
              '+faststart',
              compressedPath
            ]
          : [
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
            ];
        await runFfmpeg(ffmpegArgs);

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
          extractVideoAudio,
          serverCompressVideoContext,
          message: extractVideoAudio
            ? 'Audio extracted with server ffmpeg fallback'
            : 'Video compressed with server ffmpeg fallback'
        });
      } catch (err) {
        logger.error({
          message: extractVideoAudio
            ? 'Server video audio extraction failed'
            : 'Server video compression failed; saving original',
          error: err,
          fileName,
          originalBytes: file.size,
          serverCompressVideoContext
        });
        if (extractVideoAudio) throw err;
        if (!fileWritten) writeOriginalFile();
      } finally {
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        } catch (cleanupErr) {
          logger.warn({ message: 'Failed to remove temporary video input', error: cleanupErr });
        }
      }
    } else if (!isPdf) {
      writeOriginalFile();
      console.debug('Video file - skipping WebP conversion');
    }

    if (file.type.startsWith('image') && !fileWritten) {
      writeOriginalFile();
    }

    const finalPath = fullPath;

    if (file.type.startsWith('image') && options.thumbnail) {
      const { width, height } = options.thumbnail;
      if (Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0) {
        thumbnailPath = `${finalPath}.thumb.webp`;
        uploadMetadata ||= {};
        uploadMetadata.thumbnailUrl = `/images${dir}/${fileName}.thumb.webp`;

        try {
          await sharp(finalPath, { animated: true })
            .resize({
              width,
              height,
              fit: 'cover',
              position: 'centre',
              withoutEnlargement: false
            })
            .webp({ quality: 72, effort: 4 })
            .toFile(thumbnailPath);
        } catch (thumbnailError) {
          thumbnailPath = null;
          delete uploadMetadata.thumbnailUrl;
          logger.warn({
            fileName,
            error: thumbnailError,
            message: 'Image thumbnail generation failed'
          });
        }
      }
    }

    logger.info({
      finalPath,
      fullPath,
      fileName,
      dir,
      exists: fs.existsSync(finalPath),
      message: 'Checking file existence after save'
    });

    if (fs.existsSync(finalPath)) {
      const url = `/images${dir}/${fileName}`;
      const objectKey = `${dir.slice(1)}/${fileName}`;
      try {
        await putUploadObject({
          key: objectKey,
          body: fs.readFileSync(finalPath),
          contentType: mime.getType(fileName) || file.type || 'application/octet-stream',
          originalFileName: file.name,
          uploader: email || 'anonymous',
          uploadedAt: now
        });

        if (previewPath && uploadMetadata?.previewUrl && fs.existsSync(previewPath)) {
          try {
            await putUploadObject({
              key: `${objectKey}.cover.webp`,
              body: fs.readFileSync(previewPath),
              contentType: 'image/webp',
              originalFileName: `${file.name}.cover.webp`,
              uploader: email || 'anonymous',
              uploadedAt: now
            });
          } catch (previewUploadError) {
            delete uploadMetadata.previewUrl;
            logger.warn({
              fileName,
              error: previewUploadError,
              message: 'PDF cover preview MinIO upload failed'
            });
          }
        }

        if (thumbnailPath && uploadMetadata?.thumbnailUrl && fs.existsSync(thumbnailPath)) {
          try {
            await putUploadObject({
              key: `${objectKey}.thumb.webp`,
              body: fs.readFileSync(thumbnailPath),
              contentType: 'image/webp',
              originalFileName: `${file.name}.thumb.webp`,
              uploader: email || 'anonymous',
              uploadedAt: now
            });
          } catch (thumbnailUploadError) {
            delete uploadMetadata.thumbnailUrl;
            logger.warn({
              fileName,
              error: thumbnailUploadError,
              message: 'Image thumbnail MinIO upload failed'
            });
          }
        }
      } finally {
        try {
          fs.rmSync(finalPath, { force: true });
          if (previewPath) fs.rmSync(previewPath, { force: true });
          if (thumbnailPath) fs.rmSync(thumbnailPath, { force: true });
        } catch (cleanupError) {
          logger.warn({
            fileName,
            error: cleanupError,
            message: 'Failed to remove local upload staging file'
          });
        }
      }

      console.debug('File uploaded successfully:', url);
      return options.returnMetadata ? { url, ...uploadMetadata } : url;
    } else {
      logger.error({ finalPath, message: 'File not found after save' });
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
