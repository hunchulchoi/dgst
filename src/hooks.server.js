import { SvelteKitAuth } from '@auth/sveltekit';
import { env as privateEnv } from '$env/dynamic/private';
import { getPrisma } from '$lib/database/prisma.js';
import { getPrismaAdapter } from '$lib/server/auth/prismaAdapter.js';
import { createAuthProviders } from '$lib/server/auth/providers.js';
import { checkAuthRateLimit } from '$lib/server/auth/rateLimit.js';
import { shouldRejectCrossOriginRequest } from '$lib/server/auth/requestOrigin.js';
import { evaluateAuthSignIn, resolveSafeAuthRedirect } from '$lib/server/auth/authPolicy.js';
import crypto from 'crypto';
import { redirect, json } from '@sveltejs/kit';
import logger from '$lib/util/logger';
import { serializeError, traceFromUnknown } from '$lib/util/formatErrorTrace.js';
import { warmupConnections } from '$lib/server/warmup.js';
import { isBoardHtmlPath } from '$lib/util/boardPaths.js';
import { BOARD_UPLOAD_MAX_BYTES } from '$lib/util/uploadLimits.js';
import { applyHostnameFavicon, faviconRedirectTarget } from '$lib/server/favicon.js';

warmupConnections();

/** @type {Map<string, number>} */
const cache = new Map();

/** @param {string} key */
export function depends(key) {
  cache.set(key, new Date().getTime());
}

// SvelteKit 2 + @auth/sveltekit v1.x 호환
const providers = createAuthProviders({
  googleClientId: privateEnv.GOOGLE_CLIENT_ID,
  googleClientSecret: privateEnv.GOOGLE_CLIENT_SECRET,
  kakaoClientId: privateEnv.KAKAO_CLIENT_ID,
  kakaoClientSecret: privateEnv.KAKAO_CLIENT_SECRET
});

export const {
  handle: authHandle,
  signIn,
  signOut
} = SvelteKitAuth({
  providers,
  adapter: getPrismaAdapter(),
  pages: {
    newUser: '/auth/profile',
    signIn: '/login',
    error: '/login'
  },
  callbacks: {
    async signIn(params) {
      const decision = evaluateAuthSignIn({
        provider: params.account?.provider,
        user: params.user,
        profile: params.profile
      });

      if (!decision.allowed) {
        logger.error({
          message:
            decision.reason === 'user-denied'
              ? '로그인 실패: 차단된 사용자'
              : '로그인 실패: 이메일 미인증',
          provider: params.account?.provider
        });
      }

      return decision.allowed;
    },
    async session(params) {
      if (params.user) {
        params.session.user.nickname = params.user.nickname ?? params.session.user.nickname;
        params.session.user.introduce = params.user.introduce ?? params.session.user.introduce;
        params.session.user.photo = params.user.photo ?? params.session.user.photo;
      }
      return params.session;
    },
    async redirect(params) {
      return resolveSafeAuthRedirect(params.url, params.baseUrl);
    }
  },
  events: {
    async signIn(_message) {
      // signIn event
    },
    async signOut(_message) {
      // signOut event
    },
    async createUser(_message) {
      // createUser event
    },
    async updateUser(_message) {
      // updateUser event
    },
    async linkAccount(_message) {
      // linkAccount event
    },
    async session(_message) {
      // session event
    }
  },
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60
  },
  cookies: {
    sessionToken: {
      name:
        privateEnv.NODE_ENV === 'production'
          ? '__Secure-authjs.session-token'
          : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: privateEnv.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60
      }
    }
  },
  secret: privateEnv.NEXTAUTH_SECRET,
  trustHost: true,
  debug: false
});

const DEVICE_COOKIE_NAME = 'dgst_device';
const DEVICE_COOKIE_MAX_AGE_DAYS = 365;
const LOGIN_LOG_RETENTION_DAYS = 30;
const AUTH_SESSION_COOKIE_NAME =
  privateEnv.NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';

/** @param {import('@sveltejs/kit').RequestEvent} event */
const getRequestMeta = (event) => {
  return {
    method: event.request?.method
  };
};

// 우리의 handle 함수 (Auth 핸들러와 함께 사용)
/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const startTime = Date.now();
  const { pathname } = event.url;

  // 기기 식별용 UUID 쿠키 (없으면 생성 후 설정)
  let deviceId = event.cookies.get(DEVICE_COOKIE_NAME);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    event.cookies.set(DEVICE_COOKIE_NAME, deviceId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: privateEnv.NODE_ENV === 'production',
      maxAge: DEVICE_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60
    });
  }
  // cookie.get()은 string을 반환하므로 안전하게 문자열로 고정
  deviceId = String(deviceId);
  event.locals.deviceId = deviceId;

  // 브라우저/클라이언트가 요청하는 아이콘 경로 → favicon으로 리다이렉트
  const faviconRedirects = [
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
    '/favicon.ico'
  ];
  if (faviconRedirects.includes(pathname)) {
    return redirect(302, faviconRedirectTarget(pathname, event.url.hostname));
  }

  if (pathname.startsWith('/images/')) {
    depends('image-cache');
  }

  if (pathname.startsWith('/auth/') && event.request.method === 'POST') {
    const allowed = await checkAuthRateLimit(event);
    if (!allowed) {
      return json({ error: 'Too Many Requests' }, { status: 429 });
    }
  }

  if (
    shouldRejectCrossOriginRequest({
      method: event.request.method,
      requestOrigin: event.url.origin,
      origin: event.request.headers.get('origin'),
      secFetchSite: event.request.headers.get('sec-fetch-site')
    })
  ) {
    logger.warn({
      message: 'Blocked cross-origin unsafe request',
      event: 'security.csrf.blocked',
      pathname,
      ...getRequestMeta(event)
    });
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  logger.debug({
    message: 'http request',
    event: 'http.request',
    pathname,
    ...getRequestMeta(event)
  });

  // 본문 크기: 업로드 100MB, 글쓰기·댓글 POST 10MB.
  // adapter-node의 BODY_SIZE_LIMIT 전역 제한도 이 값 이상이어야 여기까지 도달한다.
  const maxBodySize = pathname.includes('/board/upload')
    ? BOARD_UPLOAD_MAX_BYTES
    : event.request.method === 'POST' &&
        (pathname.includes('/write') || pathname.endsWith('/comment'))
      ? 10 * 1024 * 1024
      : undefined;

  // 커스텀 resolve 함수 생성
  /** @type {Parameters<import('@sveltejs/kit').Handle>[0]['resolve']} */
  const customResolve = async (resolveEvent, opts = {}) => {
    const upstreamTransform = opts.transformPageChunk;

    return resolve(resolveEvent, {
      filterSerializedResponseHeaders: () => false,
      ...(maxBodySize && { bodySizeLimit: maxBodySize }),
      ...opts,
      transformPageChunk: async (chunk) => {
        const html = upstreamTransform ? await upstreamTransform(chunk) : chunk.html;
        return applyHostnameFavicon(html ?? chunk.html, resolveEvent.url.hostname);
      }
    });
  };

  // 카카오 콜백 해킹 제거 (표준 KakaoProvider 사용)

  // Auth 핸들러를 먼저 실행
  let authResponse;
  try {
    authResponse = await authHandle({ event, resolve: customResolve });
  } catch (authErr) {
    logger.error({
      message: 'Auth 처리 중 에러',
      pathname,
      ...getRequestMeta(event),
      error: serializeError(authErr)
    });
    throw authErr;
  }

  // 로그인 에러 페이지로 리다이렉트된 경우 (callback 실패 등) 서버에 error 로그
  try {
    const status = authResponse?.status;
    const location = authResponse?.headers?.get?.('location');
    if (status === 302 && location && location.includes('/login') && location.includes('error=')) {
      const url = new URL(location, event.url.origin);
      const errorType = url.searchParams.get('error') ?? '';
      const provider = pathname.startsWith('/auth/callback/')
        ? pathname.split('/').pop()
        : undefined;
      logger.error({
        message: '로그인 실패: Auth 리다이렉트',
        pathname,
        provider,
        ...getRequestMeta(event),
        errorType,
        callbackPath: pathname.startsWith('/auth/callback/') ? pathname : undefined
      });
    }
  } catch {
    // 로그 실패만 무시
  }

  // 로그인 성공 시(세션 쿠키 설정) login_logs 기록 (실패해도 인증 흐름 방해 금지)
  try {
    if (pathname.startsWith('/auth/callback/')) {
      const setCookies =
        authResponse?.headers?.getSetCookie?.() ??
        (authResponse?.headers?.get?.('set-cookie')
          ? [authResponse.headers.get('set-cookie')]
          : []);

      const didSetSessionCookie = Array.from(setCookies).some((c) =>
        typeof c === 'string' ? c.includes(`${AUTH_SESSION_COOKIE_NAME}=`) : false
      );

      if (didSetSessionCookie) {
        let userId = null;
        try {
          const prefix = `${AUTH_SESSION_COOKIE_NAME}=`;
          const cookieStr = Array.from(setCookies).find(
            (c) => typeof c === 'string' && c.startsWith(prefix)
          );
          if (cookieStr) {
            const sessionToken = cookieStr.slice(prefix.length).split(';')[0].trim();
            const adapter = getPrismaAdapter();
            const sessionAndUser = await adapter.getSessionAndUser?.(sessionToken);
            if (sessionAndUser?.user?.id) userId = sessionAndUser.user.id;
          }
        } catch (e) {
          logger.warn({ message: 'login_logs: getSessionAndUser failed', error: e });
        }

        if (userId) {
          const prisma = getPrisma();
          await prisma.loginLog.create({ data: { at: new Date(), userId } });
          await prisma.loginLog.deleteMany({
            where: {
              at: {
                lt: new Date(Date.now() - LOGIN_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
              }
            }
          });
        }
      }
    }
  } catch (e) {
    logger.warn({
      message: 'Failed to write login log',
      error: e,
      pathname
    });
  }

  const endTime = Date.now();
  const executionTime = endTime - startTime;
  const status = authResponse?.status || 200;

  const httpLogBase = {
    event: 'http.response',
    ...getRequestMeta(event),
    pathname,
    status,
    duration_ms: executionTime,
    method: event.request.method
  };

  if (
    executionTime >= 2000 &&
    !pathname.startsWith('/api/og') &&
    !pathname.startsWith('/auth/signin') &&
    !pathname.startsWith('/auth/callback')
  ) {
    logger.warn({
      message: 'http slow response',
      ...httpLogBase,
      slow_response: true,
      slow_tier: 'critical'
    });
  } else if (status >= 500 && !pathname.startsWith('/api/log')) {
    logger.error({
      message: 'http server error',
      ...httpLogBase
    });
  } else if (
    executionTime > 100 &&
    !pathname.startsWith('/api/og') &&
    !pathname.startsWith('/auth/signin') &&
    !pathname.startsWith('/auth/callback')
  ) {
    logger.warn({
      message: 'http slow response',
      ...httpLogBase,
      slow_response: true,
      slow_tier: 'warn'
    });
  } else {
    logger.info({
      message: 'http response',
      ...httpLogBase
    });
  }

  if (authResponse instanceof Response && isBoardHtmlPath(pathname)) {
    const contentType = authResponse.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) {
      const headers = new Headers(authResponse.headers);
      headers.set('Cache-Control', 'private, no-store, must-revalidate, max-age=0');
      headers.set('CDN-Cache-Control', 'no-store');

      return new Response(authResponse.body, {
        status: authResponse.status,
        statusText: authResponse.statusText,
        headers
      });
    }
  }

  return authResponse;
}

// 전역 에러 로깅
/** @type {import('@sveltejs/kit').HandleServerError} */
export function handleError({ event, error }) {
  /** @type {{ status?: number; message?: string; name?: string; cause?: unknown; body?: { message?: string; errorId?: string } }} */
  const serverError =
    typeof error === 'object' && error !== null
      ? /** @type {{ status?: number; message?: string; name?: string; cause?: unknown; body?: { message?: string; errorId?: string } }} */ (
          error
        )
      : /** @type {{ message?: string }} */ ({ message: String(error) });

  const body = serverError.body;

  const errorId = body?.errorId ?? crypto.randomUUID();
  const status = serverError.status ?? 500;
  const message =
    body?.message ??
    (serverError.cause instanceof Error
      ? serverError.cause.message
      : serverError.cause != null
        ? String(serverError.cause)
        : undefined) ??
    serverError.message ??
    'Unhandled server error';

  try {
    // apple-touch-icon 등 정상적인 404 요청은 로그하지 않음
    const pathname = event.url?.pathname || '';
    /*
    if (
      pathname.includes('apple-touch-icon') ||
      pathname.includes('favicon') ||
      pathname.includes('robots.txt')
    ) {
      return;
    }
    */

    const status = serverError.status ?? 500;
    // adapter-node는 ADDRESS_HEADER env 미설정 시 연결 상대(프록시/내부 IP)만 반환함. 헤더 폴백 사용
    const raw =
      event.request?.headers?.get?.('x-forwarded-for') ||
      event.request?.headers?.get?.('x-real-ip') ||
      '';
    const clientIp =
      (raw ? String(raw).split(',')[0].trim() : null) ||
      (event.getClientAddress ? event.getClientAddress() : null) ||
      'unknown';
    const userAgent = event.request?.headers?.get?.('user-agent') ?? '';
    const loggedAt = new Date().toISOString();
    const referer = event.request?.headers?.get?.('referer') ?? '';
    const search = event.url?.search ?? '';
    const trace = traceFromUnknown(error);

    logger.error({
      loggedAt,
      errorId,
      message: `[server-page-error] ${status} ${pathname}${search} | msg=${message}`,
      pathname,
      search: search || undefined,
      referer: referer || undefined,
      method: event.request?.method,
      status,
      name: serverError.name,
      trace: trace || undefined,
      error: serializeError(error),
      clientIp,
      userAgent
    });
  } catch (e) {
    console.error('Failed to log error', e);
  }

  return {
    message: status >= 500 ? 'Internal Error' : message,
    errorId
  };
}
