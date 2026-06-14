import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modalSource = readFileSync('src/lib/components/ui/modal.svelte', 'utf8');

describe('modal accessibility behavior', () => {
  it('supports keyboard dismissal on the modal backdrop container', () => {
    expect(modalSource).toContain('onkeydown=');
    expect(modalSource).toContain("e.key === 'Escape'");
    expect(modalSource).toContain("e.key === 'Enter'");
    expect(modalSource).toContain("e.key === ' '");
    expect(modalSource).toContain('e.target !== e.currentTarget');
  });
});
