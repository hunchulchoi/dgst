export const LONG_IMAGE_RATIO_THRESHOLD = 2.5;
export const DEFAULT_ATTACHMENT_IMAGE_MAX_HEIGHT = '72dvh';

/**
 * @param {{ naturalWidth?: number; naturalHeight?: number } | null | undefined} img
 * @returns {string | undefined}
 */
export function getAttachmentImageMaxHeight(img) {
  if (!img?.naturalWidth || !img?.naturalHeight) return undefined;
  if (img.naturalHeight >= img.naturalWidth * LONG_IMAGE_RATIO_THRESHOLD) return undefined;
  return DEFAULT_ATTACHMENT_IMAGE_MAX_HEIGHT;
}

/**
 * @param {{ classList?: { contains?: (name: string) => boolean }; closest?: (selector: string) => unknown }} img
 * @returns {boolean}
 */
export function shouldApplyAttachmentImageSizing(img) {
  if (img?.classList?.contains?.('comment-avatar')) return false;
  return !img?.closest?.('.og-card-blot, .og-preview');
}

/**
 * @param {{ maxWidth?: string; maxHeight?: string; width?: string; height?: string; removeProperty?: (name: string) => void }} style
 * @param {{ naturalWidth?: number; naturalHeight?: number } | null | undefined} img
 */
export function applyAttachmentImageSizing(style, img) {
  style.maxWidth = '100%';
  style.width = 'auto';
  style.height = 'auto';

  const maxHeight = getAttachmentImageMaxHeight(img);
  if (maxHeight) {
    style.maxHeight = maxHeight;
  } else {
    style.removeProperty?.('max-height');
  }
}
