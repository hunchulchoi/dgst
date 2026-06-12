/**
 * Backfill/update `slot_user_balance` from PostgreSQL `game_scores`.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/backfill-slot-user-balance.js
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL })
});

async function main() {
  console.log('Connected. Aggregating game_scores...');

  /** @type {Array<{ email: string; nickname: string; balance: bigint | number; totalSpin: number }>} */
  const rows = await prisma.$queryRaw`
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

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await prisma.$transaction(
      batch.map((row) =>
        prisma.slotUserBalance.upsert({
          where: { email: row.email },
          update: {
            nickname: row.nickname,
            balance: Number(row.balance),
            totalSpin: Number(row.totalSpin)
          },
          create: {
            email: row.email,
            nickname: row.nickname,
            balance: Number(row.balance),
            totalSpin: Number(row.totalSpin)
          }
        })
      )
    );
    count += batch.length;
    console.log('Upserted', count, 'users');
  }

  console.log('Done. Total slot_user_balance rows upserted:', count);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
    if (process.exitCode === 1) process.exit(1);
  });
