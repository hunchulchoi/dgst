import { error, json } from '@sveltejs/kit';
import { Article } from '$lib/models/article.js';

import connectDB from '$lib/database/mongoosePriomise.js';

connectDB();
export const actions = {
  default: async ({ request, params, locals }) => {
    console.log('write.server default', request);

    const session = await locals.getSession();

    console.debug('user', session);

    // 권한 검사
    if (!session.user || !session.user.nickname) {
      throw error(401, { message: '권한이 없습니다.' });
    }

    const data = await request.formData();

    console.log(data);

    try {
      if (params.articleId) {
        const update = await Article.findOneAndUpdate(
          { _id: params.articleId, email: session.user.email, state: 'write' },
          {
            title: data.get('title'),
            content: data.get('content'),
            modified_email: session.user.email
          },
          { timestamps: true }
        );

        if (!update) {
          throw error(401, {
            message: '업데이트 되지 않았습니다. 이미 삭제되었거나 권한이 없는 것 같습니다.'
          });
        }
      } else {
        const article = new Article({
          email: session.user.email,
          nickname: session.user.nickname,
          boardId: params.boardId,
          title: data.get('title'),
          content: data.get('content')
        });

        console.log(article);

        const inserted = await article.save();
        console.log('inserted', inserted);
      }
    } catch (error) {
      console.error('게시글 저장 실패', error);
      throw error(500, { message: '저장 중 오류가 발생하였습니다.ㅜㅜ' });
    }

    return { success: true };
  }
};

export const load = async ({ params, locals }) => {
  const session = await locals.getSession();

  if (!session?.user.nickname) {
    throw error(401, { message: '권한이 없습니다. 로그인 해 주세요' });
  }

  if (params.articleId) {
    const article = await Article.findById(params.articleId)
      .where('state')
      .equals('write')
      .where('email')
      .equals(session.user.email)
      .exec();

    return JSON.parse(JSON.stringify(article));
  }

  return {};
};
