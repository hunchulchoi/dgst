import { describe, expect, it } from 'vitest';
import {
  mapGoogleAuthProfile,
  mapKakaoAuthProfile
} from '../src/lib/server/auth/providerProfiles.js';
import { createAuthProviders } from '../src/lib/server/auth/providers.js';

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

  it('never changes Google account identity when mutable profile fields change', () => {
    const first = mapGoogleAuthProfile({
      sub: 'google-account-123',
      email: 'old@example.com',
      name: 'Old Name'
    });
    const changed = mapGoogleAuthProfile({
      sub: 'google-account-123',
      email: 'new@example.com',
      name: 'New Name'
    });

    expect(changed.id).toBe(first.id);
    expect(changed.id).toBe('google-account-123');
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

  it('never changes Kakao account identity when mutable profile fields change', () => {
    const first = mapKakaoAuthProfile({
      id: 987654321,
      kakao_account: { email: 'old@example.com', profile: { nickname: 'Old' } }
    });
    const changed = mapKakaoAuthProfile({
      id: 987654321,
      kakao_account: { email: 'new@example.com', profile: { nickname: 'New' } }
    });

    expect(changed.id).toBe(first.id);
    expect(changed.id).toBe('987654321');
  });

  it('wires the stable identity mappers into the actual Auth.js providers', () => {
    const providers = createAuthProviders({
      googleClientId: 'google-client',
      googleClientSecret: 'google-secret',
      kakaoClientId: 'kakao-client',
      kakaoClientSecret: 'kakao-secret'
    });

    const google = providers.find((provider) => provider.id === 'google');
    const kakao = providers.find((provider) => provider.id === 'kakao');

    expect(google?.options?.profile).toBe(mapGoogleAuthProfile);
    expect(kakao?.options?.profile).toBe(mapKakaoAuthProfile);
  });
});
