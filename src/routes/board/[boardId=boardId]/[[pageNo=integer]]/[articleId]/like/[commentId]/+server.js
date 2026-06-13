import { error } from '@sveltejs/kit';
import { toggleCommentLike, toCommentJson } from '$lib/server/board/commentRepo.js';

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function POST({ params, locals }) {
  const boardId = params.boardId;
  const articleId = params.articleId;
  const commentId = params.commentId;

  if (!boardId || !articleId || !commentId) {
    console.error('invalid', params);
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.auth();

  const email = typeof session?.user?.email === 'string' ? session.user.email : '';
  if (!session?.user?.nickname || !email) {
    throw error(401, { message: '권한이 없습니다. 로그인 해주세요' });
  }

  try {
    const comment = await toggleCommentLike(commentId, email, 'like');

    if (
      !comment ||
      comment.boardId !== boardId ||
      comment.articleId !== articleId ||
      comment.state !== 'write'
    ) {
      throw error(410, { message: '삭제되었거나 존지하지 않는 댓글입니다.' });
    }

    const commentJson = toCommentJson(comment);
    commentJson.liked = comment.likes.includes(email);
    delete commentJson.likes;

    return new Response(JSON.stringify(commentJson), { status: 200 });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw error(500, { message: '좋아요 처리 중 오류가 발생하였습니다.' });
  }
}
