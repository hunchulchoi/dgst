import { redirect } from '@sveltejs/kit';
import { takeSignInRecovery } from '$lib/server/auth/recovery.js';

export async function load(event) {
  const errorParam = event.url.searchParams.get('error');
  const recovery = takeSignInRecovery(event.cookies, errorParam);
  const session = await event.locals.auth();
  if (session?.user?.nickname) {
    throw redirect(302, '/');
  }
  // The auth callback hook records failures once. Viewing this page is not a new attempt.

  return { error: errorParam, recovery };
}
