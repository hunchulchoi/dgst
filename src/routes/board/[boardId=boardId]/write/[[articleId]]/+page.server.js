import { error, isHttpError } from '@sveltejs/kit';
import { Article } from '$lib/models/article.js';
import { checkAndLogSessionDevice } from '$lib/server/auth/checkSessionDevice.js';
import { sanitizeArticleContent } from '$lib/server/sanitizeArticleContent.js';
import connectDB from '$lib/database/mongoosePriomise.js';
import { bustBoardListCache } from '$lib/server/boardListLoad.js';
import logger from '$lib/util/logger.js';
import { traceFromUnknown } from '$lib/util/formatErrorTrace.js';

export const actions = {
  default: async (event) => {
    const { request, params, locals } = event;
    const session = await locals.auth();

    if (!session?.user?.nickname) {
      throw error(401, { message: '권한이 없습니다. 로그인 해 주세요' });
    }

    if (!session.user.email) {
      throw error(401, { message: '계정 정보가 올바르지 않습니다. 다시 로그인해 주세요.' });
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

    const normalizedContent = String(rawContent).replace(
      /<p>\s*<br\s*\/?>(\s|\u00A0)*<\/p>/g,
      '<br>'
    );
    const processedContent = sanitizeArticleContent(normalizedContent);

    try {
      await connectDB();

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

        await bustBoardListCache(params.boardId);

        return { success: true, articleId: params.articleId };
      }

      const article = new Article({
        email: session.user.email,
        nickname: session.user.nickname,
        boardId: params.boardId,
        title: String(rawTitle).trim(),
        content: processedContent
      });

      const inserted = await article.save();

      await bustBoardListCache(params.boardId);

      return { success: true, articleId: inserted._id.toString() };
    } catch (err) {
      if (isHttpError(err)) throw err;

      logger.error({
        message: '[board.write] save failed',
        boardId: params.boardId,
        articleId: params.articleId ?? null,
        email: session.user.email,
        errorMessage: err instanceof Error ? err.message : String(err),
        trace: traceFromUnknown(err)
      });
      throw error(500, { message: '저장 중 오류가 발생하였습니다. 잠시 후 다시 시도해 주세요.' });
    }
  }
};

export const load = async ({ params, locals }) => {
  const session = await locals.auth();

  if (!session?.user?.nickname) {
    throw error(401, { message: '권한이 없습니다. 로그인 해 주세요' });
  }

  if (!params.articleId) {
    return {};
  }

  try {
    await connectDB();

    const article = await Article.findById(params.articleId)
      .where('state')
      .equals('write')
      .where('email')
      .equals(session.user.email)
      .lean()
      .exec();

    if (!article) {
      throw error(404, { message: '글을 찾을 수 없습니다.' });
    }

    return JSON.parse(JSON.stringify(article));
  } catch (err) {
    if (isHttpError(err)) throw err;

    logger.error({
      message: '[board.write] load failed',
      articleId: params.articleId,
      errorMessage: err instanceof Error ? err.message : String(err),
      trace: traceFromUnknown(err)
    });
    throw error(500, { message: '글을 불러오지 못했습니다.' });
  }
};
