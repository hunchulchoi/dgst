import { error } from '@sveltejs/kit';

export const load = () => {
  if (process.env.PLAYWRIGHT_SMOKE !== '1') {
    throw error(404, { message: 'Not found' });
  }

  return {};
};
