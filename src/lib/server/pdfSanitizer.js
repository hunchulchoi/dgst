import { error } from '@sveltejs/kit';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';

export const PDF_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const PDF_UPLOAD_MAX_PAGES = 100;

const DANGEROUS_KEYS = [
  'AA',
  'AcroForm',
  'Collection',
  'EF',
  'EmbeddedFiles',
  'ImportData',
  'JavaScript',
  'JS',
  'Launch',
  'OpenAction',
  'Perms',
  'RichMediaContent',
  'SubmitForm',
  'XFA'
].map((name) => PDFName.of(name));

const DANGEROUS_ACTIONS = new Set([
  'ImportData',
  'JavaScript',
  'Launch',
  'Rendition',
  'RichMedia',
  'SubmitForm'
]);

/** @param {PDFDict} dictionary */
function removeDangerousEntries(dictionary) {
  const actionType = dictionary.get(PDFName.of('S'));
  const actionName = actionType instanceof PDFName ? actionType.asString().replace(/^\//, '') : '';

  if (DANGEROUS_ACTIONS.has(actionName)) {
    for (const key of dictionary.keys()) {
      dictionary.delete(key);
    }
    return;
  }

  for (const key of DANGEROUS_KEYS) {
    dictionary.delete(key);
  }
}

/** @param {PDFDocument} document */
function stripActiveContent(document) {
  removeDangerousEntries(document.catalog);

  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (object instanceof PDFDict) {
      removeDangerousEntries(object);
    }
  }

  for (const page of document.getPages()) {
    removeDangerousEntries(page.node);
  }
}

/**
 * Parses an uploaded PDF and rebuilds only its pages into a new document.
 * Catalog actions, JavaScript, forms, annotations, embedded files and launch
 * actions are discarded instead of preserving the uploaded object graph.
 *
 * @param {Buffer | Uint8Array} input
 * @returns {Promise<{ buffer: Buffer, pageCount: number }>}
 */
export async function sanitizePdf(input) {
  const bytes = Buffer.from(input);
  if (bytes.length > PDF_UPLOAD_MAX_BYTES) {
    throw error(413, {
      message: `PDF는 ${PDF_UPLOAD_MAX_BYTES / 1024 / 1024}MB 이하만 업로드할 수 있습니다.`
    });
  }

  const header = bytes.subarray(0, 1024).toString('latin1');
  if (!/%PDF-1\.[0-9]/.test(header)) {
    throw error(415, { message: '올바른 PDF 파일이 아닙니다.' });
  }

  /** @type {PDFDocument} */
  let source;
  try {
    source = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false
    });
  } catch {
    throw error(415, {
      message: '손상되었거나 암호화된 PDF는 업로드할 수 없습니다.'
    });
  }

  const pageCount = source.getPageCount();
  if (pageCount < 1 || pageCount > PDF_UPLOAD_MAX_PAGES) {
    throw error(413, {
      message: `PDF는 1~${PDF_UPLOAD_MAX_PAGES}페이지만 업로드할 수 있습니다.`
    });
  }

  const sanitized = await PDFDocument.create();
  const pages = await sanitized.copyPages(
    source,
    Array.from({ length: pageCount }, (_, index) => index)
  );
  for (const page of pages) {
    page.node.delete(PDFName.of('Annots'));
    page.node.delete(PDFName.of('AA'));
    sanitized.addPage(page);
  }

  stripActiveContent(sanitized);
  sanitized.setTitle('');
  sanitized.setAuthor('');
  sanitized.setSubject('');
  sanitized.setKeywords([]);
  sanitized.setCreator('DGST PDF sanitizer');
  sanitized.setProducer('DGST PDF sanitizer');

  const buffer = Buffer.from(
    await sanitized.save({
      addDefaultPage: false,
      useObjectStreams: false,
      updateFieldAppearances: false
    })
  );

  return { buffer, pageCount };
}

/**
 * @param {Buffer | Uint8Array} input
 * @returns {Promise<Buffer>}
 */
export async function sanitizePdfBuffer(input) {
  return (await sanitizePdf(input)).buffer;
}
