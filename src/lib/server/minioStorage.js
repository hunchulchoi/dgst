import { Client } from 'minio';
import {
  MINIO_ACCESS_KEY,
  MINIO_BUCKET,
  MINIO_ENDPOINT,
  MINIO_REGION,
  MINIO_SECRET_KEY
} from '$env/static/private';

/** @type {Client | undefined} */
let client;

function getConfig() {
  if (!MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY || !MINIO_BUCKET) {
    throw new Error(
      'MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET 환경변수가 필요합니다.'
    );
  }

  const endpoint = new URL(
    /^[a-z][a-z\d+.-]*:\/\//i.test(MINIO_ENDPOINT) ? MINIO_ENDPOINT : `http://${MINIO_ENDPOINT}`
  );
  if (endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
    throw new Error('MINIO_ENDPOINT에는 호스트와 포트만 지정해야 합니다.');
  }

  const useSSL = endpoint.protocol === 'https:';
  if (!useSSL && endpoint.protocol !== 'http:') {
    throw new Error('MINIO_ENDPOINT는 http 또는 https URL이어야 합니다.');
  }

  const [bucket, ...prefixParts] = MINIO_BUCKET.split('/').filter(Boolean);
  if (!bucket) throw new Error('MINIO_BUCKET에 버킷명을 지정해야 합니다.');
  if (prefixParts.some((part) => part === '.' || part === '..')) {
    throw new Error('MINIO_BUCKET 객체 접두사에 상대 경로를 사용할 수 없습니다.');
  }

  return {
    bucket,
    prefix: prefixParts.join('/'),
    clientOptions: {
      endPoint: endpoint.hostname,
      port: endpoint.port ? Number(endpoint.port) : useSSL ? 443 : 80,
      useSSL,
      accessKey: MINIO_ACCESS_KEY,
      secretKey: MINIO_SECRET_KEY,
      ...(MINIO_REGION ? { region: MINIO_REGION } : {})
    }
  };
}

/** @param {string} key */
function resolveObjectKey(key) {
  const { prefix } = getConfig();
  return prefix ? `${prefix}/${key}` : key;
}

function getClient() {
  if (!client) {
    client = new Client(getConfig().clientOptions);
  }
  return client;
}

/** @param {string} value */
function encodeMetadata(value) {
  return encodeURIComponent(value || '');
}

/** @param {unknown} value */
function decodeMetadata(value) {
  if (typeof value !== 'string') return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * @param {Record<string, string | undefined>} metadata
 * @param {string} key
 */
function metadataValue(metadata, key) {
  return metadata?.[key] ?? metadata?.[`x-amz-meta-${key}`] ?? metadata?.[`X-Amz-Meta-${key}`];
}

/**
 * @param {{
 *   key: string,
 *   body: Buffer,
 *   contentType: string,
 *   originalFileName: string,
 *   uploader: string,
 *   uploadedAt: Date
 * }} upload
 */
export async function putUploadObject(upload) {
  const { bucket } = getConfig();
  const metadata = {
    'Content-Type': upload.contentType,
    'X-Amz-Meta-Original-Filename': encodeMetadata(upload.originalFileName),
    'X-Amz-Meta-Uploader': encodeMetadata(upload.uploader),
    'X-Amz-Meta-Uploaded-At': upload.uploadedAt.toISOString()
  };

  return getClient().putObject(
    bucket,
    resolveObjectKey(upload.key),
    upload.body,
    upload.body.length,
    metadata
  );
}

/**
 * @param {string} key
 * @param {{ offset: number, length: number } | undefined} range
 * @param {Awaited<ReturnType<typeof statUploadObject>>} [knownMetadata]
 */
export async function getUploadObject(key, range, knownMetadata) {
  const { bucket } = getConfig();
  const minio = getClient();
  const metadata = knownMetadata || (await statUploadObject(key));
  const objectKey = resolveObjectKey(key);
  const stream = range
    ? await minio.getPartialObject(bucket, objectKey, range.offset, range.length)
    : await minio.getObject(bucket, objectKey);

  return {
    stream,
    ...metadata
  };
}

/** @param {string} key */
export async function statUploadObject(key) {
  const { bucket } = getConfig();
  const stat = await getClient().statObject(bucket, resolveObjectKey(key));
  const metadata = stat.metaData || {};

  return {
    size: stat.size,
    etag: stat.etag,
    lastModified: stat.lastModified,
    contentType: metadataValue(metadata, 'content-type') || 'application/octet-stream',
    originalFileName: decodeMetadata(metadataValue(metadata, 'original-filename')),
    uploader: decodeMetadata(metadataValue(metadata, 'uploader')),
    uploadedAt: metadataValue(metadata, 'uploaded-at')
  };
}
