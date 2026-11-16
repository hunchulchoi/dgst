/**
 * 봇에게 유튜브를 보여주는 도우미. 영상 자체는 못 보니 제목·채널(oEmbed)과 썸네일만.
 * scripts/bot-cli.js에서도 쓰므로 $lib import 없이 둔다.
 */

const ID_RE = /^[\w-]{11}$/;
const OEMBED_TIMEOUT_MS = 5_000;
const THUMB_MAX_BYTES = 2 * 1024 * 1024;
const CACHE_MAX = 500;

/** @type {Map<string, { id: string, title: string, channel: string } | null>} */
const infoCache = new Map();

/** @param {string} url */
export function youtubeIdFromUrl(url) {
  let u;
  try {
    u = new URL(String(url).replace(/&amp;/g, '&'));
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname);
    id = m ? m[1] : u.pathname === '/watch' ? u.searchParams.get('v') : null;
  }
  return id && ID_RE.test(id) ? id : null;
}

/**
 * 본문 HTML에 들어간 유튜브 영상 id (iframe, 링크, 맨 URL 순서대로, 중복 제거).
 * @param {string} html
 * @returns {string[]}
 */
export function youtubeIds(html) {
  /** @type {string[]} */
  const out = [];
  const re = /https?:\/\/(?:www\.|m\.)?(?:youtube(?:-nocookie)?\.com|youtu\.be)\/[^\s"'<>]+/gi;
  for (const m of String(html ?? '').matchAll(re)) {
    const id = youtubeIdFromUrl(m[0]);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** @param {string} id */
export const youtubeThumbUrl = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/**
 * 제목과 채널명. 실패하면 null (비공개·삭제 영상 등).
 * @param {string} id
 */
export async function fetchYoutubeInfo(id) {
  if (!ID_RE.test(id)) return null;
  if (infoCache.has(id)) return infoCache.get(id) ?? null;
  let info = null;
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${id}`
    )}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS) });
    if (res.ok) {
      const data = await res.json();
      const title = String(data?.title ?? '').trim();
      if (title) info = { id, title, channel: String(data?.author_name ?? '').trim() };
    }
  } catch {
    info = null;
  }
  if (infoCache.size >= CACHE_MAX) infoCache.delete(infoCache.keys().next().value ?? '');
  infoCache.set(id, info);
  return info;
}

/**
 * @param {string} id
 * @returns {Promise<string | null>} base64 JPEG
 */
export async function loadYoutubeThumb(id) {
  if (!ID_RE.test(id)) return null;
  try {
    const res = await fetch(youtubeThumbUrl(id), {
      signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS)
    });
    if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/jpeg')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length && buf.length <= THUMB_MAX_BYTES ? buf.toString('base64') : null;
  } catch {
    return null;
  }
}

/** @param {{ title: string, channel: string } | null} info */
export const youtubeLabel = (info) =>
  info ? `"${info.title}"${info.channel ? ` - ${info.channel}` : ''}` : '(제목 모름)';

/**
 * 본문 HTML의 유튜브 iframe을 `[유튜브 N: "제목" - 채널]` 글자로 바꾸고, 영상 목록을 돌려준다.
 * 링크로만 들어간 유튜브도 목록에는 넣는다.
 * @param {string} html
 * @param {number} [max]
 */
export async function describeYoutube(html, max = 4) {
  const ids = youtubeIds(html).slice(0, max);
  const videos = await Promise.all(
    ids.map(async (id, i) => ({ n: i + 1, id, info: await fetchYoutubeInfo(id) }))
  );
  const byId = new Map(videos.map((v) => [v.id, v]));
  const replaced = String(html ?? '').replace(
    /<iframe\b[^>]*\bsrc="([^"]+)"[^>]*>(?:\s*<\/iframe>)?/gi,
    (tag, src) => {
      const v = byId.get(youtubeIdFromUrl(src) ?? '');
      return v ? ` [유튜브 ${v.n}: ${youtubeLabel(v.info)}] ` : tag;
    }
  );
  return { html: replaced, videos };
}
