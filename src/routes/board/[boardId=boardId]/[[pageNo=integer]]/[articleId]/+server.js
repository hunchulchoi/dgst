import { error } from '@sveltejs/kit';
import { Article } from '$lib/models/article.js';
import {Alarm} from "$lib/models/alarm.js";

export async function DELETE({ request, params, locals }) {
  console.debug('request', params);

  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    console.error('invalid', params);
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.getSession();

  console.debug('user', session);

  // 권한 검사
  if (!session?.user?.nickname) {
    throw error(401, { message: '권한이 없습니다. 로그인 해주세요' });
  }

  const data = await request.json();

  console.log('DELETE data', data);

  try {
    const update = await Article.findOneAndUpdate(
      { _id: articleId, boardId, email: session.user.email, state: 'write' },
      { state: 'deleted', modified_email: session.user.email },
      { timestamps: true }
    );

    console.debug('update', update);

    if (!update) {
      throw error(401, {
        message: '삭제 되지 않았습니다. 이미 삭제되었거나 권한이 없는 것 같습니다.'
      });
    }

    // 알람 삭제
    const deleteAlarm = await Alarm.deleteMany({articleId: params.articleId});
    console.log('delete alarm', deleteAlarm);

  } catch (err) {
    console.error(err);
    throw error(err.status, err.body.message ?? '삭제 중에 오류가 발생하였습니다.');
  }

  return new Response('ok', { status: 200 });
}
