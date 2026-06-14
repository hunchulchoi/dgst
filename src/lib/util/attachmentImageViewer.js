export const VIEWER_MAX_SCALE = 4;
const VIEWER_VIEWPORT_PADDING = 0.92;
const VIEWER_VIEWPORT_HEIGHT_PADDING = 0.82;
const MOBILE_VIEWER_BREAKPOINT = 768;

/**
 * @param {number} value
 * @param {number} minScale
 * @param {number} [maxScale=VIEWER_MAX_SCALE]
 */
export function clampViewerScale(value, minScale, maxScale = VIEWER_MAX_SCALE) {
  return Math.min(maxScale, Math.max(minScale, value));
}

/**
 * @param {{ naturalWidth?: number; naturalHeight?: number } | null | undefined} img
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 */
export function computeFitScale(img, viewportWidth, viewportHeight) {
  if (!img?.naturalWidth || !img?.naturalHeight || !viewportWidth || !viewportHeight) return 1;

  const widthScale = (viewportWidth * VIEWER_VIEWPORT_PADDING) / img.naturalWidth;
  const heightScale = (viewportHeight * VIEWER_VIEWPORT_HEIGHT_PADDING) / img.naturalHeight;

  if (viewportWidth < MOBILE_VIEWER_BREAKPOINT && img.naturalHeight > img.naturalWidth) {
    return Math.min(1, widthScale);
  }

  return Math.min(1, widthScale, heightScale);
}

/**
 * @param {{ dataset?: { attachmentImage?: string }; classList?: { contains?: (name: string) => boolean }; closest?: (selector: string) => unknown }} img
 */
export function shouldOpenAttachmentImageViewer(img) {
  if (img?.dataset?.attachmentImage !== 'true') return false;
  if (img?.classList?.contains?.('comment-avatar')) return false;
  if (img?.classList?.contains?.('comment-upload-preview')) return false;
  return !img?.closest?.('.og-card-blot, .og-preview');
}

/**
 * @param {{ ctrlKey?: boolean; metaKey?: boolean }} event
 */
export function shouldHandleViewerZoomWheel(event) {
  return Boolean(event?.ctrlKey || event?.metaKey);
}

/**
 * @param {{ closest?: (selector: string) => unknown } | null | undefined} target
 */
export function shouldCloseViewerOnStageClick(target) {
  return !target?.closest?.('[data-image-viewer-toolbar="true"]');
}
