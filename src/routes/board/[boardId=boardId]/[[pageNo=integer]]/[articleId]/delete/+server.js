import { error } from '@sveltejs/kit';
import { softDeleteArticleByOwner } from '$lib/server/board/articleRepo.js';
import { deleteAlarmsByArticle } from '$lib/server/alarm/alarmService.js';
import { bustBoardListCache } from '$lib/server/boardListLoad.js';

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function DELETE({ params, locals }) {
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
    const result = await softDeleteArticleByOwner(articleId, email, boardId);

    if (!result || result.count === 0) {
      throw error(401, {
        message: '삭제 되지 않았습니다. 이미 삭제되었거나 권한이 없는 것 같습니다.'
      });
    }

    await deleteAlarmsByArticle(articleId);
    await bustBoardListCache(boardId);
  } catch (err) {
    console.error(err);
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw error(500, { message: '삭제 중에 오류가 발생하였습니다.' });
  }

  return new Response('ok', { status: 200 });
}
