-- Existing Auth.js sessions only expose their rolling expiry. Backfill the best
-- conservative issuance estimate: the last 30-day renewal point.
ALTER TABLE "sessions" ADD COLUMN "created_at" TIMESTAMPTZ(3);

UPDATE "sessions"
SET "created_at" = LEAST(CURRENT_TIMESTAMP, "expires" - INTERVAL '30 days');

ALTER TABLE "sessions"
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_at" SET NOT NULL;
