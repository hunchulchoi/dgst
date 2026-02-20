import { error, json } from '@sveltejs/kit';
import { Article } from '$lib/models/article.js';
import { checkAndLogSessionDevice } from '$lib/server/auth/checkSessionDevice.js';
import connectDB from '$lib/database/mongoosePriomise.js';

connectDB();
export const actions = {
  default: async (event) => {
    const { request, params, locals } = event;
    const session = await locals.auth();

    if (!session?.user?.nickname) {
      throw error(401, { message: '권한이 없습니다. 로그인 해 주세요' });
    }

    await checkAndLogSessionDevice(event, { action: 'board.write' });

    const data = await request.formData();

    //console.log(data);

    // title 검증
    const rawTitle = data.get('title');
    if (!rawTitle || String(rawTitle).trim().length === 0) {
      throw error(400, { message: '제목을 입력해주세요.' });
    }

    // content 검증 (null, undefined 체크)
    const rawContent = data.get('content');
    if (!rawContent || String(rawContent).trim().length === 0) {
      throw error(400, { message: '본문을 입력해주세요.' });
    }

    const processedContent = String(rawContent).replace(
      /<p>\s*<br\s*\/?>(\s|\u00A0)*<\/p>/g,
      '<br>'
    );

    try {
      if (params.articleId) {
        const update = await Article.findOneAndUpdate(
          { _id: params.articleId, email: session.user.email, state: 'write' },
          {
            title: String(rawTitle).trim(),
            content: processedContent,
            modified_email: session.user.email
          },
          { timestamps: true }
        );

        if (!update) {
          throw error(401, {
            message: '업데이트 되지 않았습니다. 이미 삭제되었거나 권한이 없는 것 같습니다.'
          });
        }

        // 글 수정 시 기존 articleId 반환
        return { success: true, articleId: params.articleId };
      } else {
        const article = new Article({
          email: session.user.email,
          nickname: session.user.nickname,
          boardId: params.boardId,
          title: String(rawTitle).trim(),
          content: processedContent
        });

        //console.log(article);

        const inserted = await article.save();
        //console.log('inserted', inserted);

        // 새 글 작성 시 articleId 반환
        return { success: true, articleId: inserted._id.toString() };
      }
    } catch (err) {
      console.error('게시글 저장 실패', err);
      throw error(500, { message: '저장 중 오류가 발생하였습니다.ㅜㅜ' });
    }
  }
};

export const load = async ({ params, locals }) => {
  const session = await locals.auth();

  if (!session?.user?.nickname) {
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
