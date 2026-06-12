import { error, isHttpError } from '@sveltejs/kit';
import {
  createArticle,
  findArticleById,
  updateArticleByOwner
} from '$lib/server/board/articleRepo.js';
import { checkAndLogSessionDevice } from '$lib/server/auth/checkSessionDevice.js';
import { sanitizeArticleContent } from '$lib/server/sanitizeArticleContent.js';
import { bustBoardListCache } from '$lib/server/boardListLoad.js';
import logger from '$lib/util/logger.js';
import { traceFromUnknown } from '$lib/util/formatErrorTrace.js';
import {
  buildSubmitFingerprint,
  findRecentDuplicateArticle,
  tryAcquireSubmitDedup
} from '$lib/server/submitDedup.js';
import { validateArticleContent } from '$lib/util/articleContentValidation.js';

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

    const rawTitle = data.get('title');
    if (!rawTitle || String(rawTitle).trim().length === 0) {
      throw error(400, { message: '제목을 입력해주세요.' });
    }

    const rawContent = data.get('content');
    const normalizedContent = String(rawContent ?? '').replace(
      /<p>\s*<br\s*\/?>(\s|\u00A0)*<\/p>/g,
      '<br>'
    );
    const processedContent = sanitizeArticleContent(normalizedContent);

    const contentCheck = validateArticleContent(processedContent);
    if (!contentCheck.ok) {
      throw error(400, { message: contentCheck.message });
    }

    const titleTrim = String(rawTitle).trim();

    try {
      if (params.articleId) {
        const update = await updateArticleByOwner(
          params.articleId,
          session.user.email,
          params.boardId,
          {
            title: titleTrim,
            content: processedContent,
            modifiedEmail: session.user.email
          }
        );

        if (!update) {
          throw error(401, {
            message: '업데이트 되지 않았습니다. 이미 삭제되었거나 권한이 없는 것 같습니다.'
          });
        }

        await bustBoardListCache(params.boardId);

        return { success: true, articleId: params.articleId };
      }

      const fingerprint = buildSubmitFingerprint([
        params.boardId,
        titleTrim,
        processedContent
      ]);
      const acquired = await tryAcquireSubmitDedup('article', session.user.email, fingerprint, 15);
      if (!acquired) {
        const dup = await findRecentDuplicateArticle({
          email: session.user.email,
          boardId: params.boardId,
          title: titleTrim
        });
        if (dup?._id) {
          return { success: true, articleId: dup._id };
        }
      }

      const inserted = await createArticle({
        email: session.user.email,
        nickname: session.user.nickname,
        boardId: params.boardId,
        title: titleTrim,
        content: processedContent
      });

      await bustBoardListCache(params.boardId);

      return { success: true, articleId: inserted.id };
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

/** @param {import('@sveltejs/kit').ServerLoadEvent} event */
export const load = async ({ params, locals }) => {
  const session = await locals.auth();

  if (!session?.user?.nickname) {
    throw error(401, { message: '권한이 없습니다. 로그인 해 주세요' });
  }

  if (!params.articleId) {
    return {};
  }

  try {
    const article = await findArticleById(params.articleId, params.boardId, 'write');

    if (!article || article.email !== session.user.email) {
      throw error(404, { message: '글을 찾을 수 없습니다.' });
    }

    return {
      _id: article.id,
      email: article.email,
      nickname: article.nickname,
      boardId: article.boardId,
      title: article.title,
      content: article.content,
      state: article.state,
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.updatedAt.toISOString()
    };
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
