import { describe, expect, it } from 'vitest';
import {
  applyHostnameFavicon,
  faviconRedirectTarget,
  shouldUsePinkFavicon
} from '../src/lib/server/favicon.js';

describe('hostname-specific favicon', () => {
  it('keeps the original favicon only on the exact production hostname', () => {
    expect(shouldUsePinkFavicon('www.dgst.me')).toBe(false);
    expect(shouldUsePinkFavicon('next.dgst.me')).toBe(true);
    expect(shouldUsePinkFavicon('dgst.me')).toBe(true);
    expect(shouldUsePinkFavicon('localhost')).toBe(true);
  });

  it('replaces every favicon link outside www.dgst.me', () => {
    const html = [
      'https://www.dgst.me/favicon/favicon.ico',
      '/favicon/apple-icon-180x180.png',
      '/favicon/android-icon-192x192.png',
      '/favicon/favicon-32x32.png',
      '/favicon/manifest.json'
    ].join('\n');

    const transformed = applyHostnameFavicon(html, 'next.dgst.me');

    expect(transformed).toContain('/favicon/favicon-pink-32x32.png');
    expect(transformed).toContain('/favicon/apple-icon-pink-180x180.png');
    expect(transformed).toContain('/favicon/android-icon-pink-192x192.png');
    expect(transformed).toContain('/favicon/manifest-pink.json');
    expect(transformed).not.toContain('apple-icon-180x180.png');
  });

  it('uses the matching icon for direct browser requests', () => {
    expect(faviconRedirectTarget('/favicon.ico', 'www.dgst.me')).toBe('/favicon/favicon.ico');
    expect(faviconRedirectTarget('/favicon.ico', 'localhost')).toBe(
      '/favicon/favicon-pink-32x32.png'
    );
    expect(faviconRedirectTarget('/apple-touch-icon.png', 'next.dgst.me')).toBe(
      '/favicon/apple-icon-pink-180x180.png'
    );
  });
});
