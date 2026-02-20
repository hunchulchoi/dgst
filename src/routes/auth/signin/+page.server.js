import { redirect } from '@sveltejs/kit';

export async function load(event) {
  const session = await event.locals.auth();
  if (session?.user?.nickname) {
    throw redirect(302, '/');
  }
  return {};
}
