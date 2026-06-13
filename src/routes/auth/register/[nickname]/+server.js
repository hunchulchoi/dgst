import { getPrisma } from '$lib/database/prisma.js';

/**
 * 가입시에 닉네임 중복 검사를 한다.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {Promise<Response>} status가 200이면 중복, 204면 없음
 */
export async function GET({ params, locals }) {
  const { nickname } = params;

  const session = await locals.auth();

  const email = session?.user?.email;

  try {
    /** @type {import('@prisma/client').Prisma.UserWhereInput} */
    const where = { nickname };
    if (email) where.email = { not: email };

    const found = await getPrisma().user.count({ where });

    console.debug('found', found);

    if (!found) return new Response(null, { status: 204 });

    return new Response(found.toString(), { status: 200 });
  } catch (err) {
    console.error('닉네임 중복 검사 실패', err);
    return new Response(null, { status: 500 });
  }
}
