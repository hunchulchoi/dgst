import path from 'node:path';
import { Client } from 'minio';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const apply = process.argv.includes('--apply');
const requiredEnvironment = [
  'DATABASE_URL',
  'MINIO_ENDPOINT',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET'
];

for (const name of requiredEnvironment) {
  if (!process.env[name]) throw new Error(`${name} environment variable is required`);
}

const endpointValue = process.env.MINIO_ENDPOINT;
const endpoint = new URL(
  /^[a-z][a-z\d+.-]*:\/\//i.test(endpointValue) ? endpointValue : `http://${endpointValue}`
);
const [bucket, ...prefixParts] = process.env.MINIO_BUCKET.split('/').filter(Boolean);
const objectPrefix = prefixParts.join('/');
const minio = new Client({
  endPoint: endpoint.hostname,
  port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === 'https:' ? 443 : 80,
  useSSL: endpoint.protocol === 'https:',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
  ...(process.env.MINIO_REGION ? { region: process.env.MINIO_REGION } : {})
});
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

/** @param {import('node:stream').Readable} stream */
async function streamBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** @param {string} photo */
function profileObjectKey(photo) {
  if (!photo.startsWith('/images/profiles/')) return null;
  const sourceKey = photo.slice('/images/'.length);
  const parsed = path.posix.parse(sourceKey);
  return `${parsed.dir}/${parsed.name}.animated.webp`;
}

/** @param {string} key */
function withPrefix(key) {
  return objectPrefix ? `${objectPrefix}/${key}` : key;
}

const users = await prisma.user.findMany({
  where: { photo: { startsWith: '/images/profiles/' } },
  select: { id: true, photo: true }
});
let converted = 0;
let skipped = 0;
let failed = 0;

for (const user of users) {
  if (!user.photo) continue;
  const destinationKey = profileObjectKey(user.photo);
  if (!destinationKey) {
    skipped += 1;
    continue;
  }
  const destinationPhoto = `/images/${destinationKey}`;

  try {
    if (!apply) {
      console.log(JSON.stringify({ action: 'would-convert', userId: user.id, from: user.photo, to: destinationPhoto }));
      converted += 1;
      continue;
    }

    const sourceKey = user.photo.slice('/images/'.length);
    const [source, sourceStat] = await Promise.all([
      minio.getObject(bucket, withPrefix(sourceKey)),
      minio.statObject(bucket, withPrefix(sourceKey))
    ]);
    const sharp = (await import('sharp')).default;
    const body = await sharp(await streamBuffer(source), { animated: true })
      .rotate()
      .webp({ quality: 85, effort: 4 })
      .toBuffer();
    await minio.putObject(bucket, withPrefix(destinationKey), body, body.length, {
      'Content-Type': 'image/webp',
      'X-Amz-Meta-Original-Filename': sourceStat.metaData?.['x-amz-meta-original-filename'] || '',
      'X-Amz-Meta-Uploader': 'profile-animation-migration',
      'X-Amz-Meta-Uploaded-At': new Date().toISOString()
    });
    await prisma.user.updateMany({ where: { id: user.id, photo: user.photo }, data: { photo: destinationPhoto } });
    converted += 1;
    console.log(JSON.stringify({ action: 'converted', userId: user.id, from: user.photo, to: destinationPhoto }));
  } catch (error) {
    failed += 1;
    console.error(JSON.stringify({ action: 'failed', userId: user.id, photo: user.photo, error: String(error) }));
  }
}

await prisma.$disconnect();
console.log(JSON.stringify({ status: failed ? 'completed-with-failures' : 'complete', apply, converted, skipped, failed }));
process.exitCode = failed ? 1 : 0;
