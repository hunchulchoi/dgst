/** @type {Record<string, string>} */
const IMAGE_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif'
};

/** @param {File} file */
function normalizeClipboardFile(file) {
  if (/\.[^./\\]+$/.test(file.name)) return file;
  const extension = IMAGE_EXTENSIONS[file.type.toLowerCase()];
  if (!extension) return file;
  return new File([file], `${file.name || 'clipboard-image'}.${extension}`, {
    type: file.type,
    lastModified: file.lastModified
  });
}

/**
 * Mobile keyboards can send beforeinput instead of a ClipboardEvent.
 * @param {{ type?: string, clipboardData?: DataTransfer | null, dataTransfer?: DataTransfer | null, data?: string | null }} event
 */
export function readPasteData(event) {
  const transfer = event.clipboardData ?? event.dataTransfer;
  let files = Array.from(transfer?.files ?? []);
  if (files.length === 0) {
    files = Array.from(transfer?.items ?? [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file) => file !== null);
  }
  return {
    files: files.map(normalizeClipboardFile),
    text: transfer?.getData('text/plain') || event.data || ''
  };
}
