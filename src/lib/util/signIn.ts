import { signIn } from '@auth/sveltekit/client';
import { get, readonly, writable } from 'svelte/store';
import { swalFire } from '$lib/util/swal.js';

const pending = writable(false);
const ATTEMPT_KEY = 'dgst:sign-in-attempt';
const ATTEMPT_MAX_AGE_MS = 30 * 60 * 1000;
type Provider = 'google' | 'kakao';
type Attempt = { provider: Provider; startedAt: number; retried: boolean };

function readAttempt(): Attempt | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(ATTEMPT_KEY) || 'null');
    if (
      value &&
      ['google', 'kakao'].includes(value.provider) &&
      typeof value.startedAt === 'number' &&
      Number.isFinite(value.startedAt) &&
      typeof value.retried === 'boolean' &&
      value.startedAt <= Date.now() &&
      Date.now() - value.startedAt <= ATTEMPT_MAX_AGE_MS
    )
      return value;
  } catch {
    // Storage can be disabled. Manual sign-in still works.
  }
  return null;
}

function writeAttempt(attempt: Attempt) {
  try {
    window.sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempt));
    return true;
  } catch {
    return false;
  }
}

export function canRetrySignIn(provider: Provider) {
  const attempt = readAttempt();
  return attempt?.provider === provider && !attempt.retried;
}

export function cancelSignInRetry() {
  const attempt = readAttempt();
  if (attempt) writeAttempt({ ...attempt, retried: true });
}

export const signInPending = readonly(pending);

export function resetSignInOnPageShow(event: Pick<PageTransitionEvent, 'persisted'>) {
  if (event.persisted) pending.set(false);
}

export async function startSignIn(provider: Provider, options: { automaticRetry?: boolean } = {}) {
  if (typeof window === 'undefined' || get(pending)) return;

  if (options.automaticRetry) {
    const attempt = readAttempt();
    if (!attempt || attempt.provider !== provider || attempt.retried) return;
    // Claim before any async work so remounts/concurrent timers cannot retry twice.
    if (!writeAttempt({ ...attempt, retried: true })) return;
  } else {
    writeAttempt({ provider, startedAt: Date.now(), retried: false });
  }
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
