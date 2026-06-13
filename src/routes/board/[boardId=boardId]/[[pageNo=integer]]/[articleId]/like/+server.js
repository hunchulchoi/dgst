import { error } from '@sveltejs/kit';
import { findArticleById, toggleArticleLike, toArticleJson } from '$lib/server/board/articleRepo.js';

const THREE_DAYS_MS = 1000 * 60 * 60 * 24 * 3;

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function POST({ params, locals }) {
  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    console.error('invalid', params);
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.auth();

  const email = typeof session?.user?.email === 'string' ? session.user.email : '';
  if (!session?.user?.nickname || !email) {
    throw error(401, { message: '권한이 없습니다. 로그인 해주세요' });
  }

  try {
    const createdAfter = new Date(Date.now() - THREE_DAYS_MS);
    const article = await findArticleById(articleId, boardId, 'write');

    if (!article || article.createdAt <= createdAfter) {
      throw error(410, {
        message: `삭제되었거나 존지하지 않는 게시물입니다.
    게시물은 72시간만 조회 가능합니다.`
      });
    }

    const updated = await toggleArticleLike(articleId, email, 'like');
    if (!updated) {
      throw error(410, {
        message: `삭제되었거나 존지하지 않는 게시물입니다.
    게시물은 72시간만 조회 가능합니다.`
      });
    }

    const articleJson = toArticleJson(updated);
    articleJson.liked = updated.likes.includes(email);

    return new Response(JSON.stringify(articleJson), { status: 200 });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw error(500, { message: '좋아요 처리 중 오류가 발생하였습니다.' });
  }
}
