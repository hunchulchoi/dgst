import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadOptionalClientModule } from '../src/lib/util/loadOptionalClientModule.js';
import { reportClientError } from '../src/lib/util/reportClientPageError.js';

vi.mock('../src/lib/util/reportClientPageError.js', () => ({ reportClientError: vi.fn() }));

const context = {
  pathname: '/board/free/1/article',
  component: 'board-article',
  operation: 'load-comment-renderer',
  importTarget: '$lib/util/embeder.js'
};

describe('optional client module loading', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the loaded module without reporting an error', async () => {
    const module = { viewComment: vi.fn() };
    await expect(loadOptionalClientModule(() => Promise.resolve(module), context)).resolves.toBe(
      module
    );
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it('resolves to a fallback and identifies imports even when Safari omits the URL', async () => {
    const error = new TypeError('Importing a module script failed.');
    await expect(
      loadOptionalClientModule(() => Promise.reject(error), context)
    ).resolves.toBeNull();
    expect(reportClientError).toHaveBeenCalledExactlyOnceWith(error, {
      ...context,
      type: 'module-import-error',
      message: 'Optional client module failed to load',
      phase: 'module-import'
    });
  });
});
