import { SvelteKitAuth } from '@auth/sveltekit';
import GoogleProvider from '@auth/core/providers/google';
import Credentials from '@auth/core/providers/credentials';
import {
  NEXTAUTH_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  NODE_ENV,
  DB_NAME
} from '$env/static/private'
import { MongoDBAdapter } from '@auth/mongodb-adapter';
import clientPromise from '$lib/database/clientPromise.js';
import crypto from 'crypto';

export const handle = SvelteKitAuth({
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
      credentials:{
        email: {label: 'Email', type: 'email', placeholder: '이메일 입력하세요'},
        password: {label: 'Password', type: 'password',}
      },
      async authorize(credentials){
        console.log('authorization', credentials)
        
        const {email, password} = credentials;
      
        const encEmail = crypto.createHash('sha512').update(email).digest('base64url');
        const encPwd = crypto.createHash('sha512').update(password).digest('base64url');
        
        console.log('encEmail', encEmail)
        console.log('encPwd', encPwd)
        
        const user = await clientPromise.then(db=>
          db.db(DB_NAME)
            .collection('users')
            .findOne({email: encEmail.toLowerCase(), ccd: encPwd}, {
                  id: 1,
                  email: 1,
                  nickname: 1,
                  introduction: 1,
                  photo: 1,
                  state: 1
                }))
        
        return user;
        
      }
    })
    
    
  ],
  adapter: MongoDBAdapter(clientPromise, { databaseName: DB_NAME }),
  pages: {
    newUser: '/auth/profile'
  },
  callbacks: {
    jwt(params) {
       /*console.debug('=======auth callback jwt====');
       console.debug('params', params);
       console.debug('=======//auth callback jwt====');
*/
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
      
      if(!params.profile && params.user) return true;
      
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
      /*console.debug('=======auth callback session====');
      console.debug('params', params);
      console.debug('=======//auth callback session====');*/

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
      /*console.debug('=======auth callback createUser====');
      console.debug('params', params);
      console.debug('=======//auth callback createUser====');*/
    },
    async linkAccount(params) {
      /*console.debug('=======auth callback linkAccount====');
      console.debug('params', params);
      console.debug('=======//auth callback linkAccount====');*/
    },
    async redirect(params) {
      /*console.debug('=======auth callback redirect====');
      console.debug('params', params);
      console.debug('=======//auth callback redirect====');*/

      return params.url;
      //return '/auth/register';
    }
  },
  events: {
    async signIn(message) {
      /*console.debug('=======auth event signIn====');
      console.debug('message', message);
      console.debug('=======//auth event signIn====');*/
    },
    async signOut(message) {
      // console.log('auth event signOut====', message);
    },
    async createUser(message) {
      /*console.debug('=======auth event createUser====');
      console.debug('message', message);
      console.debug('=======//auth event createUser====');*/
    },
    async updateUser(message) {
     /* console.debug('=======auth event updateUser====');
      console.debug('message', message);
      console.debug('=======//auth event updateUser====');*/
    },
    async linkAccount(message) {
      /*console.debug('=======auth event linkAccount====');
      console.debug('message', message);
      console.debug('=======//auth event linkAccount====');*/
    },
    async session(message) {
      /*console.debug('=======auth event session====');
      console.debug('message', message);
      console.debug('=======//auth event session====');*/
    }
  },
  session: {
    strategy: 'jwt'
  },
  secret: NEXTAUTH_SECRET,
  debug: true,
});
