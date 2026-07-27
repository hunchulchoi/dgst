CREATE INDEX "arcade_ledger_kind_created_at_idx"
ON "arcade_ledger"("kind", "created_at" DESC);

-- 현재 선두는 기준점으로만 저장한다. 이후 실제 선두 교체만 leader-change가 된다.
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
	"meta",
	"created_at"
)
SELECT
	'leader-baseline-' || "id",
	"id",
	"email",
	"nickname",
	'arcade',
	'leader-baseline',
	0,
	0,
	0,
	"balance",
	jsonb_build_object('previousLeaderEmail', NULL),
	NOW()
FROM "arcade_wallets"
WHERE "balance" > 0
ORDER BY "balance" DESC, "created_at" ASC
LIMIT 1;
