import { error, json } from '@sveltejs/kit';
import { assertSafeFetchUrl } from '$lib/server/fetchUrlSafety.js';
import { getJson, setJson } from '$lib/server/redis/client.js';
import logger from '$lib/util/logger.js';

/**
 * Open Graph 데이터를 가져오는 API
 * @param {import('@sveltejs/kit').RequestEvent} event - 요청 이벤트 객체
 * @returns {Promise<Response>} OG 데이터 JSON 응답
 */
export async function GET({ url, locals }) {
  const session = await locals.auth();
  if (!session?.user?.nickname) {
    throw error(401, { message: '로그인이 필요합니다.' });
  }

  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return json({ error: 'URL parameter is required' }, { status: 400 });
  }

  return await fetchOGData(targetUrl);
}

/**
 * POST 요청으로 Open Graph 데이터를 가져오는 API
 * @param {import('@sveltejs/kit').RequestEvent} event - 요청 이벤트 객체
 * @returns {Promise<Response>} OG 데이터 JSON 응답
 */
export async function POST({ request, locals }) {
  const session = await locals.auth();
  if (!session?.user?.nickname) {
    throw error(401, { message: '로그인이 필요합니다.' });
  }

  try {
    const { url: targetUrl } = await request.json();

    if (!targetUrl) {
      return json({ error: 'URL is required' }, { status: 400 });
    }

    return await fetchOGData(targetUrl);
  } catch (err) {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}

/**
 * Open Graph 데이터를 실제로 가져오는 공통 함수
 * @param {string} targetUrl - 대상 URL
 * @returns {Promise<Response>} OG 데이터 JSON 응답
 */
async function fetchOGData(targetUrl) {
  const urlCheck = await assertSafeFetchUrl(targetUrl);
  if (!urlCheck.ok) {
    return json({ error: urlCheck.message }, { status: urlCheck.status });
  }
  const safeUrl = urlCheck.url.href;

  const cacheKey = `og_cache:${safeUrl}`;
  try {
    const cached = await getJson(cacheKey);
    if (cached) {
      console.log(`✅ [Redis Cache Hit] OG 데이터 반환: ${safeUrl}`);
      return json(cached);
    } else {
      logger.warn({
        message: `🐌 [Redis Cache Miss] 캐시가 없습니다. 외부 서버 통신을 시도합니다.`,
        targetUrl: safeUrl,
        endpoint: '/api/og'
      });
    }
  } catch (err) {
    console.error(`🚨 Redis 캐시 조회 실패 (${safeUrl}):`, err);
  }

  try {
    // 타겟 URL에서 HTML 가져오기
    const response = await fetch(safeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DGSTBot/1.0; +https://dgst.me)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        DNT: '1',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      signal: AbortSignal.timeout(3000) // 3초 타임아웃
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // Open Graph 메타 태그 파싱
    const ogData = parseOpenGraphData(html, safeUrl);

    // 성공한 데이터에 한정해 레디스에 3시간(10800초) 캐시
    try {
      await setJson(cacheKey, ogData, 10800);
      console.log(`💾 [Redis Cache Miss] OG 데이터 캐싱 완료: ${safeUrl}`);
    } catch (e) {
      console.error(`🚨 Redis 캐시 저장 실패 (${safeUrl}):`, e);
    }

    return json(ogData);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`OG 데이터 가져오기 실패 (${safeUrl}):`, errorMessage);

    // 에러 발생 시 500 대신 기본 폴백 데이터를 반환하도록 수정 (의도적인 봇 차단 등 방어)
    let hostname = safeUrl;
    try {
      hostname = new URL(safeUrl).hostname;
    } catch (e) { }

    return json({
      title: hostname,
      description: '',
      image: '',
      url: safeUrl,
      siteName: hostname,
      favicon: ''
    });
  }
}

/**
 * HTML에서 Open Graph 메타 태그를 파싱하는 함수
 * @param {string} html - HTML 문자열
 * @param {string} baseUrl - 기본 URL
 * @returns {Object} 파싱된 OG 데이터
 */
function parseOpenGraphData(html, baseUrl) {
  const ogData = {
    title: '',
    description: '',
    image: '',
    url: baseUrl,
    siteName: '',
    favicon: ''
  };

  // 정규식으로 메타 태그 추출
  const metaRegex = /<meta[^>]+>/gi;
  const metaTags = html.match(metaRegex) || [];

  for (const tag of metaTags) {
    // property와 content 추출
    const propertyMatch = tag.match(/property=["']([^"']+)["']/i);
    const contentMatch = tag.match(/content=["']([^"']+)["']/i);
    const nameMatch = tag.match(/name=["']([^"']+)["']/i);

    if (!contentMatch) continue;

    const content = contentMatch[1];
    const property = propertyMatch ? propertyMatch[1] : '';
    const name = nameMatch ? nameMatch[1] : '';

    // Open Graph 태그 처리
    if (property.startsWith('og:')) {
      switch (property) {
        case 'og:title':
          ogData.title = content;
          break;
        case 'og:description':
          ogData.description = content;
          break;
        case 'og:image':
          ogData.image = resolveUrl(content, baseUrl);
          break;
        case 'og:url':
          ogData.url = content;
          break;
        case 'og:site_name':
          ogData.siteName = content;
          break;
      }
    }

    // 일반 메타 태그도 확인 (fallback)
    if (name === 'title' && !ogData.title) {
      ogData.title = content;
    }
    if (name === 'description' && !ogData.description) {
      ogData.description = content;
    }
  }

  // title 태그에서 제목 추출 (fallback)
  if (!ogData.title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      ogData.title = titleMatch[1].trim();
    }
  }

  // 설명이 없으면 기본값 설정
  if (!ogData.description) {
    ogData.description = '링크를 클릭하여 내용을 확인하세요.';
  }

  ogData.description = ogData.description.substring(0, 50);

  // 제목이 없으면 URL 사용
  if (!ogData.title) {
    try {
      const urlObj = new URL(baseUrl);
      ogData.title = urlObj.hostname;
    } catch (error) {
      ogData.title = baseUrl;
    }
  }

  // favicon 추출
  const favicon = html.match(/<link[^>]+rel=["']icon["'][^>]+>/i);
  if (favicon) {
    const hrefMatch = favicon[0].match(/href=["']([^"']+)["']/i);
    if (hrefMatch) {
      ogData.favicon = resolveUrl(hrefMatch[1], baseUrl);
    }
  }

  if (!ogData.siteName) {
    ogData.siteName = new URL(baseUrl).hostname;
  }

  return ogData;
}

/**
 * 상대 URL을 절대 URL로 변환하는 함수
 * @param {string} url - 변환할 URL
 * @param {string} baseUrl - 기본 URL
 * @returns {string} 절대 URL
 */
function resolveUrl(url, baseUrl) {
  if (!url) return '';

  // 이미 절대 URL인 경우
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // 프로토콜 상대 URL인 경우
  if (url.startsWith('//')) {
    return 'https:' + url;
  }

  try {
    const base = new URL(baseUrl);

    // 절대 경로인 경우
    if (url.startsWith('/')) {
      return `${base.protocol}//${base.host}${url}`;
    }

    // 상대 경로인 경우
    return new URL(url, baseUrl).href;
  } catch (error) {
    return url;
  }
}
