import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editor = readFileSync('src/lib/components/LexicalEditor.svelte', 'utf8');

describe('Lexical editor media deletion', () => {
  it('adds an editor-only delete button to non-editable media blocks', () => {
    expect(editor).toContain("deleteButton.setAttribute('aria-label', '미디어 삭제')");
    expect(editor).toContain('const node = getNodeByKey(nodeKey);');
    expect(editor).toContain('if (node instanceof HtmlBlockNode) node.remove();');
    expect(editor).toContain(".lexical-editor__content :global(.lexical-html-block__delete)");
  });

  it('does not export the editor delete control with article HTML', () => {
    const exportDom = editor.match(/exportDOM\(\)\s*\{([\s\S]*?)\n    \}/)?.[1] ?? '';

    expect(exportDom).toContain('element.innerHTML = this.__html;');
    expect(exportDom).not.toContain('lexical-html-block__delete');
  });
});
