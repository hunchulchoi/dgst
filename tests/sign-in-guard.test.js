import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  swalFire: vi.fn()
}));

vi.mock('@auth/sveltekit/client', () => ({ signIn: mocks.signIn }));
vi.mock('$lib/util/swal.js', () => ({ swalFire: mocks.swalFire }));

import { resetSignInOnPageShow, signInPending, startSignIn } from '../src/lib/util/signIn';

describe('shared OAuth sign-in guard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('window', {});
    resetSignInOnPageShow({ persisted: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('blocks simultaneous sign-ins from different buttons and providers', async () => {
    let finishSignIn = () => {};
    mocks.signIn.mockImplementation(
      () => new Promise((resolve) => (finishSignIn = () => resolve(undefined)))
    );

    const first = startSignIn('google');
    expect(get(signInPending)).toBe(true);
    await startSignIn('google');
    await startSignIn('kakao');

    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(mocks.signIn).toHaveBeenCalledWith('google', { callbackUrl: '/' });

    finishSignIn();
    await first;
    await startSignIn('google');
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(get(signInPending)).toBe(true);
  });

  it('allows retry after a failed request and shows an error', async () => {
    mocks.signIn.mockRejectedValueOnce(new Error('Failed to fetch'));

    await startSignIn('google');

    expect(get(signInPending)).toBe(false);
    expect(mocks.swalFire).toHaveBeenCalledWith(
      expect.objectContaining({ icon: 'error', title: '로그인 연결 실패' })
    );

    await startSignIn('google');
    expect(mocks.signIn).toHaveBeenCalledTimes(2);
    expect(get(signInPending)).toBe(true);
  });

  it('resets only when returning through the back-forward cache', async () => {
    await startSignIn('google');

    resetSignInOnPageShow({ persisted: false });
    await startSignIn('google');
    expect(mocks.signIn).toHaveBeenCalledTimes(1);

    resetSignInOnPageShow({ persisted: true });
    expect(get(signInPending)).toBe(false);
    await startSignIn('google');
    expect(mocks.signIn).toHaveBeenCalledTimes(2);
  });

  it('does not start authentication during server rendering', async () => {
    vi.stubGlobal('window', undefined);

    await startSignIn('google');

    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(get(signInPending)).toBe(false);
  });
});
