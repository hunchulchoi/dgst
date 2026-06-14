import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ATTACHMENT_IMAGE_MAX_HEIGHT,
  LONG_IMAGE_RATIO_THRESHOLD,
  getAttachmentImageMaxHeight
} from '../src/lib/util/attachmentImageSizing.js';

describe('attachment image sizing', () => {
  it('caps regular phone-ratio images to the viewport height budget', () => {
    expect(getAttachmentImageMaxHeight({ naturalWidth: 1080, naturalHeight: 1920 })).toBe(
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
});
