import { SvelteKitAuth } from '@auth/sveltekit';
import GoogleProvider from '@auth/core/providers/google';
import {
  NEXTAUTH_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  KAKAO_CLIENT_ID,
  KAKAO_CLIENT_SECRET,
  NODE_ENV,
  DB_NAME,
  VIP_EMAIL,
  VIP_FAKE_EMAIL
} from '$env/static/private';
import { env as dynamicEnv } from '$env/dynamic/private';
import clientPromise from '$lib/database/clientPromise.js';
import { getHybridAdapter } from '$lib/server/auth/hybridAdapter.js';
import { checkAuthRateLimit } from '$lib/server/auth/rateLimit.js';
import * as redis from '$lib/server/redis/client.js';
import crypto from 'crypto';
import { error, redirect, json } from '@sveltejs/kit';
import logger from '$lib/util/logger';
import { serializeError, traceFromUnknown } from '$lib/util/formatErrorTrace.js';
import { warmupConnections } from '$lib/server/warmup.js';
import { isBoardHtmlPath } from '$lib/util/boardPaths.js';

warmupConnections();

const cache = new Map();

export function depends(key) {
  cache.set(key, new Date().getTime());
}

import KakaoProvider from '@auth/core/providers/kakao';

// SvelteKit 2 + @auth/sveltekit v1.x 호환
const providers = [
  GoogleProvider({
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    profile(profile) {
      // 사용자 정보에 필요한 필드만 저장 (name/image 등 불필요한 값 제외)
      return {
        id: profile.sub,
        email: crypto.createHash('sha512').update(profile.email).digest('base64url'),
        nickname: profile.name ?? '',
        introduction: '우리 자기',
        photo: null, // 구글/카카오 로그인 시 기본 이미지를 가져오지 않음
        emailVerified: profile.email_verified ?? true,
        state: 'registered',
        grade: 'user',
        last_modified: new Date()
      };
    }
  }),
  KakaoProvider({
    clientId: KAKAO_CLIENT_ID,
    clientSecret: KAKAO_CLIENT_SECRET,
    profile(profile) {
      const kakaoAccount = profile.kakao_account || {};
      const kakaoId = String(profile.id);
      const emailHash = crypto.createHash('sha512').update(`kakao:${kakaoId}`).digest('base64url');

      return {
        id: kakaoId,
        email: kakaoAccount?.email
          ? crypto.createHash('sha512').update(kakaoAccount.email).digest('base64url')
          : emailHash,
        nickname:
          kakaoAccount?.profile?.nickname || kakaoAccount?.name || `카카오${kakaoId.slice(-4)}`,
        introduction: '우리 자기',
        photo: null, // 구글/카카오 로그인 시 기본 이미지를 가져오지 않음
        emailVerified: true,
        state: 'registered',
        grade: 'user',
        last_modified: new Date()
      };
    }
  })
];

// 프로바이더 목록 로그 (상세)
console.log(
  '등록된 프로바이더:',
  providers.map((p) => ({
    id: p.id || p.name,
    type: p.type,
    name: p.name
  }))
);
console.log(
  '카카오 프로바이더 포함 여부:',
  providers.some((p) => p.id === 'kakao')
);

export const {
  handle: authHandle,
  signIn,
  signOut
} = SvelteKitAuth({
  providers,
  adapter: getHybridAdapter(DB_NAME),
  pages: {
    newUser: '/auth/profile',
    signIn: '/login',
    error: '/login'
  },
  callbacks: {
    async signIn(params) {
      console.debug('=======auth callback signIn====');
      console.debug('params', params);
      console.debug('=======//auth callback signIn====');

      if (!params.profile && params.user) return true;
      if (params.account?.provider === 'kakao') return true;

      const emailVerified = params.profile?.email_verified ?? params.profile?.emailVerified;
      if (emailVerified) {
        if (params.user) {
          if (params.user.state !== 'blocked') {
            return true;
          } else {
            logger.error({
              message: '로그인 실패: 차단된 사용자',
              email: params.profile?.email,
              userId: params.user?.id,
              provider: params.account?.provider,
              providerAccountId: params.account?.providerAccountId,
              accountType: params.account?.type,
              state: params.user?.state
            });
          }
        } else return true;
      } else {
        logger.error({
          message: '로그인 실패: 이메일 미인증',
          email: params.profile?.email,
          provider: params.account?.provider,
          providerAccountId: params.account?.providerAccountId,
          accountType: params.account?.type,
          emailVerifiedRaw: params.profile?.email_verified ?? params.profile?.emailVerified
        });
      }

      return false;
    },
    async session(params) {
      if (params.user) {
        params.session.user.nickname = params.user.nickname ?? params.session.user.nickname;
        params.session.user.introduce = params.user.introduce ?? params.session.user.introduce;
        params.session.user.photo = params.user.photo ?? params.session.user.photo;
      }
      return params.session;
    },
    async updateUser(params) {
      console.debug('=======auth callback updateUser====');
      console.debug('params', params);
      console.debug('=======//auth callback updateUser====');
    },
    async createUser(params) {
      // createUser callback
    },
    async linkAccount(params) {
      // linkAccount callback
    },
    async redirect(params) {
      return params.url;
    }
  },
  events: {
    async signIn(message) {
      // signIn event
    },
    async signOut(message) {
      // signOut event
    },
    async createUser(message) {
      // createUser event
    },
    async updateUser(message) {
      // updateUser event
    },
    async linkAccount(message) {
      // linkAccount event
    },
    async session(message) {
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
      name: NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: NODE_ENV === 'production'
      }
    }
  },
  secret: NEXTAUTH_SECRET,
  trustHost: true,
  debug: false
});

const DEVICE_COOKIE_NAME = 'dgst_device';
const DEVICE_COOKIE_MAX_AGE_DAYS = 365;
/** Redis device 키 TTL — 쿠키보다 짧게 (키 누적 방지) */
const DEVICE_REDIS_TTL_SECONDS = 30 * 24 * 60 * 60;
/** DAU Redis 키 TTL — KST 자정 경계 여유 */
const DAU_REDIS_TTL_SECONDS = 48 * 60 * 60;
const AUTH_SESSION_COOKIE_NAME =
  NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';

/** @param {import('@sveltejs/kit').RequestEvent} event */
const getRequestMeta = (event) => {
  const forwardedFor =
    event.request?.headers?.get?.('x-forwarded-for') || event.request?.headers?.get?.('x-real-ip') || '';
  const clientIp =
    (forwardedFor ? String(forwardedFor).split(',')[0].trim() : '') ||
    event.getClientAddress?.() ||
    'unknown';

  return {
    method: event.request?.method,
    clientIp,
    userAgent: event.request?.headers?.get?.('user-agent') ?? '',
    referer: event.request?.headers?.get?.('referer') ?? '',
    requestUrl: event.url?.toString?.(),
    search: event.url?.search ?? ''
  };
};

/** @param {string} pathname */
const isDauTrackablePath = (pathname) =>
  !pathname.startsWith('/_app/') &&
  !pathname.startsWith('/favicon') &&
  !pathname.startsWith('/api/log') &&
  !pathname.includes('.');

/** KST 기준 YYYY-MM-DD */
const getKstDateKey = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

/**
 * 로그인 사용자 DAU — KST 기준 하루 1회 user.active 로그
 *
 * @param {string} userId
 * @param {string} pathname
 */
const recordDailyActiveUser = (userId, pathname) => {
  const dauDate = getKstDateKey();
  const redisKey = `dau:${dauDate}:${userId}`;

  redis
    .setNx(redisKey, '1', DAU_REDIS_TTL_SECONDS)
    .then((isFirstToday) => {
      if (!isFirstToday) return;
      logger.info({
        message: 'user active',
        event: 'user.active',
        user_id: userId,
        dau_date: dauDate,
        pathname
      });
    })
    .catch(() => {});
};

// 우리의 handle 함수 (Auth 핸들러와 함께 사용)
export async function handle({ event, resolve }) {
  const startTime = Date.now();
  const { pathname } = event.url;

  // 기기 식별용 UUID 쿠키 (없으면 생성 후 설정)
  let deviceId = event.cookies.get(DEVICE_COOKIE_NAME);
  const hadDeviceCookie = Boolean(deviceId);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    event.cookies.set(DEVICE_COOKIE_NAME, deviceId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: NODE_ENV === 'production',
      maxAge: DEVICE_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60
    });
  }
  // cookie.get()은 string을 반환하므로 안전하게 문자열로 고정
  deviceId = String(deviceId);

  // 재방문(기존 쿠키)만 Redis 갱신 — 봇·최초 방문마다 키 생성되는 것 방지
  if (hadDeviceCookie && !pathname.startsWith('/_app/') && !pathname.includes('.')) {
    redis
      .setJson(
        `device:${deviceId}`,
        { lastSeen: new Date().toISOString() },
        DEVICE_REDIS_TTL_SECONDS
      )
      .catch(() => {});
  }

  // 브라우저/클라이언트가 요청하는 아이콘 경로 → favicon으로 리다이렉트
  const faviconRedirects = [
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
    '/favicon.ico'
  ];
  if (faviconRedirects.includes(pathname)) {
    const target =
      pathname === '/favicon.ico' ? '/favicon/favicon.ico' : '/favicon/apple-icon-180x180.png';
    return redirect(302, target);
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

  logger.debug({
    message: 'http request',
    event: 'http.request',
    pathname,
    ...getRequestMeta(event)
  });

  // 본문 크기: 업로드 100MB, 글쓰기·댓글 POST 10MB (기본 512KB 초과 HTML 방지)
  const maxBodySize = pathname.includes('/board/upload')
    ? 100 * 1024 * 1024
    : event.request.method === 'POST' &&
        (pathname.includes('/write') || pathname.endsWith('/comment'))
      ? 10 * 1024 * 1024
      : undefined;

  // 커스텀 resolve 함수 생성
  const customResolve = async (event) => {
    return resolve(event, {
      transformPageChunk: ({ html }) => html,
      filterSerializedResponseHeaders: () => false,
      ...(maxBodySize && { bodySizeLimit: maxBodySize })
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
      const errorDescription = url.searchParams.get('error_description') ?? '';
      const provider = pathname.startsWith('/auth/callback/') ? pathname.split('/').pop() : undefined;
      const authQuery = Object.fromEntries(event.url.searchParams.entries());
      const errorQuery = Object.fromEntries(url.searchParams.entries());
      logger.error({
        message: '로그인 실패: Auth 리다이렉트',
        pathname,
        provider,
        ...getRequestMeta(event),
        errorType,
        errorDescription,
        callbackPath: pathname.startsWith('/auth/callback/') ? pathname : undefined,
        authQuery,
        redirectLocation: location,
        redirectQuery: errorQuery
      });
    }
  } catch (e) {
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
        const rawIp =
          event.request?.headers?.get?.('x-forwarded-for') ||
          event.request?.headers?.get?.('x-real-ip') ||
          '';
        const ip =
          (rawIp ? String(rawIp).split(',')[0].trim() : '') ||
          event.getClientAddress?.() ||
          'unknown';
        const userAgent = event.request?.headers?.get?.('user-agent') ?? '';

        let userId = null;
        try {
          const prefix = `${AUTH_SESSION_COOKIE_NAME}=`;
          const cookieStr = Array.from(setCookies).find(
            (c) => typeof c === 'string' && c.startsWith(prefix)
          );
          if (cookieStr) {
            const sessionToken = cookieStr.slice(prefix.length).split(';')[0].trim();
            const adapter = getHybridAdapter(DB_NAME);
            const sessionAndUser = await adapter.getSessionAndUser?.(sessionToken);
            if (sessionAndUser?.user?.id) userId = sessionAndUser.user.id;
          }
        } catch (e) {
          logger.warn({ message: 'login_logs: getSessionAndUser failed', error: e });
        }

        const client = await clientPromise;
        const db = client.db(DB_NAME);
        await db.collection('login_logs').insertOne({
          at: new Date(),
          userId,
          ip,
          deviceId,
          userAgent,
          provider: pathname.split('/').pop(),
          path: pathname
        });
      }
    }
  } catch (e) {
    logger.warn({
      message: 'Failed to write login log',
      error: e,
      pathname
    });
  }

  if (isDauTrackablePath(pathname)) {
    try {
      const session = await event.locals.auth();
      const userId = session?.user?.id;
      if (userId) {
        recordDailyActiveUser(String(userId), pathname);
      }
    } catch {
      // DAU 기록 실패는 요청 처리에 영향 없음
    }
  }

  const endTime = Date.now();
  const executionTime = endTime - startTime;
  const status = authResponse?.status || 200;

  const httpLogBase = {
    event: 'http.response',
    method: event.request.method,
    pathname,
    status,
    duration_ms: executionTime,
    ...getRequestMeta(event)
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
  /** @type {{ message?: string; errorId?: string } | undefined} */
  const body =
    typeof error === 'object' && error !== null && 'body' in error
      ? /** @type {{ message?: string; errorId?: string }} */ (error.body)
      : undefined;

  const errorId = body?.errorId ?? crypto.randomUUID();
  const status = error?.status ?? 500;
  const message =
    body?.message ??
    (error?.cause instanceof Error
      ? error.cause.message
      : error?.cause != null
        ? String(error.cause)
        : undefined) ??
    error?.message ??
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

    const status = error?.status ?? 500;
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
      name: error?.name,
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
