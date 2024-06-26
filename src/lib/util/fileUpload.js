import * as fs from 'fs';
import mime from 'mime';
import { getDate, getMonth, getYear } from 'date-fns';

import { UPLOAD_PATH } from '$env/static/private';
import { error } from '@sveltejs/kit';
import path from 'path';
import webp from 'webp-converter';

function safeString(_name, _path) {
  _name = decodeURIComponent(_name);

  if (!mime.getType(_name).startsWith('image')) return false;

  _path = decodeURIComponent(_path);

  //console.debug(path.normalize(path.join(UPLOAD_PATH, _path, _name)));

  return path.normalize(path.join(UPLOAD_PATH, _path, _name)).startsWith(UPLOAD_PATH);
}

export async function write(file, email, preservePath = 'jjal') {
  //console.debug('preservePath', preservePath, 'file', file);

  const now = new Date();

  if (!safeString(file.name, preservePath)) {
    throw error(400, { message: '잘못된 요청입니다.' });
  }

  const dir = `/${preservePath}/${getYear(now)}/${getMonth(now)}/${getDate(now)}`;

  if (!fs.existsSync(`${UPLOAD_PATH}${dir}`)) {
    fs.mkdirSync(`${UPLOAD_PATH}${dir}`, { recursive: true });
  }

  //console.debug(UPLOAD_PATH, dir, fs.existsSync(`${UPLOAD_PATH}${dir}`));

  let fileName = `${email?.substring(0,8)}_${file.name
    .substring(0, file.name.lastIndexOf('.'))
    .substring(0, 10)}_${now.getTime()}${file.name.substring(file.name.lastIndexOf('.'))}`;
  
  fileName = fileName.replaceAll(' ', '_');

  fs.writeFileSync(`${UPLOAD_PATH}${dir}/${fileName}`, Buffer.from(await file.arrayBuffer()));

  // 움짤 압축
  if(file.type === 'image/gif'){
		const gwebp = await webp.gwebp(`${UPLOAD_PATH}${dir}/${fileName}`, `${UPLOAD_PATH}${dir}/${fileName}.webp`, '-lossy');

    fs.unlink(`${UPLOAD_PATH}${dir}/${fileName}`, (err)=> console.error(err))

    fileName = `${fileName}.webp`;
		//console.log('gwebp', gwebp)

  //  아이폰은 webp 변환해도 2메가 넘어가는 경우가 있음
  // 서버에서 다시한번 압축
	}else if(file.type !== 'image/webp' && file.size > 1024*1024){

      const cwebp = await webp.cwebp(`${UPLOAD_PATH}${dir}/${fileName}`, `${UPLOAD_PATH}${dir}/${fileName}.webp`);

      fs.unlink(`${UPLOAD_PATH}${dir}/${fileName}`, (err)=> console.error(err))

      fileName = `${fileName}.webp`;
      //console.log('cwebp', cwebp)
    }

  if (fs.existsSync(`${UPLOAD_PATH}${dir}/${fileName}`)) return `/images${dir}/${fileName}`;
  else throw error(500, '파일 저장 중에 오류가 발생하였습니다. 쿠훕ㅠㅠ');
}

export async function read(file, preservePath) {
  if (!safeString(file.name, preservePath)) {
    throw error(400, { message: '잘못된 요청입니다.' });
  }
}
