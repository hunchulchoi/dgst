import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sanitizeArticleContent } from '../src/lib/server/sanitizeArticleContent.js';

const editor = readFileSync('src/lib/components/LexicalEditor.svelte', 'utf8');
const fileUpload = readFileSync('src/lib/util/fileUpload.js', 'utf8');
const uploadRoute = readFileSync('src/routes/board/upload/+server.js', 'utf8');
const sanitizer = readFileSync('src/lib/server/sanitizeArticleContent.js', 'utf8');
const appCss = readFileSync('src/app.css', 'utf8');
const dockerfile = readFileSync('Dockerfile', 'utf8');

describe('PDF upload card', () => {
  it('renders a first-page cover and returns verified metadata', () => {
    expect(fileUpload).toContain("'pdftoppm'");
    expect(fileUpload).toContain('pageCount: sanitizedPdf.pageCount');
    expect(uploadRoute).toContain('returnMetadata: true');
    expect(uploadRoute).toContain('previewUrl');
    expect(uploadRoute).toContain('pageCount');
    expect(dockerfile).toContain('poppler-utils');
  });

  it('inserts a styled PDF card with cover, size and page count', () => {
    expect(editor).toContain('pdf-upload-icon');
    expect(editor).toContain('pdf-attachment__cover');
    expect(editor).toContain('formatFileSize(preparedFile.size)');
    expect(editor).toContain('data.pageCount');
    expect(editor).toContain('data.previewUrl');
    expect(sanitizer).toContain("a: ['href', 'target', 'rel', 'class']");
    expect(sanitizer).toContain("img: ['src', 'alt', 'width', 'height', 'style', 'class']");
    expect(appCss).toContain('.pdf-attachment__cover');
    expect(appCss).toContain('.pdf-attachment__meta');
  });

  it('keeps only the PDF card classes needed for safe rendering', () => {
    const sanitized = sanitizeArticleContent(
      '<a href="/images/document.pdf" class="pdf-attachment" onclick="alert(1)">' +
        '<img src="/images/document.pdf.cover.webp" class="pdf-attachment__cover">' +
        '<span class="pdf-attachment__meta">PDF · 2.4MB · 3페이지</span></a>'
    );

    expect(sanitized).toContain('class="pdf-attachment"');
    expect(sanitized).toContain('class="pdf-attachment__cover"');
    expect(sanitized).toContain('class="pdf-attachment__meta"');
    expect(sanitized).not.toContain('onclick');
  });
});
