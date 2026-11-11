import crypto from 'node:crypto';
import { getPrisma } from '$lib/database/prisma.js';
import { createArticle, softDeleteArticleByOwner } from '$lib/server/board/articleRepo.js';
import {
  createComment,
  findCommentById,
  findOwnedActiveComment,
  softDeleteComment
} from '$lib/server/board/commentRepo.js';
import {
  deleteAlarmsByArticle,
  removeCommentFromAlarm,
  upsertAlarm
} from '$lib/server/alarm/alarmService.js';
import { bustBoardListCache } from '$lib/server/boardListLoad.js';
import { sanitizeArticleContent } from '$lib/server/sanitizeArticleContent.js';
import { validateArticleContent } from '$lib/util/articleContentValidation.js';
import logger from '$lib/util/logger.js';

/**
 * 봇 계정용 MCP 서버 (Streamable HTTP, stateless, JSON 응답만).
 * 토큰 → 봇 닉네임 매핑은 BOT_MCP_TOKENS 환경변수({"<sha256 hex>": "닉네임"})에 둔다.
 * grade가 'bot'인 계정만 쓸 수 있다.
 */

export const SITE_URL = 'https://www.dgst.me';
export const BOARDS = ['free'];
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const COMMENTABLE_MS = 3 * 24 * 60 * 60 * 1000; // 사이트 댓글 규칙과 동일
const DAY_MS = 24 * 60 * 60 * 1000;

export const LIMITS = {
  articlesPerDay: 10,
  commentsPerDay: 60,
  titleMax: 100,
  articleMax: 20000,
  commentMax: 2000
};

/** @param {string} token */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * @param {string | null | undefined} authorization
 * @param {string | undefined} tokensJson
 * @returns {string | null} 봇 닉네임
 */
export function resolveBotNickname(authorization, tokensJson) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(authorization ?? '').trim());
  if (!match || !tokensJson) return null;

  /** @type {Record<string, string>} */
  let map;
  try {
    map = JSON.parse(tokensJson);
  } catch {
    return null;
  }
  if (!map || typeof map !== 'object') return null;

  const given = Buffer.from(hashToken(match[1]), 'hex');
  for (const [hash, nickname] of Object.entries(map)) {
    const expected = Buffer.from(hash, 'hex');
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) {
      return typeof nickname === 'string' ? nickname : null;
    }
  }
  return null;
}

/** @param {string} nickname */
export async function findBotUser(nickname) {
  const user = await getPrisma().user.findFirst({
    where: { nickname, grade: 'bot', state: 'registered' },
    select: { email: true, nickname: true, photo: true }
  });
  return user?.email ? /** @type {Bot} */ (user) : null;
}

/** @typedef {{ email: string, nickname: string, photo: string | null }} Bot */

class ToolError extends Error {}

/** @param {string} html */
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<img\b[^>]*>/gi, ' [이미지] ')
    .replace(/<(video|iframe)\b[^>]*>/gi, ' [동영상] ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

/** @param {string} text */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 일반 텍스트 → 사이트 에디터와 같은 <p> 문단 HTML. 빈 줄은 문단 사이 공백.
 * @param {string} text
 */
export function textToHtml(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .map((para) => `<p>${para.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('<p><br></p>');
}

/** @param {string} boardId @param {string} articleId */
const articleUrl = (boardId, articleId) => `${SITE_URL}/board/${boardId}/1/${articleId}`;

/** @param {unknown} value @param {string} name @param {number} max */
function requireText(value, name, max) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new ToolError(`${name}을(를) 입력해 주세요.`);
  if (text.length > max) throw new ToolError(`${name}은(는) ${max}자 이하여야 합니다.`);
  return text;
}

/** @param {unknown} value */
function requireId(value, name = 'article_id') {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!/^[0-9a-f]{24}$/.test(id)) throw new ToolError(`${name} 형식이 올바르지 않습니다.`);
  return id;
}

/** @param {unknown} value */
function boardOf(value) {
  const board = value == null ? 'free' : String(value);
  if (!BOARDS.includes(board)) throw new ToolError(`board는 ${BOARDS.join(', ')} 중 하나입니다.`);
  return board;
}

/** @param {Bot} bot */
async function usage(bot) {
  const since = new Date(Date.now() - DAY_MS);
  const prisma = getPrisma();
  const [articles, comments] = await Promise.all([
    prisma.article.count({ where: { email: bot.email, createdAt: { gte: since } } }),
    prisma.comment.count({ where: { email: bot.email, createdAt: { gte: since } } })
  ]);
  return { articles, comments };
}

/** @param {string} articleId */
async function findLiveArticle(articleId) {
  return getPrisma().article.findFirst({
    where: { id: articleId, state: 'write' },
    select: {
      id: true,
      boardId: true,
      email: true,
      nickname: true,
      title: true,
      content: true,
      createdAt: true
    }
  });
}

/** @type {Record<string, { description: string, inputSchema: object, annotations?: object, run: (bot: Bot, args: any) => Promise<object> }>} */
const TOOLS = {
  whoami: {
    description: '내 봇 계정 정보와 오늘(최근 24시간) 남은 글/댓글 한도를 알려준다.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run(bot) {
      const used = await usage(bot);
      return {
        nickname: bot.nickname,
        site: '실버타운 (노인정) ' + SITE_URL,
        boards: BOARDS,
        remaining_today: {
          articles: Math.max(0, LIMITS.articlesPerDay - used.articles),
          comments: Math.max(0, LIMITS.commentsPerDay - used.comments)
        }
      };
    }
  },

  list_articles: {
    description:
      '게시판 최신 글 목록. 각 글의 id, 제목, 작성자, 작성시각, 댓글 수, 링크를 준다. 댓글은 작성 3일 이내 글에만 달 수 있다(commentable).',
    inputSchema: {
      type: 'object',
      properties: {
        board: { type: 'string', enum: BOARDS, description: 'free(자유게시판)만 가능' },
        page: { type: 'integer', minimum: 1, maximum: 50, description: '기본 1' },
        limit: { type: 'integer', minimum: 1, maximum: 30, description: '기본 20' }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true },
    async run(_bot, args) {
      const board = boardOf(args.board);
      const limit = Math.min(30, Math.max(1, Number(args.limit) || 20));
      const page = Math.min(50, Math.max(1, Number(args.page) || 1));
      const rows = await getPrisma().article.findMany({
        where: { boardId: board, state: 'write' },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          nickname: true,
          createdAt: true,
          _count: { select: { comments: { where: { state: 'write' } } } }
        }
      });
      const now = Date.now();
      return {
        board,
        page,
        articles: rows.map((a) => ({
          id: a.id,
          title: a.title,
          author: a.nickname,
          created_at: a.createdAt.toISOString(),
          comments: a._count.comments,
          commentable: now - a.createdAt.getTime() < COMMENTABLE_MS,
          url: articleUrl(board, a.id)
        }))
      };
    }
  },

  read_article: {
    description:
      '글 본문(텍스트)과 댓글 전체를 읽는다. 이미지는 [이미지]로 표시된다. 댓글의 id는 답글(parent_comment_id)에 쓴다.',
    inputSchema: {
      type: 'object',
      properties: { article_id: { type: 'string', description: '24자리 글 id' } },
      required: ['article_id'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true },
    async run(bot, args) {
      const id = requireId(args.article_id);
      const article = await findLiveArticle(id);
      if (!article || !BOARDS.includes(article.boardId))
        throw new ToolError('글을 찾을 수 없습니다.');
      const comments = await getPrisma().comment.findMany({
        where: { articleId: id, state: 'write' },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          nickname: true,
          email: true,
          content: true,
          image: true,
          depth: true,
          parentCommentId: true,
          parentCommentNickname: true,
          createdAt: true
        }
      });
      return {
        id: article.id,
        board: article.boardId,
        title: article.title,
        author: article.nickname,
        is_mine: article.email === bot.email,
        created_at: article.createdAt.toISOString(),
        commentable: Date.now() - article.createdAt.getTime() < COMMENTABLE_MS,
        url: articleUrl(article.boardId, article.id),
        content: htmlToText(article.content),
        comments: comments.map((c) => ({
          id: c.id,
          author: c.nickname,
          is_mine: c.email === bot.email,
          content: (c.content ?? '') + (c.image ? ' [이미지]' : ''),
          depth: c.depth,
          reply_to: c.parentCommentId
            ? { comment_id: c.parentCommentId, author: c.parentCommentNickname }
            : null,
          created_at: c.createdAt.toISOString()
        }))
      };
    }
  },

  write_article: {
    description: `글을 쓴다. content는 일반 텍스트(HTML 아님)이고 빈 줄로 문단을 나눈다. 하루 ${LIMITS.articlesPerDay}개까지.`,
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: LIMITS.titleMax },
        content: { type: 'string', maxLength: LIMITS.articleMax, description: '일반 텍스트' },
        board: { type: 'string', enum: BOARDS, description: 'free(자유게시판)만 가능' }
      },
      required: ['title', 'content'],
      additionalProperties: false
    },
    async run(bot, args) {
      const board = boardOf(args.board);
      const title = requireText(args.title, '제목', LIMITS.titleMax);
      const text = requireText(args.content, '본문', LIMITS.articleMax);
      const used = await usage(bot);
      if (used.articles >= LIMITS.articlesPerDay)
        throw new ToolError(`최근 24시간 글 한도(${LIMITS.articlesPerDay}개)를 다 썼습니다.`);

      const content = sanitizeArticleContent(textToHtml(text));
      const check = validateArticleContent(content);
      if (!check.ok) throw new ToolError(check.message);

      const article = await createArticle({
        email: bot.email,
        nickname: bot.nickname,
        boardId: board,
        title,
        content
      });
      await bustBoardListCache(board);
      logger.info({ message: '[mcp] article created', bot: bot.nickname, articleId: article.id });
      return { id: article.id, url: articleUrl(board, article.id) };
    }
  },

  write_comment: {
    description: `댓글을 단다. parent_comment_id를 주면 그 댓글에 답글. 작성 3일 이내 글만 가능. 일반 텍스트. 하루 ${LIMITS.commentsPerDay}개까지.`,
    inputSchema: {
      type: 'object',
      properties: {
        article_id: { type: 'string' },
        content: { type: 'string', maxLength: LIMITS.commentMax },
        parent_comment_id: { type: 'string', description: '답글을 달 댓글 id (선택)' }
      },
      required: ['article_id', 'content'],
      additionalProperties: false
    },
    async run(bot, args) {
      const articleId = requireId(args.article_id);
      const content = requireText(args.content, '댓글', LIMITS.commentMax);
      const article = await findLiveArticle(articleId);
      if (!article || !BOARDS.includes(article.boardId))
        throw new ToolError('글을 찾을 수 없습니다.');
      if (Date.now() - article.createdAt.getTime() >= COMMENTABLE_MS)
        throw new ToolError('작성 3일이 지난 글에는 댓글을 달 수 없습니다.');

      let parent = null;
      if (args.parent_comment_id != null && args.parent_comment_id !== '') {
        parent = await findCommentById(requireId(args.parent_comment_id, 'parent_comment_id'));
        if (!parent || parent.articleId !== articleId || parent.state !== 'write')
          throw new ToolError('답글을 달 댓글을 찾을 수 없습니다.');
      }

      const used = await usage(bot);
      if (used.comments >= LIMITS.commentsPerDay)
        throw new ToolError(`최근 24시간 댓글 한도(${LIMITS.commentsPerDay}개)를 다 썼습니다.`);

      const boardId = article.boardId;
      const comment = await createComment({
        email: bot.email,
        nickname: bot.nickname,
        photo: bot.photo ?? undefined,
        boardId,
        articleId,
        content,
        parentCommentId: parent?.id,
        depth: parent ? parent.depth + 1 : 1,
        parentCommentNickname: parent?.nickname
      });

      // 알림 규칙은 사이트 댓글 POST와 동일
      if (article.email !== bot.email && (!parent || parent.email !== article.email)) {
        await upsertAlarm({
          email: article.email,
          articleId,
          title: article.title,
          boardId,
          newCommentId: comment.id
        });
      }
      if (parent && parent.email !== bot.email) {
        await upsertAlarm({
          email: parent.email,
          articleId,
          title: article.title,
          boardId,
          parentCommentId: parent.id,
          parentCommentContent: parent.content ?? '',
          newCommentId: comment.id
        });
      }
      await bustBoardListCache(boardId);
      logger.info({ message: '[mcp] comment created', bot: bot.nickname, commentId: comment.id });
      return { id: comment.id, url: articleUrl(boardId, articleId) };
    }
  },

  list_replies_to_me: {
    description:
      '최근 사람들이 내 글에 단 댓글과 내 댓글에 단 답글을 보여준다(내가 아직 답하지 않은 것 표시). 답할 때는 write_comment에 article_id와 parent_comment_id(=comment_id)를 준다.',
    inputSchema: {
      type: 'object',
      properties: { hours: { type: 'integer', minimum: 1, maximum: 72, description: '기본 24' } },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true },
    async run(bot, args) {
      const hours = Math.min(72, Math.max(1, Number(args.hours) || 24));
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const prisma = getPrisma();
      const myCommentIds = (
        await prisma.comment.findMany({
          where: {
            email: bot.email,
            state: 'write',
            createdAt: { gte: new Date(Date.now() - COMMENTABLE_MS) }
          },
          select: { id: true }
        })
      ).map((c) => c.id);

      const rows = await prisma.comment.findMany({
        where: {
          state: 'write',
          email: { not: bot.email },
          createdAt: { gte: since },
          OR: [
            { article: { email: bot.email }, parentCommentId: null },
            { parentCommentId: { in: myCommentIds } }
          ]
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          articleId: true,
          boardId: true,
          nickname: true,
          content: true,
          image: true,
          parentCommentId: true,
          createdAt: true,
          article: { select: { title: true } }
        }
      });

      const answered = new Set(
        rows.length
          ? (
              await prisma.comment.findMany({
                where: { email: bot.email, parentCommentId: { in: rows.map((r) => r.id) } },
                select: { parentCommentId: true }
              })
            ).map((r) => r.parentCommentId)
          : []
      );

      return {
        replies: rows.map((r) => ({
          comment_id: r.id,
          article_id: r.articleId,
          article_title: r.article.title,
          author: r.nickname,
          content: (r.content ?? '') + (r.image ? ' [이미지]' : ''),
          kind: r.parentCommentId ? 'reply_to_my_comment' : 'comment_on_my_article',
          answered: answered.has(r.id),
          created_at: r.createdAt.toISOString(),
          url: articleUrl(r.boardId, r.articleId)
        }))
      };
    }
  },

  delete_my_article: {
    description: '내가 쓴 글을 삭제한다.',
    inputSchema: {
      type: 'object',
      properties: { article_id: { type: 'string' } },
      required: ['article_id'],
      additionalProperties: false
    },
    annotations: { destructiveHint: true },
    async run(bot, args) {
      const id = requireId(args.article_id);
      const article = await findLiveArticle(id);
      if (!article || article.email !== bot.email)
        throw new ToolError('내 글이 아니거나 이미 삭제되었습니다.');
      const result = await softDeleteArticleByOwner(id, bot.email, article.boardId);
      if (!result || result.count === 0) throw new ToolError('삭제되지 않았습니다.');
      await deleteAlarmsByArticle(id);
      await bustBoardListCache(article.boardId);
      return { deleted: id };
    }
  },

  delete_my_comment: {
    description: '내가 단 댓글을 삭제한다.',
    inputSchema: {
      type: 'object',
      properties: { comment_id: { type: 'string' } },
      required: ['comment_id'],
      additionalProperties: false
    },
    annotations: { destructiveHint: true },
    async run(bot, args) {
      const id = requireId(args.comment_id, 'comment_id');
      const found = await findCommentById(id);
      if (!found || found.email !== bot.email || found.state !== 'write')
        throw new ToolError('내 댓글이 아니거나 이미 삭제되었습니다.');
      const owned = await findOwnedActiveComment({
        id,
        email: bot.email,
        boardId: found.boardId,
        articleId: found.articleId,
        select: { id: true }
      });
      if (!owned) throw new ToolError('내 댓글이 아니거나 이미 삭제되었습니다.');
      const updated = await softDeleteComment(id, bot.email);
      await removeCommentFromAlarm({
        articleId: found.articleId,
        parentCommentId: updated.parentCommentId,
        commentId: id
      });
      await bustBoardListCache(found.boardId);
      return { deleted: id };
    }
  }
};

export const TOOL_NAMES = Object.keys(TOOLS);

/**
 * @param {unknown} id
 * @param {number} code
 * @param {string} message
 */
const rpcError = (id, code, message) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message }
});

/**
 * JSON-RPC 메시지 하나 처리. 알림(id 없음)이면 null.
 * @param {any} msg
 * @param {Bot} bot
 */
export async function handleRpc(msg, bot) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(msg?.id, -32600, 'Invalid Request');
  }
  const isNotification = !('id' in msg);
  const { id, method, params = {} } = msg;

  if (isNotification) return null;

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
            ? requested
            : SUPPORTED_PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'silvertown-bot', version: '1.0.0' },
          instructions: `실버타운(노인정, ${SITE_URL}) 게시판 봇 계정 "${bot.nickname}" 전용 도구. 글/댓글은 일반 텍스트로 쓴다. 다른 회원을 괴롭히거나 도배하지 않는다.`
        }
      };
    }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: Object.entries(TOOLS).map(([name, t]) => ({
            name,
            description: t.description,
            inputSchema: t.inputSchema,
            ...(t.annotations && { annotations: t.annotations })
          }))
        }
      };
    case 'tools/call': {
      const tool = TOOLS[params?.name];
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${params?.name}`);
      const args =
        params?.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      try {
        const data = await tool.run(bot, args);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(data) }],
            structuredContent: data
          }
        };
      } catch (err) {
        if (!(err instanceof ToolError)) {
          logger.error({
            message: '[mcp] tool failed',
            tool: params?.name,
            bot: bot.nickname,
            errorMessage: err instanceof Error ? err.message : String(err)
          });
        }
        const text = err instanceof ToolError ? err.message : '처리 중 오류가 발생했습니다.';
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } };
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}
