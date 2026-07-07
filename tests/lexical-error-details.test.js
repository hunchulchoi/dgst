import { describe, expect, it } from 'vitest';

import { createLexicalEditorFailureDetails } from '../src/lib/util/lexicalErrorDetails.js';

describe('createLexicalEditorFailureDetails', () => {
  it('extracts minified Lexical error code and editor state diagnostics', () => {
    const rootElement = {
      tagName: 'DIV',
      childElementCount: 3,
      textContent: 'hello saved body',
      innerHTML:
        '<p>hello saved body</p><audio src="/a.m4a" controls></audio><img src="/i.png" alt="">',
      /** @param {string} selector */
      querySelectorAll(selector) {
        return /** @type {Record<string, unknown[]>} */ ({
          img: [1],
          video: [],
          audio: [1],
          iframe: []
        })[selector];
      }
    };

    const details = createLexicalEditorFailureDetails({
      error: new Error(
        'Minified Lexical error #282; visit https://lexical.dev/docs/error?code=282&v=foo for the full message.'
      ),
      phase: 'lexical-editor-runtime',
      editorData: '<p>hello saved body</p>',
      lastSyncedEditorData: '<p>previous</p>',
      isComposing: true,
      rootElement,
      editorStateDetails: {
        lexicalRootChildren: 2,
        lexicalRootTextLength: 16,
        lexicalSelectionType: 'range'
      }
    });

    expect(details).toMatchObject({
      phase: 'lexical-editor-runtime',
      lexicalErrorCode: '282',
      lexicalErrorUrl: 'https://lexical.dev/docs/error?code=282&v=foo',
      editorDataLength: 23,
      lastSyncedEditorDataLength: 15,
      isComposing: true,
      rootElementChildElementCount: 3,
      rootElementAudioCount: 1,
      rootElementImageCount: 1,
      lexicalRootChildren: 2,
      lexicalRootTextLength: 16,
      lexicalSelectionType: 'range'
    });
    expect(details.editorDataPreview).toContain('hello saved body');
    expect(details.rootElementHtmlPreview).toContain('<audio');
  });
});
