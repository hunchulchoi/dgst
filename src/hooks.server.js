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
import { MongoDBAdapter } from '@auth/mongodb-adapter';
import clientPromise from '$lib/database/clientPromise.js';
import crypto from 'crypto';
import { error } from '@sveltejs/kit';

const cache = new Map();

export function depends(key) {
  cache.set(key, new Date().getTime());
}





// SvelteKit 2 + @auth/sveltekit v1.x 호환
export const { handle, signIn, signOut } = SvelteKitAuth({
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

          if (!user) console.error('VIP 로그인 실패', email, encPwd);

          return user;
        } else {
          console.error('일반 사용자 로그인 실패', email, encPwd);
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

      if (params.profile.email_verified) {
        if (params.user) {
          if (params.user.state !== 'blocked') {
            return true;
          }
        } else return true;
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