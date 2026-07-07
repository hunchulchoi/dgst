import { error } from '@sveltejs/kit';

export const load = ({ url }) => {
  if (process.env.PLAYWRIGHT_SMOKE !== '1') {
    throw error(404, { message: 'Not found' });
  }

  return { initialHtml: url.searchParams.get('initialHtml') ?? '' };
};
