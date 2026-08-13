import { json } from '@sveltejs/kit';
import { getBoardCelebrations } from '$lib/server/boardCelebrations.js';

/** 자유게시판 폭죽용 — 로그인 불필요 */
export async function GET() {
  try {
    const celebrations = await getBoardCelebrations();
    return json({ celebrations }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (err) {
    console.error('[celebrations GET]', err);
    return json({ celebrations: [] }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
