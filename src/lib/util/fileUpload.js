import * as fs from 'fs';
import { writeFileSync } from 'fs';
import moment from 'moment';

import { ASSETS_ROOT, UPLOAD_PATH } from '$env/static/private';
import { error } from "@sveltejs/kit";

export async function write(file, preservePath = 'jjal') {
	console.log('ASSETS_ROOT', ASSETS_ROOT, 'preservePath', preservePath, 'file', file);

	const dir = `${UPLOAD_PATH}/${preservePath.replace('..', '').replace('/', '')}/${moment().format(
		'YYYY'
	)}/${moment().format('YYYYMM')}/${moment().format('YYYYMMDD')}`;

	if (!fs.existsSync(`${ASSETS_ROOT}${dir}`)) {
		fs.mkdirSync(`${ASSETS_ROOT}${dir}`, { recursive: true });
	}

	console.log(dir, fs.existsSync(`${ASSETS_ROOT}${dir}`));

	const fileName = `${file.name.substring(
		0,
		file.name.lastIndexOf('.')
	)}_${new Date().getTime()}${file.name.substring(file.name.lastIndexOf('.'))}`
		.replace('..', '')
		.replace('/', '');

	writeFileSync(`${ASSETS_ROOT}${dir}/${fileName}`, Buffer.from(await file.arrayBuffer()));

	console.log(`${ASSETS_ROOT}${dir}/${file.name}`, fs.existsSync(`${ASSETS_ROOT}${dir}/${fileName}`));

	if (fs.existsSync(`${ASSETS_ROOT}${dir}/${fileName}`)) return `/${dir}/${fileName}`;
	else throw error(500, '파일 저장 중에 오류가 발생하였습니다. ㅠㅠ');
}
