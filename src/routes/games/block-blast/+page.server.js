import { getGameSession } from '$lib/server/localGameSmokeSession.js';

/** @param {import('./$types').PageServerLoadEvent} event */
export async function load(event) {
  return { session: await getGameSession(event) };
}
