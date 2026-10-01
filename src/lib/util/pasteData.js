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

/** @param {string} dataUrl @param {string} [filename] */
export function dataUrlToFile(dataUrl, filename = 'clipboard-image') {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const header = dataUrl.slice(0, commaIdx);
  const base64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/:(.*?);/);
  const type = mimeMatch ? mimeMatch[1] : 'image/png';
  const ext = IMAGE_EXTENSIONS[type.toLowerCase()] || 'png';
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], `${filename}.${ext}`, { type, lastModified: Date.now() });
  } catch {
    return null;
  }
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
  if (files.length === 0) {
    const html = transfer?.getData('text/html') || '';
    if (html) {
      const match = html.match(/<img[^>]+src=["'](data:image\/[^"']+)["']/i);
      if (match) {
        const file = dataUrlToFile(match[1]);
        if (file) files = [file];
      }
    }
  }
  return {
    files: files.map(normalizeClipboardFile),
    text: transfer?.getData('text/plain') || event.data || ''
  };
}

/**
 * Read image files asynchronously from the Async Clipboard API (navigator.clipboard.read()).
 * Critical for mobile browsers (e.g. Samsung Galaxy / Android Chrome) where ClipboardEvent.clipboardData
 * or InputEvent.dataTransfer contains no files synchronously.
 * @returns {Promise<File[]>}
 */
export async function readClipboardImageFiles() {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.read !== 'function')
    return [];
  try {
    const items = await navigator.clipboard.read();
    /** @type {File[]} */
    const files = [];
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        const ext = IMAGE_EXTENSIONS[imageType.toLowerCase()] || 'png';
        files.push(
          new File([blob], `clipboard-image.${ext}`, {
            type: imageType,
            lastModified: Date.now()
          })
        );
      }
    }
    return files;
  } catch (error) {
    console.warn('Failed to read image from clipboard:', error);
    return [];
  }
}

/**
 * @param {{ type?: string, inputType?: string, clipboardData?: DataTransfer | null, dataTransfer?: DataTransfer | null, data?: string | null }} event
 * @returns {Promise<{ files: File[], text: string }>}
 */
export async function readPasteDataAsync(event) {
  const syncData = readPasteData(event);
  if (syncData.files.length > 0) {
    return syncData;
  }

  // If there's text, it's a text paste rather than an image paste
  if (syncData.text.trim()) {
    return syncData;
  }

  const asyncFiles = await readClipboardImageFiles();
  if (asyncFiles.length > 0) {
    return {
      files: asyncFiles,
      text: ''
    };
  }

  return syncData;
}
