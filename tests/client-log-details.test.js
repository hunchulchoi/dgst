import { describe, expect, it } from 'vitest';

import { _sanitizeClientLogDetails } from '../src/routes/api/log/+server.js';

describe('sanitizeClientLogDetails', () => {
  it('preserves shallow objects inside the client event trace', () => {
    expect(
      _sanitizeClientLogDetails({
        clientEventTrace: [
          {
            event: 'navigation-start',
            fromPath: '/board/free',
            toPath: '/',
            online: true
          }
        ]
      })
    ).toEqual({
      clientEventTrace: [
        {
          event: 'navigation-start',
          fromPath: '/board/free',
          toPath: '/',
          online: true
        }
      ]
    });
  });
});
