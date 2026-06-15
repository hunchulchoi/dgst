export const LONG_IMAGE_RATIO_THRESHOLD = 2.5;
export const DEFAULT_ATTACHMENT_IMAGE_MAX_HEIGHT = '72dvh';
export const MOBILE_ATTACHMENT_VIEWPORT_MAX_WIDTH = 767;

/**
 * @param {{ naturalWidth?: number; naturalHeight?: number } | null | undefined} img
 */
function isPortraitImage(img) {
  return Boolean(img?.naturalWidth && img?.naturalHeight && img.naturalHeight > img.naturalWidth);
}

/**
 * @param {{ viewportWidth?: number } | undefined} options
 */
function getViewportWidth(options) {
  return options?.viewportWidth ?? globalThis.window?.innerWidth;
}

/**
 * @param {{ naturalWidth?: number; naturalHeight?: number } | null | undefined} img
 * @param {{ viewportWidth?: number }} [options]
 */
function shouldUseMobilePortraitSizing(img, options) {
  const viewportWidth = getViewportWidth(options);
  return Boolean(
    viewportWidth &&
      viewportWidth <= MOBILE_ATTACHMENT_VIEWPORT_MAX_WIDTH &&
      isPortraitImage(img) &&
      img?.naturalHeight &&
      img?.naturalWidth &&
      img.naturalHeight < img.naturalWidth * LONG_IMAGE_RATIO_THRESHOLD
  );
}

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
  if (img?.classList?.contains?.('comment-upload-preview')) return false;
  return !img?.closest?.('.og-card-blot, .og-preview');
}

/**
 * @param {{ maxWidth?: string; maxHeight?: string; width?: string; height?: string; removeProperty?: (name: string) => void }} style
 * @param {{ naturalWidth?: number; naturalHeight?: number } | null | undefined} img
 * @param {{ viewportWidth?: number }} [options]
 */
export function applyAttachmentImageSizing(style, img, options) {
  style.maxWidth = '100%';
  style.width = 'auto';
  style.height = 'auto';

  if (shouldUseMobilePortraitSizing(img, options)) {
    style.removeProperty?.('max-height');
    return;
  }

  const maxHeight = getAttachmentImageMaxHeight(img);
  if (maxHeight) {
    style.maxHeight = maxHeight;
  } else {
    style.removeProperty?.('max-height');
  }
}
