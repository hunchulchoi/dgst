import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editor = readFileSync('src/lib/components/LexicalEditor.svelte', 'utf8');

describe('Lexical editor mobile scrolling', () => {
  it('lets the page scroll instead of creating a fixed-height editable scroller', () => {
    const editorBox = editor.match(/\.lexical-editor__box\s*\{([\s\S]*?)\n  \}/)?.[1] ?? '';

    expect(editorBox).toContain('min-height: 450px;');
    expect(editorBox).not.toMatch(/max-height\s*:/);
    expect(editorBox).not.toMatch(/overflow-y\s*:/);
  });
});
