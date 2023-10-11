import { redirect } from '@sveltejs/kit';
import { goto } from '$app/navigation';
import { onMount } from 'svelte';
import { browser } from '$app/environment';

export const load = async (event) => {
  const session = await event.locals.getSession();

  /*console.debug('======== layout.server load ======');
	console.debug('session', session);
	console.debug('//======== layout.server load ======');*/

  return {
    session
  };
};
