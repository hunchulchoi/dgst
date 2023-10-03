import * as fs from 'fs';
import { writeFileSync } from 'fs';
import moment from 'moment';

import { UPLOAD_PATH } from '$env/static/private';


export async function write(file, preservePath='jjal'){
  
  console.log('preservePath', preservePath, 'file', file)
  
  const dir = `${UPLOAD_PATH}/${preservePath.replace('..', '').replace('/', '')}/${moment().format('YYYY')}/${moment().format('YYYYMM')}/${moment().format('YYYYMMDD')}`
  
  if(!fs.existsSync(`static${dir}`)) {
    fs.mkdirSync(`static${dir}`, {recursive: true});
  }
  
  console.log(dir, fs.existsSync(`static${dir}`))
  
  const fileName = `${file.name.substring(0, file.name.lastIndexOf('.'))}_${new Date().getTime()}${file.name.substring(file.name.lastIndexOf('.'))}`.replace('..', '').replace('/', '')
  
  writeFileSync(
    `static${dir}/${fileName}`
    , Buffer.from(await file.arrayBuffer()));
  
  console.log(`${dir}/${file.name}`, fs.existsSync(`static${dir}/${fileName}`))
  
  if(fs.existsSync(`static${dir}/${fileName}`)) return `${dir}/${fileName}`;
  
  return `${dir}/${fileName}`;
}
