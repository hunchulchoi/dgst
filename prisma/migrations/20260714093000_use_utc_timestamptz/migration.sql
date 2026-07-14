-- Existing TIMESTAMP values were written/read by the application as UTC wall-clock values.
-- Interpret them explicitly as UTC so changing the column type preserves each instant,
-- independent of the PostgreSQL session timezone used while this migration runs.

ALTER TABLE "users"
  ALTER COLUMN "email_verified" TYPE TIMESTAMPTZ(3) USING "email_verified" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "latest_login_at" TYPE TIMESTAMPTZ(3) USING "latest_login_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "last_modified" TYPE TIMESTAMPTZ(3) USING "last_modified" AT TIME ZONE 'UTC';

ALTER TABLE "sessions"
  ALTER COLUMN "expires" TYPE TIMESTAMPTZ(3) USING "expires" AT TIME ZONE 'UTC';

ALTER TABLE "verification_tokens"
  ALTER COLUMN "expires" TYPE TIMESTAMPTZ(3) USING "expires" AT TIME ZONE 'UTC';

ALTER TABLE "articles"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "billiards_replays"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';

ALTER TABLE "article_reads"
  ALTER COLUMN "read_at" TYPE TIMESTAMPTZ(3) USING "read_at" AT TIME ZONE 'UTC';

ALTER TABLE "comments"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "alarms"
  ALTER COLUMN "read_at" TYPE TIMESTAMPTZ(3) USING "read_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "game_scores"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "game_score_2048"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "game_score_minesweeper"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "game_score_watermelon"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "game_score_billiards"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "game_score_sudoku"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "slot_user_balance"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "game_logs"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "memos"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "last_modified" TYPE TIMESTAMPTZ(3) USING "last_modified" AT TIME ZONE 'UTC';

ALTER TABLE "login_logs"
  ALTER COLUMN "at" TYPE TIMESTAMPTZ(3) USING "at" AT TIME ZONE 'UTC';
