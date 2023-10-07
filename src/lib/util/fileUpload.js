import * as fs from 'fs';
import moment from 'moment';
import mime from 'mime';

import {UPLOAD_PATH } from '$env/static/private';
import { error } from "@sveltejs/kit";
import path from "path";


function safeString(_name, _path){
	
	_name = decodeURIComponent(_name);
	
	if(!mime.getType(_name).startsWith('image')) return false;
	
	_path = decodeURIComponent(_path);
	
	console.debug(path.normalize(path.join(UPLOAD_PATH, _path, _name)));
	
	return path.normalize(path.join(UPLOAD_PATH, _path, _name)).startsWith(UPLOAD_PATH);
	
}

export async function write(file, preservePath = 'jjal') {
	console.debug('preservePath', preservePath, 'file', file);
	
	if(!safeString(file.name, preservePath)){
		throw error(400, {message: '잘못된 요청입니다.'});
	}

	const dir = `/${preservePath}/${moment().format(
		'YYYY'
	)}/${moment().format('MM')}/${moment().format('DD')}`;
	
	console.debug('dir', dir)

	if (!fs.existsSync(`${UPLOAD_PATH}${dir}`)) {
		fs.mkdirSync(`${UPLOAD_PATH}${dir}`, { recursive: true });
	}

	console.debug(UPLOAD_PATH, dir, fs.existsSync(`${UPLOAD_PATH}${dir}`));

	const fileName = `${file.name.substring(
		0,
		file.name.lastIndexOf('.')
	).substring(0,10)}_${new Date().getTime()}${file.name.substring(file.name.lastIndexOf('.'))}`
		.replace('..', '')
		.replace('/', '');

	fs.writeFileSync(`${UPLOAD_PATH}${dir}/${fileName}`, Buffer.from(await file.arrayBuffer()));

	//console.log(`${UPLOAD_PATH}${dir}/${fileName}`, fs.existsSync(`${UPLOAD_PATH}${dir}/${fileName}`));

	if (fs.existsSync(`${UPLOAD_PATH}${dir}/${fileName}`)) return `images${dir}/${fileName}`;
	else throw error(500, '파일 저장 중에 오류가 발생하였습니다. 쿠훕ㅠㅠ');
}

export async function read(file, preservePath) {
	
	if(!safeString(file.name, preservePath)){
		throw error(400, {message: '잘못된 요청입니다.'});
	}
	
	
}
