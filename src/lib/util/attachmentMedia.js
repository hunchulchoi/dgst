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
