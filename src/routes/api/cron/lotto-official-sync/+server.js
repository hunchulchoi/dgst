import { json } from '@sveltejs/kit';
import { env as dynamicEnv } from '$env/dynamic/private';
import connectDB from '$lib/database/mongoosePriomise.js';
import {
  fetchOfficialDrawJson,
  storeOfficialDraw,
  syncOfficialDrawFromDhlottery
} from '$lib/server/lottoOfficial.js';

connectDB();

/**
 * 동행복권 최신(또는 갱신 필요) 회차 당첨번호를 받아 GameLog에 저장합니다.
 * 매주 월요일 아침 크론에서 호출하세요 (예: `x-cron-secret` 헤더).
 *
 * - 자동: `GET /api/cron/lotto-official-sync`
 * - 특정 회차만(원본 API가 서버 IP에서 막힐 때 로컬에서 확인한 회차 등):
 *   `GET /api/cron/lotto-official-sync?drwNo=1180`
 *
 * curl -s -H "x-cron-secret: $CRON_SECRET" "https://호스트/api/cron/lotto-official-sync"
 */
export async function GET({ request, url }) {
  const secret = dynamicEnv.CRON_SECRET;
  const given = request.headers.get('x-cron-secret');

  if (!secret || given !== secret) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const drwQs = url.searchParams.get('drwNo');

  try {
    if (drwQs != null && drwQs !== '') {
      const drwNo = Number.parseInt(drwQs, 10);
      if (!Number.isInteger(drwNo) || drwNo < 1) {
        return json({ ok: false, error: 'Invalid drwNo' }, { status: 400 });
      }
      const draw = await fetchOfficialDrawJson(drwNo);
      if (!draw) {
        return json(
          {
            ok: false,
            error:
              '동행복권에서 해당 회차를 가져오지 못했습니다. 서버 IP 차단 또는 아직 미공개일 수 있습니다.',
            drwNo,
            at: new Date().toISOString()
          },
          { status: 502 }
        );
      }
      const storedFresh = await storeOfficialDraw(draw);
      return json({
        ok: true,
        forced: true,
        drwNo: draw.drwNo,
        stored: storedFresh,
        at: new Date().toISOString()
      });
    }

    const result = await syncOfficialDrawFromDhlottery();
    return json({
      ok: true,
      addedRound: result.added?.drwNo ?? null,
      addedDate: result.added?.drwNoDate ?? null,
      notes: result.notes,
      at: new Date().toISOString()
    });
  } catch (err) {
    return json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
