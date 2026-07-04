const DEFAULT_PROFILE_SAVE_ERROR_MESSAGE = '저장 중에 오류가 발생하였습니다.';

/**
 * @param {Response} response
 * @returns {Promise<string>}
 */
export async function getProfileSaveErrorMessage(response) {
  try {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (data && typeof data === 'object' && 'message' in data) {
        const message = String(data.message || '').trim();
        if (message) return message;
      }
    }

    const text = await response.text();
    if (text.trim()) return text.trim();
  } catch {
    // Fall through to the default message when the error response cannot be read.
  }

  return DEFAULT_PROFILE_SAVE_ERROR_MESSAGE;
}
