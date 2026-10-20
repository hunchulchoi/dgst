import { redirect } from '@sveltejs/kit';

export async function load(event) {
  const session = await event.locals.auth();
  if (session?.user?.nickname) {
    throw redirect(302, '/');
  }
  const errorParam = event.url.searchParams.get('error');
  // The auth callback hook records failures once. Viewing this page is not a new attempt.

  return { error: errorParam };
}
