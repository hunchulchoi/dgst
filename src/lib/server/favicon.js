const PRIMARY_HOSTNAME = 'www.dgst.me';

const PINK_FAVICON_REPLACEMENTS = [
  ['https://www.dgst.me/favicon/favicon.ico', '/favicon/favicon-pink-32x32.png'],
  ['apple-icon-180x180.png', 'apple-icon-pink-180x180.png'],
  ['android-icon-192x192.png', 'android-icon-pink-192x192.png'],
  ['favicon-32x32.png', 'favicon-pink-32x32.png'],
  ['manifest.json', 'manifest-pink.json']
];

/** @param {string} hostname */
export function shouldUsePinkFavicon(hostname) {
  return hostname.toLowerCase() !== PRIMARY_HOSTNAME;
}

/** @param {string} html @param {string} hostname */
export function applyHostnameFavicon(html, hostname) {
  if (!shouldUsePinkFavicon(hostname)) return html;

  return PINK_FAVICON_REPLACEMENTS.reduce(
    (result, [current, replacement]) => result.replaceAll(current, replacement),
    html
  );
}

/** @param {string} pathname @param {string} hostname */
export function faviconRedirectTarget(pathname, hostname) {
  if (shouldUsePinkFavicon(hostname)) {
    return pathname === '/favicon.ico'
      ? '/favicon/favicon-pink-32x32.png'
      : '/favicon/apple-icon-pink-180x180.png';
  }

  return pathname === '/favicon.ico' ? '/favicon/favicon.ico' : '/favicon/apple-icon-180x180.png';
}
