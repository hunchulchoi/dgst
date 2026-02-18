import { SvelteKitAuth } from '@auth/sveltekit';
import GoogleProvider from '@auth/core/providers/google';
import Credentials from '@auth/core/providers/credentials';
import {
  NEXTAUTH_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  NODE_ENV,
  DB_NAME,
  VIP_EMAIL,
  VIP_FAKE_EMAIL
} from '$env/static/private';
import { env as dynamicEnv } from '$env/dynamic/private';

// 카카오 환경 변수 (선택적 - 환경 변수 파일에 추가 필요)
const KAKAO_CLIENT_ID = dynamicEnv.KAKAO_CLIENT_ID;
const KAKAO_CLIENT_SECRET = dynamicEnv.KAKAO_CLIENT_SECRET;

// 디버깅: 카카오 환경 변수 확인
const hasKakaoCredentials = !!KAKAO_CLIENT_ID && !!KAKAO_CLIENT_SECRET;
console.log('카카오 환경 변수 확인:', {
  hasClientId: !!KAKAO_CLIENT_ID,
  hasClientSecret: !!KAKAO_CLIENT_SECRET,
  clientIdLength: KAKAO_CLIENT_ID?.length || 0,
  willRegister: hasKakaoCredentials
});
if (!hasKakaoCredentials) {
  console.warn('⚠️ 카카오 로그인 비활성화: KAKAO_CLIENT_ID 또는 KAKAO_CLIENT_SECRET이 설정되지 않았습니다.');
}
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

/**
 * 카카오 OAuth2 프로바이더
 */
function KakaoProvider(options) {
  // 클로저로 options 캡처
  const { clientId, clientSecret } = options;

  // 디버깅: clientId 확인
  console.log('[KakaoProvider] 초기화:', {
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    clientIdLength: clientId?.length || 0
  });

  const provider = {
    id: 'kakao',
    name: 'Kakao',
    type: 'oauth',
    checks: ['state'],
    clientId: clientId, // 명시적으로 설정
    clientSecret: clientSecret, // 명시적으로 설정
    authorization: {
      url: 'https://kauth.kakao.com/oauth/authorize',
      params: {
        response_type: 'code',
        scope: '' // 빈 scope 명시적 설정
      },
      async request(context) {
        // @auth/core가 자동으로 추가한 scope를 제거하기 위해 완전히 커스텀 URL 생성
        const { provider, options: authOptions } = context;
        const url = new URL('https://kauth.kakao.com/oauth/authorize');

        // 클로저에서 캡처한 clientId 사용
        url.searchParams.set('client_id', clientId);
        url.searchParams.set('redirect_uri', provider.callbackUrl);
        url.searchParams.set('response_type', 'code');

        // scope는 명시적으로 제외
        // state 추가
        if (authOptions.state) {
          url.searchParams.set('state', authOptions.state);
        }

        // scope 파라미터가 있다면 제거
        url.searchParams.delete('scope');

        return { url: url.toString() };
      }
    },
    token: {
      url: 'https://kauth.kakao.com/oauth/token',
      async request({ params, provider }) {
        // 디버깅: 전달된 값 확인
        console.log('[KakaoProvider] token.request 호출:', {
          providerClientId: provider.clientId,
          providerClientSecret: provider.clientSecret ? '***' : undefined,
          closureClientId: clientId ? '***' : undefined,
          closureClientSecret: clientSecret ? '***' : undefined,
          hasCode: !!params.code,
          redirectUri: provider.callbackUrl
        });

        // provider.clientId가 null이면 클로저 값 사용
        const useClientId = provider.clientId || clientId;
        const useClientSecret = provider.clientSecret || clientSecret;

        if (!useClientId || !useClientSecret) {
          console.error('[KakaoProvider] clientId or clientSecret is missing:', {
            useClientId: !!useClientId,
            useClientSecret: !!useClientSecret,
            providerClientId: !!provider.clientId,
            providerClientSecret: !!provider.clientSecret,
            closureClientId: !!clientId,
            closureClientSecret: !!clientSecret
          });
          throw new Error('Kakao clientId or clientSecret is missing');
        }

        // 카카오는 표준 OAuth2 형식 사용
        const body = new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: useClientId,
          client_secret: useClientSecret,
          code: params.code,
          redirect_uri: provider.callbackUrl
        });

        const response = await fetch('https://kauth.kakao.com/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: body.toString()
        });

        const data = await response.json();

        if (!response.ok) {
          console.error('[KakaoProvider] 토큰 요청 실패:', {
            status: response.status,
            statusText: response.statusText,
            data
          });
          throw new Error(`Kakao token error: ${JSON.stringify(data)}`);
        }

        console.log('[KakaoProvider] 토큰 요청 성공');
        return data;
      }
    },
    userinfo: {
      url: 'https://kapi.kakao.com/v2/user/me',
      async request({ tokens, provider }) {
        const response = await fetch(provider.userinfo.url, {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`
          }
        });
        return await response.json();
      }
    },
    profile(profile) {
      const kakaoAccount = profile.kakao_account || {};
      const kakaoId = String(profile.id);
      const emailHash = crypto.createHash('sha512').update(`kakao:${kakaoId}`).digest('base64url');

      // 사용자 정보에 필요한 필드만 저장
      return {
        id: kakaoId,
        email: kakaoAccount?.email ? crypto.createHash('sha512').update(kakaoAccount.email).digest('base64url') : emailHash,
        nickname: kakaoAccount?.profile?.nickname || kakaoAccount?.name || `카카오${kakaoId.slice(-4)}`,
        introduction: '우리 자기',
        photo: (kakaoAccount?.profile?.profile_image_url || kakaoAccount?.profile?.thumbnail_image_url) ?? null,
        emailVerified: true,
        state: 'registered',
        grade: 'user',
        last_modified: new Date()
      };
    }
  };

  // 디버깅: 프로바이더 객체 확인
  console.log('[KakaoProvider] 반환 객체:', {
    id: provider.id,
    type: provider.type,
    hasClientId: !!provider.clientId,
    hasAuthorization: !!provider.authorization,
    hasToken: !!provider.token,
    hasUserinfo: !!provider.userinfo,
    hasProfile: !!provider.profile
  });

  return provider;
}

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
  // 카카오 프로바이더 (환경 변수가 설정되어 있을 때만 활성화)
  ...(KAKAO_CLIENT_ID && KAKAO_CLIENT_SECRET ? [
    KakaoProvider({
      clientId: KAKAO_CLIENT_ID,
      clientSecret: KAKAO_CLIENT_SECRET
    })
  ] : [])
    .filter((p) => {
      // 프로바이더가 유효한지 확인
      if (!p) return false;
      const isValid = p && typeof p === 'object' && p.id === 'kakao';
      if (!isValid) {
        console.error('[Providers] 카카오 프로바이더가 유효하지 않음:', p);
      }
      return isValid;
    }),
  Credentials({
    id: 'email-password-credential',
    name: 'Credentials',
    type: 'credentials',
    credentials: {
      email: { label: 'Email', type: 'email', placeholder: '이메일 입력하세요' },
      password: { label: 'Password', type: 'password' }
    },
    async authorize(credentials) {
      const { email, password } = credentials;

      const encPwd = crypto.createHash('sha512').update(password).digest('base64url');

      if (email === VIP_FAKE_EMAIL) {
        const user = await clientPromise.then((db) =>
          db
            .db(DB_NAME)
            .collection('users')
            .findOne(
              { email: VIP_EMAIL, ccd: encPwd },
              {
                id: 1,
                email: 1,
                nickname: 1,
                introduction: 1,
                photo: 1,
                state: 1
              }
            )
        );

        if (!user) {
          logger.warn({
            message: 'VIP login failed',
            email: VIP_FAKE_EMAIL,
            vipEmail: VIP_EMAIL
          });
        }

        return user;
      } else {
        logger.warn({
          message: 'Login failed - credentials provider not available',
          email
        });
        throw error(405);
      }
    }
  })
];

// 프로바이더 목록 로그 (상세)
console.log('등록된 프로바이더:', providers.map(p => ({
  id: p.id || p.name,
  type: p.type,
  name: p.name
})));
console.log('카카오 프로바이더 포함 여부:', providers.some(p => p.id === 'kakao'));

export const { handle: authHandle, signIn, signOut } = SvelteKitAuth({
  providers,
  adapter: getHybridAdapter(DB_NAME),
  pages: {
    newUser: '/auth/profile'
  },
  callbacks: {
    async signIn(params) {
      console.debug('=======auth callback signIn====');
      console.debug('params', params);
      console.debug('=======//auth callback signIn====');

      if (!params.profile && params.user) return true;

      if (params.profile?.email_verified) {
        if (params.user) {
          if (params.user.state !== 'blocked') {
            return true;
          } else {
            logger.warn({
              message: 'Login denied - user blocked',
              email: params.profile?.email,
              userId: params.user?.id
            });
          }
        } else return true;
      } else {
        logger.warn({
          message: 'Login denied - email not verified',
          email: params.profile?.email
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

  // Auth 핸들러를 먼저 실행
  const authResponse = await authHandle({ event, resolve: customResolve });

  // 로그인 성공 시(세션 쿠키 설정) login_logs 기록 (실패해도 인증 흐름 방해 금지)
  try {
    if (pathname.startsWith('/auth/callback/')) {
      const setCookies =
        authResponse?.headers?.getSetCookie?.() ??
        (authResponse?.headers?.get?.('set-cookie') ? [authResponse.headers.get('set-cookie')] : []);

      const didSetSessionCookie = Array.from(setCookies).some((c) =>
        typeof c === 'string' ? c.includes(`${AUTH_SESSION_COOKIE_NAME}=`) : false
      );

      if (didSetSessionCookie) {
        const rawIp =
          event.request?.headers?.get?.('x-forwarded-for') ||
          event.request?.headers?.get?.('x-real-ip') ||
          '';
        const ip =
          (rawIp ? String(rawIp).split(',')[0].trim() : '') || event.getClientAddress?.() || 'unknown';
        const userAgent = event.request?.headers?.get?.('user-agent') ?? '';
        const deviceId = event.cookies.get(DEVICE_COOKIE_NAME) ?? '';

        const client = await clientPromise;
        const db = client.db(DB_NAME);
        await db.collection('login_logs').insertOne({
          at: new Date(),
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
      error: e?.message ?? String(e),
      pathname
    });
  }

  const endTime = Date.now();
  const executionTime = endTime - startTime;
  const status = authResponse?.status || 200;

  logger.info(`📤 응답 완료: ${pathname} - Status: ${status}, Time: ${executionTime}ms - ${new Date().toISOString()}`);

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
      error?.cause instanceof Error ? error.cause.message : error?.cause != null ? String(error.cause) : undefined;
    const message = causeMessage ?? error?.message ?? 'Unhandled server error';

    logger.error({
      loggedAt,
      message,
      pathname,
      method: event.request?.method,
      status,
      name: error?.name,
      ...(status !== 404 && { stack: error?.stack }),
      clientIp,
      userAgent,
    });
  } catch (e) {
    console.error('Failed to log error', e);
  }
}