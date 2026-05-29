import { normalizeFreeBoardPath } from '$lib/util/boardPaths.js';

export const load = ({ url, data }) => {
  const { pathname, search } = url;

  return {
    pathname: normalizeFreeBoardPath(pathname, search || ''),
    session: data.session
  };
};
