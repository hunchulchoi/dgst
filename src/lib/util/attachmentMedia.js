const VIDEO_ATTACHMENT_PATTERN = /\.(mp4|m4v|mov|webm|ogv|ogg)(?:[?#].*)?$/i;
const PDF_ATTACHMENT_PATTERN = /\.pdf(?:[?#].*)?$/i;

/** @param {string | { name?: string, type?: string } | null | undefined} attachment */
export function isVideoAttachment(attachment) {
  if (!attachment) return false;
  if (typeof attachment === 'object') {
    return (
      attachment.type?.startsWith('video/') || VIDEO_ATTACHMENT_PATTERN.test(attachment.name ?? '')
    );
  }
  return VIDEO_ATTACHMENT_PATTERN.test(attachment);
}

/** @param {string | { name?: string, type?: string } | null | undefined} attachment */
export function isPdfAttachment(attachment) {
  if (!attachment) return false;
  if (typeof attachment === 'object') {
    return (
      attachment.type === 'application/pdf' || PDF_ATTACHMENT_PATTERN.test(attachment.name ?? '')
    );
  }
  return PDF_ATTACHMENT_PATTERN.test(attachment);
}

/** @param {string | null | undefined} header */
export function parseAttachmentFileName(header) {
  if (!header) return '';

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim().replace(/^"|"$/g, ''));
    } catch {
      // Fall back to the ASCII filename below.
    }
  }

  return /filename="([^"]+)"/i.exec(header)?.[1] ?? '';
}

/** @param {number | null | undefined} bytes */
export function formatAttachmentFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes == null || bytes < 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))}KB`;

  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.ceil(mb) : mb.toFixed(1)}MB`;
}

/** @param {string} value */
export function attachmentFileNameFromUrl(value) {
  try {
    const pathName = new URL(value, 'https://dgst.local').pathname;
    return decodeURIComponent(pathName.split('/').pop() ?? '') || 'PDF 파일';
  } catch {
    return 'PDF 파일';
  }
}

/**
 * Browser image compression may preserve the source filename even after changing the MIME type.
 * Always return a fresh WebP File whose extension matches its contents.
 * @param {Blob} blob
 * @param {string} sourceName
 */
export function createWebpUploadFile(blob, sourceName) {
  const baseName = sourceName.replace(/\.[^./\\]+$/, '') || 'image';
  return new File([blob], `${baseName}.webp`, {
    type: 'image/webp',
    lastModified: blob instanceof File ? blob.lastModified : Date.now()
  });
}
