import { User } from '$lib/models/user.js';
import connectDB from '$lib/database/mongoosePriomise.js';

connectDB();

/**
 * 가입시에 닉네임 중복 검사를 한다.
 * @param params
 * @returns {Promise<Response>} status가 200이면 중복, 204면 없음
 * @constructor
 */
export async function GET({ params, locals }) {
  const { nickname } = params;

  const session = await locals.getSession();

  const email = session?.user?.email;

  const found = await User.find({ nickname, email}).count();

  console.debug('found', found);

  if (!found) return new Response(null, { status: 204 });

  return new Response(found, { status: 200 });
}
