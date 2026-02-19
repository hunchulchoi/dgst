import { json } from '@sveltejs/kit';
import { env as dynamicEnv } from '$env/dynamic/private';
import { resetSlotUserBalance } from '$lib/server/slotUserBalance.js';

/**
 * slot_user_balance 컬렉션 전체 삭제. 다음 랭킹 조회 시 game_scores 기준으로 자동 백필됨.
 * Top10 점수가 어긋났을 때 재집계용.
 *
 * 예: curl -H "x-cron-secret: YOUR_CRON_SECRET" "https://your-domain/api/cron/slot-rank-reset"
 */
export async function GET({ request }) {
  const secret = dynamicEnv.CRON_SECRET;
  const given = request.headers.get('x-cron-secret');

  if (!secret || given !== secret) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const deletedCount = await resetSlotUserBalance();
    return json({
      ok: true,
      deletedCount,
      message: 'slot_user_balance 초기화됨. 다음 랭킹 조회 시 자동 백필됩니다.',
      at: new Date().toISOString()
    });
  } catch (err) {
    return json(
      { ok: false, error: err?.message ?? 'Reset failed', at: new Date().toISOString() },
      { status: 500 }
    );
  }
}
