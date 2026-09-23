import { describe, expect, it } from 'vitest';
import { collectCloudflareChunkHeaders } from './reportClientPageError.js';

describe('collectCloudflareChunkHeaders', () => {
  it('keeps the Cloudflare headers needed to diagnose a failed chunk', () => {
    const headers = new Headers({
      'cf-ray': 'abc123-ICN',
      'cf-cache-status': 'HIT',
      'cf-mitigated': 'challenge'
    });

    expect(collectCloudflareChunkHeaders(headers)).toEqual({
      chunkCfRay: 'abc123-ICN',
      chunkCfCacheStatus: 'HIT',
      chunkCfMitigated: 'challenge'
    });
  });

  it('omits unavailable Cloudflare headers', () => {
    expect(collectCloudflareChunkHeaders(new Headers())).toEqual({});
  });
});
