import { describe, expect, it, vi } from 'vitest';

import {
  buildKakaoExternalBrowserUrl,
  isKakaoInAppBrowser,
  offerKakaoExternalBrowser
} from '../src/lib/util/kakaoExternalBrowser.js';

describe('KakaoTalk external browser handoff', () => {
  it('detects KakaoTalk webviews only', () => {
    expect(isKakaoInAppBrowser('Mozilla/5.0 KAKAOTALK/26.6.1 (INAPP)')).toBe(true);
    expect(isKakaoInAppBrowser('Mozilla/5.0 Chrome/150 Mobile Safari/537.36')).toBe(false);
  });

  it('builds the KakaoTalk external-browser scheme for safe web URLs', () => {
    expect(buildKakaoExternalBrowserUrl('https://www.dgst.me/board/free?x=한글#reply')).toBe(
      `kakaotalk://web/openExternal?url=${encodeURIComponent(
        'https://www.dgst.me/board/free?x=한글#reply'
      )}`
    );
    expect(buildKakaoExternalBrowserUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('prompts once and navigates only after confirmation', async () => {
    const values = new Map();
    const storage = {
      getItem: vi.fn((key) => values.get(key) ?? null),
      setItem: vi.fn((key, value) => values.set(key, value))
    };
    const confirm = vi.fn().mockResolvedValue(true);
    const navigate = vi.fn();
    const input = {
      userAgent: 'KAKAOTALK/26.6.1',
      href: 'https://www.dgst.me/',
      storage,
      confirm,
      navigate
    };

    await expect(offerKakaoExternalBrowser(input)).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledWith(
      `kakaotalk://web/openExternal?url=${encodeURIComponent('https://www.dgst.me/')}`
    );

    await expect(offerKakaoExternalBrowser(input)).resolves.toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('stays in the KakaoTalk webview when confirmation is cancelled', async () => {
    const navigate = vi.fn();
    const confirm = vi.fn().mockResolvedValue(false);

    await expect(
      offerKakaoExternalBrowser({
        userAgent: 'KAKAOTALK/26.6.1',
        href: 'https://www.dgst.me/',
        storage: { getItem: () => null, setItem: () => {} },
        confirm,
        navigate
      })
    ).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
