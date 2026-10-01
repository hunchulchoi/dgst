import { describe, expect, it, vi } from 'vitest';
import {
  dataUrlToFile,
  isAttachmentPasteEvent,
  readClipboardImageFiles,
  readPasteData,
  readPasteDataAsync
} from '../src/lib/util/pasteData.js';

/** @param {Partial<DataTransfer>} value */
const transfer = (value) => /** @type {DataTransfer} */ (value);

describe('mobile paste data', () => {
  it.each([
    'insertText',
    'insertCompositionText',
    'insertFromComposition',
    'deleteCompositionText',
    'deleteByComposition',
    'deleteContentBackward',
    'deleteContentForward',
    'insertParagraph'
  ])('leaves %s events to native typing and Korean IME', (inputType) => {
    expect(isAttachmentPasteEvent({ type: 'beforeinput', inputType })).toBe(false);
  });

  it('ignores composing events even when they appear to carry a paste', () => {
    expect(
      isAttachmentPasteEvent({
        type: 'beforeinput',
        inputType: 'insertFromPaste',
        isComposing: true
      })
    ).toBe(false);
  });

  it('keeps empty mobile paste events eligible for asynchronous image lookup', () => {
    expect(isAttachmentPasteEvent({ type: 'paste' })).toBe(true);
    expect(isAttachmentPasteEvent({ type: 'beforeinput', inputType: 'insertFromPaste' })).toBe(
      true
    );
  });

  it('accepts keyboard image insertion only when it carries an actual file', () => {
    const file = new File(['image bytes'], 'photo.png', { type: 'image/png' });
    const dataTransfer = transfer({
      files: /** @type {FileList} */ (/** @type {unknown} */ ([file])),
      getData: () => ''
    });
    expect(
      isAttachmentPasteEvent({ type: 'beforeinput', inputType: 'insertText', dataTransfer })
    ).toBe(true);
    expect(
      isAttachmentPasteEvent({
        type: 'beforeinput',
        inputType: 'deleteContentBackward',
        dataTransfer
      })
    ).toBe(false);
  });

  it('reads beforeinput text without a clipboard event, preserving whitespace', () => {
    expect(readPasteData({ data: ' first\nsecond ' })).toEqual({
      files: [],
      text: ' first\nsecond '
    });
    expect(
      readPasteData({
        dataTransfer: transfer({ getData: () => 'https://youtu.be/example' })
      }).text
    ).toBe('https://youtu.be/example');
  });

  it('recovers an image from items and gives an extensionless clipboard image a filename', async () => {
    const file = new File(['image bytes'], 'image', { type: 'image/png', lastModified: 123 });
    const { files } = readPasteData({
      dataTransfer: transfer({
        files: /** @type {FileList} */ (/** @type {unknown} */ ([])),
        items: /** @type {DataTransferItemList} */ (
          /** @type {unknown} */ ([
            { kind: 'string', getAsFile: () => null },
            { kind: 'file', getAsFile: () => file },
            { kind: 'file', getAsFile: () => null }
          ])
        ),
        getData: () => ''
      })
    });
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('image.png');
    expect(files[0].type).toBe('image/png');
    expect(files[0].lastModified).toBe(123);
    expect(await files[0].text()).toBe('image bytes');
  });

  it('keeps named files and does not duplicate files exposed through both lists', () => {
    const file = new File(['image bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const { files } = readPasteData({
      clipboardData: transfer({
        files: /** @type {FileList} */ (/** @type {unknown} */ ([file])),
        items: /** @type {DataTransferItemList} */ (
          /** @type {unknown} */ ([{ kind: 'file', getAsFile: () => file }])
        ),
        getData: () => ''
      })
    });
    expect(files).toEqual([file]);
    expect(files[0]).toBe(file);
  });

  it('does not invent extensions for unknown clipboard file types', () => {
    const file = new File(['bytes'], 'unknown', { type: 'application/octet-stream' });
    expect(
      readPasteData({
        clipboardData: transfer({
          files: /** @type {FileList} */ (/** @type {unknown} */ ([file])),
          getData: () => ''
        })
      }).files[0]
    ).toBe(file);
  });

  it('converts data:image base64 url from html into a File', async () => {
    // 1x1 transparent png in base64
    const base64Png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const file = dataUrlToFile(base64Png, 'sample');
    expect(file).not.toBeNull();
    expect(file?.name).toBe('sample.png');
    expect(file?.type).toBe('image/png');

    const result = readPasteData({
      clipboardData: transfer({
        files: /** @type {FileList} */ (/** @type {unknown} */ ([])),
        items: /** @type {DataTransferItemList} */ (/** @type {unknown} */ ([])),
        getData: (format) => (format === 'text/html' ? `<p><img src="${base64Png}" /></p>` : '')
      })
    });
    expect(result.files).toHaveLength(1);
    expect(result.files[0].type).toBe('image/png');
  });

  it('reads image asynchronously via navigator.clipboard.read() for mobile/Galaxy fallback', async () => {
    const mockBlob = new Blob(['sample-bytes'], { type: 'image/jpeg' });
    try {
      vi.stubGlobal('navigator', {
        clipboard: {
          read: vi.fn().mockResolvedValue([
            {
              types: ['image/jpeg'],
              getType: vi.fn().mockResolvedValue(mockBlob)
            }
          ])
        }
      });

      const files = await readClipboardImageFiles();
      expect(files).toHaveLength(1);
      expect(files[0].type).toBe('image/jpeg');
      expect(files[0].name).toBe('clipboard-image.jpg');

      const asyncResult = await readPasteDataAsync({
        clipboardData: transfer({
          files: /** @type {FileList} */ (/** @type {unknown} */ ([])),
          items: /** @type {DataTransferItemList} */ (/** @type {unknown} */ ([])),
          getData: () => ''
        })
      });
      expect(asyncResult.files).toHaveLength(1);
      expect(asyncResult.files[0].type).toBe('image/jpeg');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not read clipboard API if sync text is present', async () => {
    const mockRead = vi.fn();
    try {
      vi.stubGlobal('navigator', {
        clipboard: {
          read: mockRead
        }
      });

      const asyncResult = await readPasteDataAsync({
        clipboardData: transfer({
          files: /** @type {FileList} */ (/** @type {unknown} */ ([])),
          items: /** @type {DataTransferItemList} */ (/** @type {unknown} */ ([])),
          getData: () => 'some copied text'
        })
      });
      expect(mockRead).not.toHaveBeenCalled();
      expect(asyncResult.text).toBe('some copied text');
      expect(asyncResult.files).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
