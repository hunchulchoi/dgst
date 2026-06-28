/**
 * Browser/WebView fetches can reject with these when navigation, page freeze, or
 * transport teardown interrupts a non-critical request.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isInterruptedFetchError(error) {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError') return true;
  if (error.name !== 'TypeError') return false;

  return (
    error.message === 'Failed to fetch' ||
    error.message === 'Load failed' ||
    /NetworkError when attempting to fetch resource/i.test(error.message)
  );
}
