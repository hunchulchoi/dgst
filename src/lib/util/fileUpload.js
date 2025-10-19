import * as fs from 'fs';
import mime from 'mime';
import { format } from 'date-fns';

import { UPLOAD_PATH } from '$env/static/private';
import { error } from '@sveltejs/kit';
import path from 'path';
import webp from 'webp-converter';

function safeString(_name, _path) {
  _name = decodeURIComponent(_name);

  const mimeType = mime.getType(_name);
  // 이미지와 비디오 모두 허용
  const isValid = mimeType && (mimeType.startsWith('image') || mimeType.startsWith('video'));
  
  if (!isValid) {
    console.log('Invalid file type:', mimeType, 'for file:', _name);
    return false;
  }

  _path = decodeURIComponent(_path);

  const normalizedPath = path.normalize(path.join(UPLOAD_PATH, _path, _name));
  const isPathSafe = normalizedPath.startsWith(UPLOAD_PATH);
  
  console.log('Path safety check:', { normalizedPath, UPLOAD_PATH, isPathSafe });

  return isPathSafe;
}

export async function write(file, email, preservePath = 'jjal') {
  try {
    console.log('fileUpload.write called:', { fileName: file.name, preservePath, email });

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

    console.log('Upload directory:', `${UPLOAD_PATH}${dir}`);

    // 파일명 생성 (특수문자 안전 처리)
    const emailPrefix = email?.substring(0, 8).replace(/[^a-zA-Z0-9]/g, '') || 'anonymous';
    const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
    const safeName = baseName.substring(0, 10).replace(/[^a-zA-Z0-9가-힣]/g, '_');
    const ext = file.name.substring(file.name.lastIndexOf('.'));

    let fileName = `${emailPrefix}_${safeName}_${now.getTime()}${ext}`;

    console.log('Generated fileName:', fileName);

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fullPath = `${UPLOAD_PATH}${dir}/${fileName}`;

    console.log('Writing file to:', fullPath);
    fs.writeFileSync(fullPath, fileBuffer);
    console.log('File written successfully');

    // 움짤 압축
    if (file.type === 'image/gif') {
      const gwebp = await webp.gwebp(`${UPLOAD_PATH}${dir}/${fileName}`, `${UPLOAD_PATH}${dir}/${fileName}.webp`, '-lossy');

      fs.unlink(`${UPLOAD_PATH}${dir}/${fileName}`, (err) => console.error(err))

      fileName = `${fileName}.webp`;
      //console.log('gwebp', gwebp)

      //  아이폰은 webp 변환해도 2메가 넘어가는 경우가 있음
      // 서버에서 다시한번 압축
    } else if (file.type !== 'image/webp' && file.size > 1024 * 1024) {

      const cwebp = await webp.cwebp(`${UPLOAD_PATH}${dir}/${fileName}`, `${UPLOAD_PATH}${dir}/${fileName}.webp`);

      fs.unlink(`${UPLOAD_PATH}${dir}/${fileName}`, (err) => console.error(err))

      fileName = `${fileName}.webp`;
      //console.log('cwebp', cwebp)
    }

    if (fs.existsSync(`${UPLOAD_PATH}${dir}/${fileName}`)) {
      console.log('File uploaded successfully:', `/images${dir}/${fileName}`);
      return `/images${dir}/${fileName}`;
    } else {
      throw error(500, '파일 저장 중에 오류가 발생하였습니다. 쿠훕ㅠㅠ');
    }
  } catch (err) {
    console.error('File upload error:', err);
    throw err;
  }
}

export async function read(file, preservePath) {
  if (!safeString(file.name, preservePath)) {
    throw error(400, { message: '잘못된 요청입니다.' });
  }
}
