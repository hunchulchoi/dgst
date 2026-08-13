import { describe, expect, it } from 'vitest';

import { getProfileSaveErrorMessage } from './profileSubmit.js';

describe('getProfileSaveErrorMessage', () => {
  it('uses the server JSON message when profile save fails', async () => {
    const response = new Response(
      JSON.stringify({ message: '닉네임에 사용할 수 없는 문자가 포함되어 있습니다.' }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' }
      }
    );

    await expect(getProfileSaveErrorMessage(response)).resolves.toBe(
      '닉네임에 사용할 수 없는 문자가 포함되어 있습니다.'
    );
  });

  it('uses a short text response when the server does not return JSON', async () => {
    const response = new Response('파일 저장 중 오류가 발생했습니다.', {
      status: 500,
      headers: { 'content-type': 'text/plain' }
    });

    await expect(getProfileSaveErrorMessage(response)).resolves.toBe(
      '파일 저장 중 오류가 발생했습니다.'
    );
  });
});
