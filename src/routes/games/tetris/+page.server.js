import { getGameSession } from '$lib/server/localGameSmokeSession.js';

/** @param {import('./$types').PageServerLoadEvent} event */
export async function load(event) {
  const session = await getGameSession(event);
  return { session };
}
