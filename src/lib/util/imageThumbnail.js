const LOCAL_IMAGE_PREFIX = '/images/';

/**
 * Requests a server-generated thumbnail for locally uploaded images.
 * External profile URLs and bundled icons are returned unchanged.
 *
 * @param {string | null | undefined} source
 * @param {number} [size=80]
 */
export function imageThumbnailUrl(source, size = 80) {
  if (typeof source !== 'string' || !source.startsWith(LOCAL_IMAGE_PREFIX)) return source;

  const url = new URL(source, 'https://dgst.local');
  url.searchParams.set('thumbnail', String(size));
  url.searchParams.set('animated', '1');
  return `${url.pathname}${url.search}${url.hash}`;
}
