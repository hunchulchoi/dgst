import { describe, expect, it } from 'vitest';

import {
  getInitialLoadMeasurement,
  MAX_INITIAL_LOAD_DURATION_MS
} from '../src/lib/util/logSlowLoad.js';

describe('initial browser load measurement', () => {
  it('uses the navigation entry URL instead of the path at report time', () => {
    expect(
      getInitialLoadMeasurement(
        {
          startTime: 0,
          loadEventEnd: 2355,
          name: 'https://www.dgst.me/board/free/1/original?from=alarm'
        },
        '/board/free/1/current'
      )
    ).toEqual({
      durationMs: 2355,
      pathname: '/board/free/1/original'
    });
  });

  it('drops measurements longer than five minutes as suspended-tab samples', () => {
    expect(
      getInitialLoadMeasurement(
        {
          startTime: 0,
          loadEventEnd: 4_959_724,
          name: 'https://www.dgst.me/board/free/1/article'
        },
        '/board/free/1/article'
      )
    ).toBeNull();
  });

  it('keeps the five-minute boundary and falls back for an invalid entry URL', () => {
    expect(
      getInitialLoadMeasurement(
        {
          startTime: 0,
          loadEventEnd: MAX_INITIAL_LOAD_DURATION_MS,
          name: ''
        },
        '/fallback'
      )
    ).toEqual({
      durationMs: MAX_INITIAL_LOAD_DURATION_MS,
      pathname: '/fallback'
    });
  });
});
