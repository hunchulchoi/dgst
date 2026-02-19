import connectDB from '$lib/database/mongoosePriomise.js';

connectDB();

export async function load({ locals }) {
  const session = await locals.auth();
  return { session };
}
