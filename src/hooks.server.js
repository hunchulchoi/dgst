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

// 카카오 환경 변수 (선택적 - 환경 변수 파일에 추가 필요)
const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID;
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET;
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
  return {
    id: 'kakao',
    name: 'Kakao',
    type: 'oauth',
    authorization: {
      url: 'https://kauth.kakao.com/oauth/authorize',
      params: {
        scope: 'profile_nickname,account_email',
        response_type: 'code'
      }
    },
    token: 'https://kauth.kakao.com/oauth/token',
    userinfo: 'https://kapi.kakao.com/v2/user/me',
    profile(profile) {
      const kakaoAccount = profile.kakao_account;
      return {
        id: String(profile.id),
        email: kakaoAccount?.email ? crypto.createHash('sha512').update(kakaoAccount.email).digest('base64url') : undefined,
        nickname: kakaoAccount?.profile?.nickname || kakaoAccount?.name || '카카오 사용자',
        introduction: '우리 자기',
        photo: kakaoAccount?.profile?.profile_image_url || kakaoAccount?.profile?.thumbnail_image_url,
        grade: 'user',
        state: 'registered',
        created_at: new Date(),
        latest_login_at: new Date(),
        latest_modified_at: new Date()
      };
    },
    clientId: options.clientId,
    clientSecret: options.clientSecret
  };
}

// SvelteKit 2 + @auth/sveltekit v1.x 호환
export const { handle: authHandle, signIn, signOut } = SvelteKitAuth({
  providers: [
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
    ] : []),
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
  ],
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