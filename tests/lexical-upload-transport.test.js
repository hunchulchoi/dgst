import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const lexicalEditor = readFileSync('src/lib/components/LexicalEditor.svelte', 'utf8');

describe('Lexical upload transport', () => {
  it('sends an explicitly encoded multipart body for Safari uploads', () => {
    expect(lexicalEditor).toContain("xhr.open('POST', '/board/upload')");
    expect(lexicalEditor).toContain('encodeMultipartFormData(formData)');
    expect(lexicalEditor).toContain("xhr.setRequestHeader('Content-Type', multipart.contentType)");
    expect(lexicalEditor).toContain('xhr.send(multipart.body)');
    expect(lexicalEditor).toContain('await postUploadFormData(formData)');
  });
});
