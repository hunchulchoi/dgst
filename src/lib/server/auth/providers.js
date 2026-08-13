import GoogleProvider from '@auth/core/providers/google';
import KakaoProvider from '@auth/core/providers/kakao';
import { mapGoogleAuthProfile, mapKakaoAuthProfile } from './providerProfiles.js';

/**
 * OAuth 계정 연결 불변 규칙:
 * provider profile의 id는 accounts.provider_account_id가 된다.
 * 반드시 제공자의 안정적인 계정 ID를 사용하고 UUID 등 임의 값으로 대체하지 않는다.
 * users.id 익명화는 Auth.js adapter/DB 계층에서만 처리한다.
 *
 * @param {{
 *   googleClientId: string,
 *   googleClientSecret: string,
 *   kakaoClientId: string,
 *   kakaoClientSecret: string
 * }} config
 */
export function createAuthProviders(config) {
  return [
    GoogleProvider({
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      profile: mapGoogleAuthProfile
    }),
    KakaoProvider({
      clientId: config.kakaoClientId,
      clientSecret: config.kakaoClientSecret,
      profile: mapKakaoAuthProfile
    })
  ];
}
