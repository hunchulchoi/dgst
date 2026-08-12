import { describe, expect, it } from 'vitest';
import {
  mapGoogleAuthProfile,
  mapKakaoAuthProfile
} from '../src/lib/server/auth/providerProfiles.js';

describe('OAuth provider profile mapping', () => {
  it('keeps the stable Google subject while hashing the email', () => {
    const profile = {
      sub: 'google-account-123',
      email: 'user@example.com',
      name: 'Google User'
    };

    const first = mapGoogleAuthProfile(profile);
    const second = mapGoogleAuthProfile(profile);

    expect(first.id).toBe(profile.sub);
    expect(second.id).toBe(first.id);
    expect(first.email).not.toBe(profile.email);
    expect(first.email).toBe(second.email);
  });

  it('keeps the stable Kakao account id while hashing the email', () => {
    const profile = {
      id: 987654321,
      kakao_account: {
        email: 'user@kakao.example',
        profile: { nickname: 'Kakao User' }
      }
    };

    const first = mapKakaoAuthProfile(profile);
    const second = mapKakaoAuthProfile(profile);

    expect(first.id).toBe(String(profile.id));
    expect(second.id).toBe(first.id);
    expect(first.email).not.toBe(profile.kakao_account.email);
    expect(first.email).toBe(second.email);
  });
});
