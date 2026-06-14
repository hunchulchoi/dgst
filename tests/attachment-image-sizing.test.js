import { describe, expect, it } from 'vitest';

import {
  applyAttachmentImageSizing,
  DEFAULT_ATTACHMENT_IMAGE_MAX_HEIGHT,
  LONG_IMAGE_RATIO_THRESHOLD,
  getAttachmentImageMaxHeight,
  shouldApplyAttachmentImageSizing
} from '../src/lib/util/attachmentImageSizing.js';

describe('attachment image sizing', () => {
  it('caps regular phone-ratio images to the viewport height budget', () => {
    expect(getAttachmentImageMaxHeight({ naturalWidth: 1080, naturalHeight: 1920 })).toBe(
      DEFAULT_ATTACHMENT_IMAGE_MAX_HEIGHT
    );
  });

  it('still caps tall phone screenshots that are not true long images', () => {
    expect(getAttachmentImageMaxHeight({ naturalWidth: 960, naturalHeight: 2079 })).toBe(
      DEFAULT_ATTACHMENT_IMAGE_MAX_HEIGHT
    );
  });

  it('still caps ultra-wide phone screenshots such as 21:9 displays', () => {
    expect(getAttachmentImageMaxHeight({ naturalWidth: 900, naturalHeight: 2100 })).toBe(
      DEFAULT_ATTACHMENT_IMAGE_MAX_HEIGHT
    );
  });

  it('does not cap long images once they cross the long-image threshold', () => {
    expect(
      getAttachmentImageMaxHeight({
        naturalWidth: 1000,
        naturalHeight: Math.ceil(1000 * LONG_IMAGE_RATIO_THRESHOLD)
      })
    ).toBeUndefined();
  });

  it('does not cap unloaded images', () => {
    expect(getAttachmentImageMaxHeight({ naturalWidth: 0, naturalHeight: 0 })).toBeUndefined();
  });

  it('forces attachment images to keep their intrinsic size when width attributes exist', () => {
    const style = {
      maxWidth: '',
      maxHeight: '',
      width: '',
      height: '',
      /** @param {string} prop */
      removeProperty(prop) {
        if (prop === 'max-height') this.maxHeight = '';
      }
    };

    applyAttachmentImageSizing(style, { naturalWidth: 1080, naturalHeight: 1920 });

    expect(style.maxWidth).toBe('100%');
    expect(style.maxHeight).toBe(DEFAULT_ATTACHMENT_IMAGE_MAX_HEIGHT);
    expect(style.width).toBe('auto');
    expect(style.height).toBe('auto');
  });

  it('does not treat comment avatars as attachment images', () => {
    expect(
      shouldApplyAttachmentImageSizing({
        classList: { contains: (name) => name === 'comment-avatar' },
        closest: () => null
      })
    ).toBe(false);
  });
});
