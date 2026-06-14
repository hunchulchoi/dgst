import { error, json } from '@sveltejs/kit';
import { assertSafeFetchUrl } from '$lib/server/fetchUrlSafety.js';
import { getJson, setJson } from '$lib/server/cache/pgCache.js';
import { decodeOgTextFields, parseOpenGraphData } from '$lib/server/ogMetadata.js';

const OG_NS = 'og';
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
  } catch {
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
    const cached = await getJson(cacheKey, OG_NS);
    if (cached) {
      console.log(`✅ [pgCache Hit] OG 데이터 반환: ${safeUrl}`);
      return json(decodeOgTextFields(cached));
    } else {
      logger.warn({
        message: `🐌 [pgCache Miss] 캐시가 없습니다. 외부 서버 통신을 시도합니다.`,
        targetUrl: safeUrl,
        endpoint: '/api/og'
      });
    }
  } catch (err) {
    console.error(`🚨 pgCache 조회 실패 (${safeUrl}):`, err);
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
    const ogData = decodeOgTextFields(parseOpenGraphData(html, safeUrl));

    // 성공한 데이터에 한정해 레디스에 3시간(10800초) 캐시
    try {
      await setJson(cacheKey, ogData, 10800, OG_NS);
      console.log(`💾 [pgCache Miss] OG 데이터 캐싱 완료: ${safeUrl}`);
    } catch (cacheError) {
      console.error(`🚨 pgCache 저장 실패 (${safeUrl}):`, cacheError);
    }

    return json(ogData);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`OG 데이터 가져오기 실패 (${safeUrl}):`, errorMessage);

    // 에러 발생 시 500 대신 기본 폴백 데이터를 반환하도록 수정 (의도적인 봇 차단 등 방어)
    let hostname = safeUrl;
    try {
      hostname = new URL(safeUrl).hostname;
    } catch {}

    return json(
      decodeOgTextFields({
        title: hostname,
        description: '',
        image: '',
        url: safeUrl,
        siteName: hostname,
        favicon: ''
      })
    );
  }
}
