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
console.log('카카오 환경 변수 확인:', {
  hasClientId: !!KAKAO_CLIENT_ID,
  hasClientSecret: !!KAKAO_CLIENT_SECRET,
  clientIdLength: KAKAO_CLIENT_ID?.length || 0
});
import { MongoDBAdapter } from '@auth/mongodb-adapter';
import clientPromise from '$lib/database/clientPromise.js';
import crypto from 'crypto';
import { error } from '@sveltejs/kit';
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
    type: 'oauth' as const,
    checks: ['state'] as const,
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
      // 이메일이나 닉네임 동의 없이도 기본 정보만으로 로그인 가능
      // 카카오 ID를 이메일 대신 사용 (해시 처리)
      const kakaoId = String(profile.id);
      const emailHash = crypto.createHash('sha512').update(`kakao:${kakaoId}`).digest('base64url');

      return {
        id: kakaoId,
        email: kakaoAccount?.email ? crypto.createHash('sha512').update(kakaoAccount.email).digest('base64url') : emailHash,
        nickname: kakaoAccount?.profile?.nickname || kakaoAccount?.name || `카카오${kakaoId.slice(-4)}`,
        introduction: '우리 자기',
        photo: kakaoAccount?.profile?.profile_image_url || kakaoAccount?.profile?.thumbnail_image_url,
        grade: 'user',
        state: 'registered',
        created_at: new Date(),
        latest_login_at: new Date(),
        latest_modified_at: new Date()
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
      return {
        id: profile.sub,
        email: crypto.createHash('sha512').update(profile.email).digest('base64url'),
        nickname: profile.name,
        introduction: '우리 자기',
        photo: profile.image,
        grade: 'user',
        state: 'registered',
        created_at: new Date(),
        latest_login_at: new Date(),
        latest_modified_at: new Date()
      };
    }
  }),
  // 카카오 프로바이더 (환경 변수가 설정되어 있을 때만 활성화)
  ...(KAKAO_CLIENT_ID && KAKAO_CLIENT_SECRET ? [
    KakaoProvider({
      clientId: KAKAO_CLIENT_ID,
      clientSecret: KAKAO_CLIENT_SECRET
    })
  ] : []).filter(Boolean), // filter(Boolean)로 undefined 제거
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
  adapter: MongoDBAdapter(clientPromise, { databaseName: DB_NAME }),
  pages: {
    newUser: '/auth/profile'
  },
  callbacks: {
    jwt(params) {
      if (params.user) {
        params.token.nickname = params.user.nickname;
        params.token.introduction = params.user.introduction;
        params.token.photo = params.user.photo;
      }

      return params.token;
    },
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
      if (params.token.nickname) {
        params.session.user.nickname = params.token.nickname;
        params.session.user.introduce = params.token.introduce;
        params.session.user.photo = params.token.photo;
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
    strategy: 'jwt'
  },
  secret: NEXTAUTH_SECRET,
  trustHost: true, // 프로덕션 환경에서 호스트 신뢰
  debug: false
});

// 우리의 handle 함수 (Auth 핸들러와 함께 사용)
export async function handle({ event, resolve }) {
  const startTime = Date.now();
  const { pathname } = event.url;

  if (pathname.startsWith('/images/')) {
    depends('image-cache');
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
    if (
      pathname.includes('apple-touch-icon') ||
      pathname.includes('favicon') ||
      pathname.includes('robots.txt')
    ) {
      return;
    }

    const clientIp = event.getClientAddress ? event.getClientAddress() : 'unknown';
    logger.error({
      message: 'Unhandled server error',
      pathname,
      method: event.request?.method,
      status: error?.status ?? 500,
      name: error?.name,
      error: error?.message,
      stack: error?.stack,
      clientIp
    });
  } catch (e) {
    console.error('Failed to log error', e);
  }
}