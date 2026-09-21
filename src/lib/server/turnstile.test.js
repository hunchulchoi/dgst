import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: { CLOUDFLARE_TURNSTILE_SECRET_KEY: 'test-secret' },
  error: vi.fn(),
  warn: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));
vi.mock('$lib/util/logger.js', () => ({ default: { error: mocks.error, warn: mocks.warn } }));

const { verifyTurnstileToken } = await import('./turnstile.js');

describe('verifyTurnstileToken', () => {
  beforeEach(() => {
    mocks.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = 'test-secret';
    mocks.error.mockReset();
    mocks.warn.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('accepts a successful response with the expected action', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, action: 'register' }), { status: 200 })
    );

    await expect(verifyTurnstileToken('token', 'register')).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('rejects a mismatched action', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, action: 'profile' }), { status: 200 })
    );

    await expect(verifyTurnstileToken('token', 'register')).resolves.toEqual({
      ok: false,
      message: '봇 방지 요청 정보가 일치하지 않습니다.'
    });
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Turnstile action mismatch',
        action: 'profile',
        expectedAction: 'register'
      })
    );
  });

  it('logs Cloudflare rejection codes without logging the token', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          'error-codes': ['timeout-or-duplicate'],
          action: 'profile',
          hostname: 'www.dgst.me'
        }),
        { status: 200 }
      )
    );

    await expect(verifyTurnstileToken('sensitive-token', 'profile')).resolves.toEqual({
      ok: false,
      message: '봇 방지 확인에 실패했습니다.'
    });
    expect(mocks.warn).toHaveBeenCalledWith({
      message: 'Turnstile token rejected',
      errorCodes: ['timeout-or-duplicate'],
      action: 'profile',
      hostname: 'www.dgst.me',
      expectedAction: 'profile'
    });
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('sensitive-token');
  });

  it('fails closed when the secret is missing', async () => {
    mocks.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = '';

    await expect(verifyTurnstileToken('token', 'register')).resolves.toEqual({
      ok: false,
      message: '봇 방지 설정이 완료되지 않았습니다.'
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
