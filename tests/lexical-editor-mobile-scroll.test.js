import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editor = readFileSync('src/lib/components/LexicalEditor.svelte', 'utf8');

describe('Lexical editor mobile scrolling', () => {
  it('lets the page scroll instead of creating a fixed-height editable scroller', () => {
    const editorBoxes = [...editor.matchAll(/\.lexical-editor__box\s*\{([^}]*)\}/g)].map(
      (match) => match[1]
    );

    expect(editorBoxes.length).toBeGreaterThan(0);
    expect(editorBoxes[0]).toContain('min-height: 450px;');
    for (const editorBox of editorBoxes) {
      expect(editorBox).not.toMatch(/max-height\s*:/);
      expect(editorBox).not.toMatch(/overflow-y\s*:/);
    }
  });
});
