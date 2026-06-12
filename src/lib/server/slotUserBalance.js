import { getPrisma } from '$lib/database/prisma.js';

let backfillPromise = null;

/**
 * slot_user_balance 컬렉션 전체 삭제. 다음 랭킹 조회 시 game_scores 기준으로 자동 백필됨.
 * Top10 점수가 어긋났을 때 재집계하려면 이 함수 호출 후 랭킹 페이지를 새로고침하면 됨.
 * @returns {Promise<number>} 삭제된 문서 수
 */
export async function resetSlotUserBalance() {
  backfillPromise = null;
  const r = await getPrisma().slotUserBalance.deleteMany({});
  return r.count ?? 0;
}

/**
 * game_scores 집계 결과로 slot_user_balance를 채움. 컬렉션이 비었을 때 1회만 자동 호출됨.
 * @returns {Promise<number>} upsert된 행 수
 */
export async function backfillSlotUserBalance() {
  if (backfillPromise) return backfillPromise;
  backfillPromise = (async () => {
    try {
      /** @type {Array<{ email: string; nickname: string; balance: number; totalSpin: number }>} */
      const rows = await getPrisma().$queryRaw`
        SELECT
          email,
          (ARRAY_AGG(nickname ORDER BY created_at DESC))[1] AS nickname,
          (ARRAY_AGG(balance ORDER BY created_at DESC))[1] AS balance,
          COUNT(*) FILTER (WHERE bet > 0)::int AS "totalSpin"
        FROM game_scores
        WHERE game = 'slot'
        GROUP BY email
        HAVING COUNT(*) FILTER (WHERE bet > 0) > 0
      `;

      const BATCH = 50;
      let count = 0;
      const prisma = getPrisma();

      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        await prisma.$transaction(
          batch.map((doc) =>
            prisma.slotUserBalance.upsert({
              where: { email: doc.email },
              update: {
                nickname: doc.nickname,
                balance: Number(doc.balance),
                totalSpin: Number(doc.totalSpin)
              },
              create: {
                email: doc.email,
                nickname: doc.nickname,
                balance: Number(doc.balance),
                totalSpin: Number(doc.totalSpin)
              }
            })
          )
        );
        count += batch.length;
      }
      return count;
    } finally {
      backfillPromise = null;
    }
  })();
  return backfillPromise;
}

/**
 * 랭킹 조회 전에 slot_user_balance가 비어 있으면 1회만 백필 후 진행.
 */
export async function ensureSlotUserBalanceFilled() {
  const n = await getPrisma().slotUserBalance.count();
  if (n === 0) {
    const count = await backfillSlotUserBalance();
    if (count > 0) console.log('[slot_user_balance] 자동 백필 완료:', count, '명');
  }
}

/**
 * GameScore 생성 시 호출: slot_user_balance에 해당 유저의 최신 balance/totalSpin 반영.
 * 랭킹/잔액 조회는 이 컬렉션만 사용해 30만 건 집계를 피함.
 *
 * @param {string} email
 * @param {string} nickname
 * @param {number} balance - 반영할 최신 잔액
 * @param {{ incSpin?: boolean }} [opts] - incSpin: true면 totalSpin +1 (실제 스핀일 때만)
 */
export async function updateSlotUserBalance(email, nickname, balance, opts = {}) {
  try {
    const prisma = getPrisma();
    if (opts.incSpin === true) {
      await prisma.slotUserBalance.upsert({
        where: { email },
        update: { nickname, balance, totalSpin: { increment: 1 } },
        create: { email, nickname, balance, totalSpin: 1 }
      });
    } else {
      await prisma.slotUserBalance.upsert({
        where: { email },
        update: { nickname, balance },
        create: { email, nickname, balance, totalSpin: 0 }
      });
    }
  } catch (e) {
    console.error('updateSlotUserBalance failed', email, e?.message);
  }
}

/**
 * 유저의 현재 잔액 조회. slot_user_balance 우선, 없으면 game_scores 마지막 행으로 백필.
 *
 * @param {string} email
 * @returns {Promise<number>}
 */
export async function getSlotBalance(email) {
  const row = await getPrisma().slotUserBalance.findUnique({
    where: { email },
    select: { balance: true }
  });
  if (row != null) return row.balance;
  const last = await getPrisma().gameScore.findFirst({
    where: { email, game: 'slot' },
    orderBy: { createdAt: 'desc' },
    select: { balance: true, nickname: true }
  });
  const balance = last?.balance ?? 0;
  const nickname = last?.nickname ? last.nickname : 'anonymous';
  await updateSlotUserBalance(email, nickname, balance, {});
  return balance;
}
