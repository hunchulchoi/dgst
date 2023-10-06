import * as fs from 'fs';
import { writeFileSync } from 'fs';
import moment from 'moment';

import {assets} from '$app/paths';

import { UPLOAD_PATH } from '$env/static/private';
import { error } from "@sveltejs/kit";

export async function write(file, preservePath = 'jjal') {
	console.log('assets', assets, 'preservePath', preservePath, 'file', file);

	const dir = `/${assets}/${UPLOAD_PATH}/${preservePath.replace('..', '').replace('/', '')}/${moment().format(
		'YYYY'
	)}/${moment().format('YYYYMM')}/${moment().format('YYYYMMDD')}`;

	if (!fs.existsSync(`${dir}`)) {
		fs.mkdirSync(`${dir}`, { recursive: true });
	}

	console.log(dir, fs.existsSync(`${dir}`));

	const fileName = `${file.name.substring(
		0,
		file.name.lastIndexOf('.')
	)}_${new Date().getTime()}${file.name.substring(file.name.lastIndexOf('.'))}`
		.replace('..', '')
		.replace('/', '');

	writeFileSync(`${dir}/${fileName}`, Buffer.from(await file.arrayBuffer()));

	console.log(`${dir}/${file.name}`, fs.existsSync(`${dir}/${fileName}`));

	if (fs.existsSync(`${dir}/${fileName}`)) return `/${dir}/${fileName}`;
	else throw error(500, '파일 저장 중에 오류가 발생하였습니다. ㅠㅠ');
}
