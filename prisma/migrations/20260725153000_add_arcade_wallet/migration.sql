CREATE TABLE "arcade_wallets" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
	"balance" BIGINT NOT NULL DEFAULT 1000,
	"oops_at" TIMESTAMPTZ(3),
	"active_game" TEXT,
	"active_play_id" TEXT,
	"active_until" TIMESTAMPTZ(3),
	"active_payload" JSONB,
	"created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "arcade_wallets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "arcade_ledger" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "bet" BIGINT NOT NULL DEFAULT 0,
    "payout" BIGINT NOT NULL DEFAULT 0,
    "delta" BIGINT NOT NULL,
    "balance" BIGINT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "arcade_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "arcade_wallets_email_key" ON "arcade_wallets"("email");
CREATE INDEX "arcade_wallets_balance_idx" ON "arcade_wallets"("balance" DESC);
CREATE INDEX "arcade_ledger_email_created_at_idx" ON "arcade_ledger"("email", "created_at" DESC);
CREATE INDEX "arcade_ledger_game_created_at_idx" ON "arcade_ledger"("game", "created_at" DESC);
CREATE INDEX "arcade_ledger_wallet_id_created_at_idx" ON "arcade_ledger"("wallet_id", "created_at" DESC);

ALTER TABLE "arcade_ledger"
ADD CONSTRAINT "arcade_ledger_wallet_id_fkey"
FOREIGN KEY ("wallet_id") REFERENCES "arcade_wallets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- 게임별 최신 잔액 중 최댓값을 공용 메달로 이전한다. 기존 잔액은 합산하지 않는다.
WITH ranked AS (
    SELECT
        email,
        nickname,
        balance,
        created_at,
        ROW_NUMBER() OVER (
            PARTITION BY email, game
            ORDER BY created_at DESC
        ) AS game_rn
    FROM game_scores
    WHERE game IN ('slot', 'seotda', 'ssamchi', 'medal-janken')
),
latest AS (
    SELECT email, nickname, balance, created_at
    FROM ranked
    WHERE game_rn = 1
),
wallet_seed AS (
    SELECT
        email,
        (ARRAY_AGG(nickname ORDER BY created_at DESC))[1] AS nickname,
        GREATEST(MAX(balance), 0) AS balance
    FROM latest
    GROUP BY email
)
INSERT INTO "arcade_wallets" ("id", "email", "nickname", "balance", "created_at", "updated_at")
SELECT
    MD5(email || CLOCK_TIMESTAMP()::text || RANDOM()::text),
    email,
    nickname,
    balance,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM wallet_seed;

INSERT INTO "arcade_ledger" (
    "id",
    "wallet_id",
    "email",
    "nickname",
    "game",
    "kind",
    "bet",
    "payout",
    "delta",
    "balance",
    "meta"
)
SELECT
    MD5(wallet."email" || CLOCK_TIMESTAMP()::text || RANDOM()::text),
    wallet."id",
    wallet."email",
    wallet."nickname",
    'arcade',
    'migration',
    0,
    wallet."balance",
    wallet."balance",
    wallet."balance",
    '{"strategy":"max-latest-game-balance"}'::jsonb
FROM "arcade_wallets" AS wallet;
