// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
import type { DefaultSession, Session } from '@auth/core/types';

type DgstUserFields = {
  nickname?: string | null;
  introduction?: string | null;
  introduce?: string | null;
  photo?: string | null;
  grade?: string | null;
  state?: string | null;
};

declare module '@auth/core/types' {
  interface Session {
    user?: DefaultSession['user'] & DgstUserFields;
  }

  interface User extends DgstUserFields {}
}

declare global {
  namespace App {
    interface Error {
      message?: string;
      errorId?: string;
    }
    interface Locals {
      getSession: () => Promise<Session | null>;
      auth: () => Promise<Session | null>;
    }
    interface PageData {
      session: Session | null;
      kakaoEnabled?: boolean;
    }
    // interface Platform {}
  }
}

export {};
