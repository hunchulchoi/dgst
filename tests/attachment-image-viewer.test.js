import { describe, expect, it } from 'vitest';

import {
  clampViewerScale,
  computeFitScale,
  shouldCloseViewerOnStageClick,
  shouldHandleViewerZoomWheel,
  shouldOpenAttachmentImageViewer
} from '../src/lib/util/attachmentImageViewer.js';

describe('attachment image viewer', () => {
  it('opens for rendered attachment images', () => {
    expect(
      shouldOpenAttachmentImageViewer({
        dataset: { attachmentImage: 'true' },
        classList: { contains: () => false },
        closest: () => null
      })
    ).toBe(true);
  });

  it('does not open for comment avatars', () => {
    expect(
      shouldOpenAttachmentImageViewer({
        dataset: { attachmentImage: 'true' },
        classList: { contains: (name) => name === 'comment-avatar' },
        closest: () => null
      })
    ).toBe(false);
  });

  it('does not open for comment upload previews', () => {
    expect(
      shouldOpenAttachmentImageViewer({
        dataset: { attachmentImage: 'true' },
        classList: { contains: (name) => name === 'comment-upload-preview' },
        closest: () => null
      })
    ).toBe(false);
  });

  it('computes a fit scale that never enlarges smaller images', () => {
    expect(computeFitScale({ naturalWidth: 600, naturalHeight: 400 }, 1200, 900)).toBe(1);
  });

  it('computes a fit scale for large images within the viewport budget', () => {
    expect(computeFitScale({ naturalWidth: 2000, naturalHeight: 1000 }, 1000, 800)).toBeCloseTo(
      0.46,
      2
    );
  });

  it('clamps zoom between the fit scale and the max scale', () => {
    expect(clampViewerScale(0.2, 0.5, 4)).toBe(0.5);
    expect(clampViewerScale(5, 0.5, 4)).toBe(4);
    expect(clampViewerScale(2, 0.5, 4)).toBe(2);
  });

  it('zooms only when ctrl or meta is pressed during wheel input', () => {
    expect(shouldHandleViewerZoomWheel({ ctrlKey: true, metaKey: false })).toBe(true);
    expect(shouldHandleViewerZoomWheel({ ctrlKey: false, metaKey: true })).toBe(true);
    expect(shouldHandleViewerZoomWheel({ ctrlKey: false, metaKey: false })).toBe(false);
  });

  it('closes the viewer when the stage layer is clicked, including on the image itself', () => {
    expect(
      shouldCloseViewerOnStageClick({
        closest: () => null
      })
    ).toBe(true);
  });

  it('does not close from toolbar interactions', () => {
    expect(
      shouldCloseViewerOnStageClick({
        closest: (selector) => (selector === '[data-image-viewer-toolbar="true"]' ? {} : null)
      })
    ).toBe(false);
  });
});
