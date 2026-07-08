import { describe, expect, it } from 'vitest';

import { getProfileValidationMessage } from '../src/lib/util/profileValidation.js';

describe('profile validation message', () => {
  it('asks for a nickname when nickname is empty', () => {
    expect(
      getProfileValidationMessage({
        nickname: '',
        introduction: 'hello',
        nicknameInvalid: false,
        introductionInvalid: false
      })
    ).toBe('닉네임을 입력해주세요.');
  });

  it('explains nickname rules when nickname is invalid', () => {
    expect(
      getProfileValidationMessage({
        nickname: 'a',
        introduction: 'hello',
        nicknameInvalid: true,
        nicknameTaken: false,
        introductionInvalid: false
      })
    ).toBe('닉네임은 2~15글자로 입력해주세요.');
  });

  it('explains when nickname is already taken', () => {
    expect(
      getProfileValidationMessage({
        nickname: 'validname',
        introduction: 'hello',
        nicknameInvalid: true,
        nicknameTaken: true,
        introductionInvalid: false
      })
    ).toBe('사용중인 아이디 입니다.');
  });

  it('asks for an introduction when introduction is empty', () => {
    expect(
      getProfileValidationMessage({
        nickname: 'validname',
        introduction: '',
        nicknameInvalid: false,
        introductionInvalid: false
      })
    ).toBe('자기소개를 입력해주세요.');
  });

  it('returns null when profile input is valid', () => {
    expect(
      getProfileValidationMessage({
        nickname: 'validname',
        introduction: 'hello',
        nicknameInvalid: false,
        introductionInvalid: false
      })
    ).toBeNull();
  });
});
