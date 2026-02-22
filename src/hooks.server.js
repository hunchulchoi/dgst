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
        photo: profile.picture ?? profile.image ?? null,
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
        photo:
          (kakaoAccount?.profile?.profile_image_url ||
            kakaoAccount?.profile?.thumbnail_image_url) ??
          null,
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
              provider: params.account?.provider
            });
          }
        } else return true;
      } else {
        logger.error({
          message: '로그인 실패: 이메일 미인증',
          email: params.profile?.email,
          provider: params.account?.provider
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
const DEVICE_REDIS_TTL_SECONDS = DEVICE_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
const AUTH_SESSION_COOKIE_NAME =
  NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';

// 우리의 handle 함수 (Auth 핸들러와 함께 사용)
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
      secure: NODE_ENV === 'production',
      maxAge: DEVICE_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60
    });
  }
  // cookie.get()은 string을 반환하므로 안전하게 문자열로 고정
  deviceId = String(deviceId);

  // 기기 ID Redis 저장 (마지막 접속 시각, Redis 미사용 시 무시)
  try {
    await redis.setJson(
      `device:${deviceId}`,
      { lastSeen: new Date().toISOString() },
      DEVICE_REDIS_TTL_SECONDS
    );
  } catch {
    // Redis 실패해도 요청은 계속 진행
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

  logger.info(`📥 요청 시작: ${pathname} - ${new Date().toLocaleString()}`);

  // 파일 업로드 경로에 대해서는 본문 크기 제한 증가 (100MB)
  const maxBodySize = pathname.includes('/board/upload') ? 100 * 1024 * 1024 : undefined;

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
      error: authErr?.message ?? String(authErr),
      stack: authErr?.stack
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
      logger.error({
        message: '로그인 실패: Auth 리다이렉트',
        pathname,
        errorType,
        errorDescription,
        callbackPath: pathname.startsWith('/auth/callback/') ? pathname : undefined
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

  const endTime = Date.now();
  const executionTime = endTime - startTime;
  const status = authResponse?.status || 200;

  logger.info(
    `📤 응답 완료: ${pathname} - Status: ${status}, Time: ${executionTime}ms - ${new Date().toISOString()}`
  );

  return authResponse;
}

// 전역 에러 로깅
/** @type {import('@sveltejs/kit').HandleServerError} */
export function handleError({ event, error }) {
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
    const causeMessage =
      error?.cause instanceof Error
        ? error.cause.message
        : error?.cause != null
          ? String(error.cause)
          : undefined;
    const message = causeMessage ?? error?.message ?? 'Unhandled server error';

    logger.error({
      loggedAt,
      message,
      pathname,
      method: event.request?.method,
      status,
      name: error?.name,
      ...(status !== 404 && { stack: error?.stack }),
      error,
      clientIp,
      userAgent
    });
  } catch (e) {
    console.error('Failed to log error', e);
  }
}
