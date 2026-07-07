const PREVIEW_LIMIT = 500;

/** @param {unknown} value */
function asString(value) {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'message' in value) {
    return String(/** @type {{ message?: unknown }} */ (value).message ?? '');
  }
  return String(value ?? '');
}

/**
 * @param {string | undefined} value
 * @param {number} max
 */
function preview(value, max = PREVIEW_LIMIT) {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

/** @param {unknown} error */
function getStackHead(error) {
  if (!(error instanceof Error) || !error.stack) return undefined;
  return preview(error.stack.split('\n').slice(0, 6).join('\n'), 1000);
}

/** @param {string} message */
function parseLexicalMinifiedError(message) {
  const code = message.match(/Minified Lexical error #(\d+)/)?.[1];
  const url = message.match(/https:\/\/lexical\.dev\/docs\/error\?[^\s;)]+/)?.[0];
  return { code, url };
}

/**
 * @param {Element | { querySelectorAll?: (selector: string) => unknown[] | { length: number } } | null | undefined} rootElement
 * @param {string} selector
 */
function countInRoot(rootElement, selector) {
  try {
    const matches = rootElement?.querySelectorAll?.(selector);
    return typeof matches?.length === 'number' ? matches.length : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param {{
 *   error: unknown;
 *   phase: string;
 *   editorData?: string;
 *   lastSyncedEditorData?: string;
 *   isComposing?: boolean;
 *   rootElement?: (Element & { innerHTML?: string }) | {
 *     tagName?: string;
 *     childElementCount?: number;
 *     textContent?: string | null;
 *     innerHTML?: string;
 *     querySelectorAll?: (selector: string) => unknown[] | { length: number };
 *   } | null;
 *   editorStateDetails?: Record<string, unknown>;
 *   eventDetails?: Record<string, unknown>;
 * }} input
 */
export function createLexicalEditorFailureDetails(input) {
  const message = asString(input.error);
  const { code, url } = parseLexicalMinifiedError(message);
  const rootElement = input.rootElement;
  const rootText = rootElement?.textContent ?? '';
  const editorData = input.editorData ?? '';
  const lastSyncedEditorData = input.lastSyncedEditorData ?? '';

  return {
    phase: input.phase,
    errorMessage: preview(message, 1000),
    errorStackHead: getStackHead(input.error),
    ...(code && { lexicalErrorCode: code }),
    ...(url && { lexicalErrorUrl: url }),
    lexicalErrorDocsHint: code
      ? `Open ${url ?? `https://lexical.dev/docs/error?code=${code}`} in a dev browser for the full message.`
      : undefined,
    editorDataLength: editorData.length,
    editorDataPreview: preview(editorData),
    lastSyncedEditorDataLength: lastSyncedEditorData.length,
    lastSyncedEditorDataPreview: preview(lastSyncedEditorData),
    isComposing: input.isComposing === true,
    rootElementTagName: rootElement?.tagName,
    rootElementChildElementCount: rootElement?.childElementCount,
    rootElementTextLength: rootText.length,
    rootElementTextPreview: preview(rootText),
    rootElementHtmlLength: rootElement?.innerHTML?.length,
    rootElementHtmlPreview: preview(rootElement?.innerHTML),
    rootElementImageCount: countInRoot(rootElement, 'img'),
    rootElementVideoCount: countInRoot(rootElement, 'video'),
    rootElementAudioCount: countInRoot(rootElement, 'audio'),
    rootElementIframeCount: countInRoot(rootElement, 'iframe'),
    ...input.editorStateDetails,
    ...input.eventDetails
  };
}
