import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fileUpload = readFileSync('src/lib/util/fileUpload.js', 'utf8');

describe('file upload logging', () => {
  it('logs client-side 4xx upload rejections as warnings', () => {
    expect(fileUpload).toContain("const status = typeof err === 'object' && err ? Number(Reflect.get(err, 'status')) : 0;");
    expect(fileUpload).toContain('status >= 400 && status < 500 ? logger.warn : logger.error');
  });
});
