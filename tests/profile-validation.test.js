import { describe, expect, it } from 'vitest';

import { getProfileValidationMessage } from '../src/lib/util/profileValidation.js';

describe('profile validation message', () => {
  it('asks for a nickname when nickname is empty', () => {
    expect(
      getProfileValidationMessage({
        nickname: '',
        nicknameInvalid: false
      })
    ).toBe('닉네임을 입력해주세요.');
  });

  it('explains nickname rules when nickname is invalid', () => {
    expect(
      getProfileValidationMessage({
        nickname: 'a',
        nicknameInvalid: true,
        nicknameTaken: false
      })
    ).toBe('닉네임은 2~15글자로 입력해주세요.');
  });

  it('explains when nickname is already taken', () => {
    expect(
      getProfileValidationMessage({
        nickname: 'validname',
        nicknameInvalid: true,
        nicknameTaken: true
      })
    ).toBe('사용중인 아이디 입니다.');
  });

  it('allows an empty optional introduction', () => {
    expect(
      getProfileValidationMessage({
        nickname: 'validname',
        nicknameInvalid: false
      })
    ).toBeNull();
  });

  it('returns null when profile input is valid', () => {
    expect(
      getProfileValidationMessage({
        nickname: 'validname',
        nicknameInvalid: false
      })
    ).toBeNull();
  });
});
