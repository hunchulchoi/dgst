import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({ getPrisma: vi.fn() }));
const articleRepo = vi.hoisted(() => ({
  createArticle: vi.fn(),
  softDeleteArticleByOwner: vi.fn()
}));
const commentRepo = vi.hoisted(() => ({
  createComment: vi.fn(),
  findCommentById: vi.fn(),
  findOwnedActiveComment: vi.fn(),
  softDeleteComment: vi.fn()
}));
const alarm = vi.hoisted(() => ({
  upsertAlarm: vi.fn(),
  deleteAlarmsByArticle: vi.fn(),
  removeCommentFromAlarm: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);
vi.mock('$lib/server/board/articleRepo.js', () => articleRepo);
vi.mock('$lib/server/board/commentRepo.js', () => commentRepo);
vi.mock('$lib/server/alarm/alarmService.js', () => alarm);
vi.mock('$lib/server/boardListLoad.js', () => ({ bustBoardListCache: vi.fn() }));
vi.mock('$lib/util/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}));

const mcp = await import('../src/lib/server/mcp/botMcp.js');
const bot = { email: 'bot-hash', nickname: '해노죵봇🤖', photo: null };
/** @type {(msg: object) => Promise<any>} */
const rpc = (msg) => mcp.handleRpc(/** @type {any} */ (msg), bot);
const ID = 'a'.repeat(24);

/** @param {string} name @param {object} args */
const call = (name, args) =>
  rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });

describe('bot MCP', () => {
  beforeEach(() => vi.resetAllMocks());

  it('resolves a bot from a bearer token hash', () => {
    const tokens = JSON.stringify({ [mcp.hashToken('secret-1')]: '해노죵봇🤖' });
    expect(mcp.resolveBotNickname('Bearer secret-1', tokens)).toBe('해노죵봇🤖');
    expect(mcp.resolveBotNickname('Bearer wrong', tokens)).toBeNull();
    expect(mcp.resolveBotNickname(null, tokens)).toBeNull();
    expect(mcp.resolveBotNickname('Bearer secret-1', 'not json')).toBeNull();
  });

  it('converts plain text to escaped paragraphs and back', () => {
    const html = mcp.textToHtml('안녕 <b>\n둘째줄\n\n새 문단');
    expect(html).toBe('<p>안녕 &lt;b&gt;<br>둘째줄</p><p><br></p><p>새 문단</p>');
    expect(mcp.htmlToText(html)).toBe('안녕 <b>\n둘째줄\n\n새 문단');
  });

  it('negotiates protocol and lists tools', async () => {
    const init = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' }
    });
    expect(init.result.protocolVersion).toBe('2025-06-18');
    const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(list.result.tools.map((/** @type {any} */ t) => t.name)).toEqual(mcp.TOOL_NAMES);
    expect(await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
  });

  it('rejects comments on articles older than 3 days', async () => {
    prismaModule.getPrisma.mockReturnValue({
      article: {
        findFirst: vi.fn().mockResolvedValue({
          id: ID,
          boardId: 'free',
          email: 'x',
          title: 't',
          createdAt: new Date(Date.now() - 4 * 86400000)
        })
      }
    });
    const res = await call('write_comment', { article_id: ID, content: '묘합니다.' });
    expect(res.result.isError).toBe(true);
    expect(commentRepo.createComment).not.toHaveBeenCalled();
  });

  it('writes a comment and alarms the article author', async () => {
    prismaModule.getPrisma.mockReturnValue({
      article: {
        findFirst: vi.fn().mockResolvedValue({
          id: ID,
          boardId: 'free',
          email: 'author',
          title: '제목',
          createdAt: new Date()
        }),
        count: vi.fn().mockResolvedValue(0)
      },
      comment: { count: vi.fn().mockResolvedValue(0) }
    });
    commentRepo.createComment.mockResolvedValue({ id: 'b'.repeat(24) });
    const res = await call('write_comment', { article_id: ID, content: '좋습니다.' });
    expect(res.result.isError).toBeUndefined();
    expect(commentRepo.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'bot-hash',
        nickname: '해노죵봇🤖',
        content: '좋습니다.',
        depth: 1
      })
    );
    expect(alarm.upsertAlarm).toHaveBeenCalledWith(expect.objectContaining({ email: 'author' }));
  });

  it('enforces the daily article limit', async () => {
    prismaModule.getPrisma.mockReturnValue({
      article: { count: vi.fn().mockResolvedValue(mcp.LIMITS.articlesPerDay) },
      comment: { count: vi.fn().mockResolvedValue(0) }
    });
    const res = await call('write_article', { title: 't', content: 'c' });
    expect(res.result.isError).toBe(true);
    expect(articleRepo.createArticle).not.toHaveBeenCalled();
  });
});
