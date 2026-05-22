// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
import type { Session } from '@auth/core/types';

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
