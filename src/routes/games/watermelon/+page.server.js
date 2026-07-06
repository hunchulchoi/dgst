import { getGameSession } from '$lib/server/localGameSmokeSession.js';

export async function load(event) {
  const session = await getGameSession(event);
  return { session };
}
