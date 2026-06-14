export const LONG_IMAGE_RATIO_THRESHOLD = 1.8;
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
