import { describe, expect, it } from 'vitest';
import { readPasteData } from '../src/lib/util/pasteData.js';

/** @param {Partial<DataTransfer>} value */
const transfer = (value) => /** @type {DataTransfer} */ (value);

describe('mobile paste data', () => {
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
});
