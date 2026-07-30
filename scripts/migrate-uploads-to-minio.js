import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'minio';
import mime from 'mime';

const requiredEnvironment = [
  'UPLOAD_PATH',
  'MINIO_ENDPOINT',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET'
];
for (const name of requiredEnvironment) {
  if (!process.env[name]) throw new Error(`${name} 환경변수가 필요합니다.`);
}

const uploadRoot = path.resolve(process.env.UPLOAD_PATH);
const endpointValue = process.env.MINIO_ENDPOINT;
const endpoint = new URL(
  /^[a-z][a-z\d+.-]*:\/\//i.test(endpointValue) ? endpointValue : `http://${endpointValue}`
);
const [bucket, ...prefixParts] = process.env.MINIO_BUCKET.split('/').filter(Boolean);
const objectPrefix = prefixParts.join('/');
const dryRun = process.env.MINIO_MIGRATION_DRY_RUN === 'true';
const concurrency = Math.max(1, Math.min(8, Number(process.env.MINIO_MIGRATION_CONCURRENCY) || 3));

const minio = new Client({
  endPoint: endpoint.hostname,
  port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === 'https:' ? 443 : 80,
  useSSL: endpoint.protocol === 'https:',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
  ...(process.env.MINIO_REGION ? { region: process.env.MINIO_REGION } : {})
});

/** @returns {string[]} */
function findFiles() {
  /** @type {string[]} */
  const files = [];
  /** @param {string} directory */
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  }
  walk(uploadRoot);
  return files;
}

/** @param {unknown} cause */
function isMissingObject(cause) {
  return (
    cause &&
    typeof cause === 'object' &&
    'code' in cause &&
    ['NoSuchKey', 'NotFound', 'NoSuchObject'].includes(String(cause.code))
  );
}

/** @param {string} filePath */
function objectKey(filePath) {
  const relativePath = path.relative(uploadRoot, filePath).split(path.sep).join('/');
  return objectPrefix ? `${objectPrefix}/${relativePath}` : relativePath;
}

let uploaded = 0;
let skipped = 0;
let completed = 0;
const files = findFiles();

/** @param {string} filePath */
async function migrateFile(filePath) {
  const key = objectKey(filePath);
  try {
    await minio.statObject(bucket, key);
    skipped += 1;
  } catch (cause) {
    if (!isMissingObject(cause)) throw cause;
    if (!dryRun) {
      const stat = fs.statSync(filePath);
      await minio.fPutObject(bucket, key, filePath, {
        'Content-Type': mime.getType(filePath) || 'application/octet-stream',
        'X-Amz-Meta-Original-Filename': encodeURIComponent(path.basename(filePath)),
        'X-Amz-Meta-Uploader': encodeURIComponent('legacy-local-import'),
        'X-Amz-Meta-Uploaded-At': stat.mtime.toISOString()
      });
    }
    uploaded += 1;
  }

  completed += 1;
  if (completed % 25 === 0 || completed === files.length) {
    console.log(JSON.stringify({ completed, total: files.length, uploaded, skipped, dryRun }));
  }
}

for (let index = 0; index < files.length; index += concurrency) {
  await Promise.all(files.slice(index, index + concurrency).map(migrateFile));
}

console.log(JSON.stringify({ status: 'complete', total: files.length, uploaded, skipped, dryRun }));
