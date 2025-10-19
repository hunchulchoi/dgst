import { json, error } from '@sveltejs/kit';

/**
 * Open Graph 메타데이터 가져오기 API
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request }) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      throw error(400, 'URL이 필요합니다.');
    }

    console.log('🔍 OG 메타데이터 가져오기:', url);

    // URL fetch
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DGSTBot/1.0; +https://dgst.me)'
      }
    });

    if (!response.ok) {
      throw error(500, 'URL을 가져올 수 없습니다.');
    }

    const html = await response.text();

    // OG 메타데이터 추출
    const ogData = {
      title: extractMeta(html, 'og:title') || extractTitle(html),
      description: extractMeta(html, 'og:description') || extractMeta(html, 'description'),
      image: extractMeta(html, 'og:image'),
      url: extractMeta(html, 'og:url') || url,
      siteName: extractMeta(html, 'og:site_name')
    };

    console.log('✅ OG 메타데이터:', ogData);

    return json(ogData);
  } catch (err) {
    console.error('❌ OG 메타데이터 가져오기 실패:', err);
    throw error(500, 'OG 메타데이터를 가져올 수 없습니다.');
  }
}

/**
 * HTML에서 메타 태그 추출
 * @param {string} html
 * @param {string} property
 * @returns {string | null}
 */
function extractMeta(html, property) {
  const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
  const match = html.match(regex);
  return match ? match[1] : null;
}

/**
 * HTML에서 title 태그 추출
 * @param {string} html
 * @returns {string | null}
 */
function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1] : null;
}

