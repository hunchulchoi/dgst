import { json } from '@sveltejs/kit';
import connectDB from '$lib/database/mongoosePriomise.js';
import { fetchLottoHistory, countAllLottoPicks24h } from '$lib/server/lotto.js';
import { computeLottoWeekMatchSummary } from '$lib/server/lottoOfficial.js';

connectDB();

/** 자유게시판 로또 배너 데이터 (목록 load와 분리) */
export async function GET({ locals }) {
  try {
    const session = await locals.auth();
    const viewerEmail = session?.user?.email ?? null;

    const [lottoHistory, lottoWeekMatch, lottoTotalPicks24h] = await Promise.all([
      fetchLottoHistory(viewerEmail),
      computeLottoWeekMatchSummary(),
      countAllLottoPicks24h()
    ]);

    return json(
      { lottoHistory, lottoWeekMatch, lottoTotalPicks24h },
      { headers: { 'Cache-Control': 'private, no-cache' } }
    );
  } catch (err) {
    console.error('lotto-summary failed', err);
    return json(
      { lottoHistory: [], lottoWeekMatch: null, lottoTotalPicks24h: 0 },
      { status: 500 }
    );
  }
}
