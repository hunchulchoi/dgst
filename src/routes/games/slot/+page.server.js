import connectDB from '$lib/database/mongoosePriomise.js';
import { GameScore } from '$lib/models/gameScore.js';

connectDB();

export async function load({ locals }) {
  const session = await locals.auth();
  const email = session?.user?.email;
  let balance = 0;
  if (email) {
    const last = await GameScore.findOne({ email }).sort({ createdAt: -1 }).select({ balance: 1 }).lean();
    balance = last?.balance ?? 0;
  }
  return { session, balance };
}


