import { swalFire } from '$lib/util/swal.js';

const KAKAO_EXTERNAL_BROWSER_PROMPT_KEY = 'dgst:kakao-external-browser-prompt:v1';

/** @param {string | undefined} userAgent */
export function isKakaoInAppBrowser(userAgent) {
  return typeof userAgent === 'string' && /KAKAOTALK/i.test(userAgent);
}

/**
 * @param {string} href
 * @returns {string | undefined}
 */
export function buildKakaoExternalBrowserUrl(href) {
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return `kakaotalk://web/openExternal?url=${encodeURIComponent(decodeURI(url.href))}`;
  } catch {
    return undefined;
  }
}

/**
 * 테스트 가능한 카카오 외부 브라우저 전환 흐름.
 * @param {{
 *   userAgent: string,
 *   href: string,
 *   storage?: Pick<Storage, 'getItem' | 'setItem'>,
 *   confirm: () => Promise<boolean>,
 *   navigate: (url: string) => void
 * }} options
 */
export async function offerKakaoExternalBrowser({ userAgent, href, storage, confirm, navigate }) {
  if (!isKakaoInAppBrowser(userAgent)) return false;

  const externalUrl = buildKakaoExternalBrowserUrl(href);
  if (!externalUrl) return false;

  try {
    if (storage?.getItem(KAKAO_EXTERNAL_BROWSER_PROMPT_KEY) === '1') return false;
    storage?.setItem(KAKAO_EXTERNAL_BROWSER_PROMPT_KEY, '1');
  } catch {
    // 저장소가 막힌 웹뷰에서도 안내는 계속 진행한다.
  }

  const isConfirmed = await confirm();
  if (!isConfirmed) return false;

  navigate(externalUrl);
  return true;
}

/** 카카오톡 인앱 브라우저에서는 세션당 한 번 외부 브라우저 전환을 제안한다. */
export async function promptKakaoExternalBrowser() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  try {
    return await offerKakaoExternalBrowser({
      userAgent: navigator.userAgent,
      href: window.location.href,
      storage: window.sessionStorage,
      confirm: async () => {
        const result = await swalFire({
          icon: 'info',
          title: '외부 브라우저에서 열까요?',
          text: '카카오톡 내부 브라우저보다 Chrome 또는 Safari에서 더 안정적으로 이용할 수 있습니다.',
          showCancelButton: true,
          confirmButtonText: '외부 브라우저로 열기',
          cancelButtonText: '여기서 계속'
        });
        return result.isConfirmed === true;
      },
      navigate: (url) => {
        window.location.href = url;
      }
    });
  } catch {
    // 안내 실패가 페이지 진입을 막지 않게 한다.
    return false;
  }
}
