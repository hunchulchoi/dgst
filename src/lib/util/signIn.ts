import { signIn } from '@auth/sveltekit/client';
import { get, readonly, writable } from 'svelte/store';
import { swalFire } from '$lib/util/swal.js';

const pending = writable(false);

export const signInPending = readonly(pending);

export function resetSignInOnPageShow(event: Pick<PageTransitionEvent, 'persisted'>) {
  if (event.persisted) pending.set(false);
}

export async function startSignIn(provider: 'google' | 'kakao') {
  if (typeof window === 'undefined' || get(pending)) return;

  pending.set(true);

  try {
    await signIn(provider, { callbackUrl: '/' });
  } catch {
    pending.set(false);
    await swalFire({
      icon: 'error',
      title: '로그인 연결 실패',
      text: '로그인을 시작하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.',
      confirmButtonText: '확인'
    });
  }
}
