import { json } from '@sveltejs/kit';
import { env as dynamicEnv } from '$env/dynamic/private';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import { findBotUser, handleRpc, resolveBotNickname } from '$lib/server/mcp/botMcp.js';

/**
 * 봇 계정용 MCP 엔드포인트 (Streamable HTTP, stateless).
 *   Authorization: Bearer <봇 토큰>
 */

const unauthorized = () =>
  json(
    { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized' } },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
  );

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function POST(event) {
  const limited = await checkRateLimit(event, { limit: 120, windowSeconds: 60, bucket: 'mcp' });
  if (!limited.allowed) {
    return json(
      { jsonrpc: '2.0', id: null, error: { code: -32029, message: 'Too Many Requests' } },
      { status: 429 }
    );
  }

  const nickname = resolveBotNickname(
    event.request.headers.get('authorization'),
    dynamicEnv.BOT_MCP_TOKENS
  );
  if (!nickname) return unauthorized();

  const bot = await findBotUser(nickname);
  if (!bot) return unauthorized();

  let body;
  try {
    body = await event.request.json();
  } catch {
    return json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { status: 400 }
    );
  }

  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > 20) {
      return json(
        { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } },
        { status: 400 }
      );
    }
    const out = [];
    for (const msg of body) {
      const res = await handleRpc(msg, bot);
      if (res) out.push(res);
    }
    return out.length ? json(out) : new Response(null, { status: 202 });
  }

  const res = await handleRpc(body, bot);
  return res ? json(res) : new Response(null, { status: 202 });
}

// stateless 서버: SSE 스트림·세션 종료 미지원
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
