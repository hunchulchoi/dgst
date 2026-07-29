import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';

import { PDF_UPLOAD_MAX_PAGES, sanitizePdfBuffer } from '../src/lib/server/pdfSanitizer.js';

async function createPdf({ pages = 1, javascript = false } = {}) {
  const document = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) {
    document.addPage([300, 400]);
  }

  if (javascript) {
    const action = document.context.obj({
      S: PDFName.of('JavaScript'),
      JS: PDFString.of('app.alert("unsafe")')
    });
    document.catalog.set(PDFName.of('OpenAction'), action);
    document.getPage(0).node.set(
      PDFName.of('Annots'),
      document.context.obj([
        {
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Link'),
          Rect: [0, 0, 100, 100],
          A: action
        }
      ])
    );
  }

  return Buffer.from(await document.save({ useObjectStreams: false }));
}

describe('sanitizePdfBuffer', () => {
  it('rebuilds a PDF and removes automatic JavaScript actions', async () => {
    const unsafe = await createPdf({ javascript: true });
    const sanitized = await sanitizePdfBuffer(unsafe);
    const parsed = await PDFDocument.load(sanitized);

    expect(parsed.getPageCount()).toBe(1);
    expect(parsed.catalog.has(PDFName.of('OpenAction'))).toBe(false);
    expect(parsed.getPage(0).node.has(PDFName.of('Annots'))).toBe(false);
    expect(sanitized.toString('latin1')).not.toContain('app.alert');
  });

  it('rejects data that only claims to be a PDF', async () => {
    await expect(sanitizePdfBuffer(Buffer.from('<script>alert(1)</script>'))).rejects.toMatchObject(
      {
        status: 415
      }
    );
  });

  it('rejects PDFs over the page limit', async () => {
    const oversized = await createPdf({ pages: PDF_UPLOAD_MAX_PAGES + 1 });

    await expect(sanitizePdfBuffer(oversized)).rejects.toMatchObject({ status: 413 });
  });
});
