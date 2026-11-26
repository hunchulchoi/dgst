import { describe, expect, it } from 'vitest';

import { getNicknameError } from '../src/lib/util/nickname.js';
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

  it('explains that the robot emoji is reserved for bots', () => {
    expect(
      getProfileValidationMessage({
        nickname: '내닉🤖',
        nicknameInvalid: true,
        nicknameTaken: false
      })
    ).toBe('🤖는 봇 전용 이모티콘입니다.');
  });
});

describe('nickname error message', () => {
  it('reports the bot-only emoji before the length rule', () => {
    expect(getNicknameError('🤖')).toBe('🤖는 봇 전용 이모티콘입니다.');
    expect(getNicknameError('a🤖')).toBe('🤖는 봇 전용 이모티콘입니다.');
  });

  it('reports the length rule for too short or too long nicknames', () => {
    expect(getNicknameError('a')).toBe('닉네임은 2~15글자로 입력해주세요.');
    expect(getNicknameError('가'.repeat(16))).toBe('닉네임은 2~15글자로 입력해주세요.');
  });

  it('accepts a valid nickname', () => {
    expect(getNicknameError('리센느')).toBeNull();
  });
});
