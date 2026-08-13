// @ts-nocheck -- Smoke-test session and route events are intentionally partial fixtures.
import { describe, expect, it } from 'vitest';
import { Client } from 'minio';
import {
  MINIO_ACCESS_KEY,
  MINIO_BUCKET,
  MINIO_ENDPOINT,
  MINIO_REGION,
  MINIO_SECRET_KEY
} from '$env/static/private';

const smoke = process.env.RUN_MINIO_SMOKE === 'true' ? it : it.skip;

function minioTarget() {
  const endpoint = new URL(
    /^[a-z][a-z\d+.-]*:\/\//i.test(MINIO_ENDPOINT) ? MINIO_ENDPOINT : `http://${MINIO_ENDPOINT}`
  );
  const [bucket, ...prefixParts] = MINIO_BUCKET.split('/').filter(Boolean);
  return {
    bucket,
    prefix: prefixParts.join('/'),
    client: new Client({
      endPoint: endpoint.hostname,
      port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === 'https:' ? 443 : 80,
      useSSL: endpoint.protocol === 'https:',
      accessKey: MINIO_ACCESS_KEY,
      secretKey: MINIO_SECRET_KEY,
      ...(MINIO_REGION ? { region: MINIO_REGION } : {})
    })
  };
}

describe('MinIO upload/download smoke', () => {
  smoke('uploads through the board endpoint and downloads the same bytes', async () => {
    const originalFileName = `스모크 원본 ${Date.now()}.png`;
    const source = Buffer.from('dgst-real-minio-smoke');
    const form = new FormData();
    form.append('upload', new File([source], originalFileName, { type: 'image/png' }));
    const request = new Request('http://localhost:5173/board/upload', {
      method: 'POST',
      body: form
    });
    const { POST } = await import('../src/routes/board/upload/+server.js');
    const { GET } = await import('../src/routes/images/[...filepath]/+server.js');
    const target = minioTarget();
    let objectKey;

    try {
      const uploadResponse = await POST({
        request,
        locals: {
          auth: async () => ({
            user: { email: 'minio-smoke@example.com', nickname: 'MinIO smoke' }
          })
        }
      });
      expect(uploadResponse.status).toBe(200);
      const upload = await uploadResponse.json();
      expect(upload.url).toMatch(/^\/images\//);
      objectKey = upload.url.slice('/images/'.length);

      const downloadResponse = await GET({
        params: { filepath: objectKey },
        request: new Request(`http://localhost:5173${upload.url}`)
      });
      expect(downloadResponse.status).toBe(200);
      expect(Buffer.from(await downloadResponse.arrayBuffer())).toEqual(source);
      expect(downloadResponse.headers.get('content-disposition')).toContain(
        `filename*=UTF-8''${encodeURIComponent(originalFileName)}`
      );

      const storedKey = target.prefix ? `${target.prefix}/${objectKey}` : objectKey;
      const stat = await target.client.statObject(target.bucket, storedKey);
      expect(decodeURIComponent(stat.metaData['original-filename'])).toBe(originalFileName);
      expect(decodeURIComponent(stat.metaData.uploader)).toBe('minio-smoke@example.com');
      expect(stat.metaData['uploaded-at']).toBeTruthy();
    } finally {
      if (objectKey) {
        const storedKey = target.prefix ? `${target.prefix}/${objectKey}` : objectKey;
        await target.client.removeObject(target.bucket, storedKey);
      }
    }
  });
});
