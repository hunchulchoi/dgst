import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = readFileSync('src/routes/+layout.svelte', 'utf8');

describe('page transition navigation blur', () => {
  it('applies visible blur immediately while board detail navigation is pending', () => {
    expect(layout).toContain('page-transition-navigating');
    expect(layout).toContain('class:page-transition-navigating={boardListToDetailBlur}');
    expect(layout).toContain('filter: blur(3px)');
  });

  it('starts the immediate blur when board pagination navigates between list pages', () => {
    expect(layout).toContain('function isBoardListNavigation(fromPathname, toPathname)');
    expect(layout).toContain('isBoardListPath(fromPathname) && isBoardListPath(toPathname)');
    expect(layout).toContain('isBoardListNavigation(from.url.pathname, to.url.pathname)');
  });

  it('starts the immediate blur when returning from a board detail page to a board list page', () => {
    expect(layout).toContain('function isBoardDetailToListNavigation(fromPathname, toPathname)');
    expect(layout).toContain('isBoardDetailPath(fromPathname) && isBoardListPath(toPathname)');
    expect(layout).toContain('isBoardDetailToListNavigation(from.url.pathname, to.url.pathname)');
  });
});
