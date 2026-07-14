-- The preceding timestamptz migration interpreted legacy board wall-clock values as UTC.
-- Those values were actually Asia/Seoul time, so recent rows moved nine hours into the future.
-- Repair only impossible future audit timestamps. This keeps timestamps written correctly after
-- the type migration unchanged and avoids touching fields, such as session expiry, that may
-- legitimately be in the future.

UPDATE "articles"
SET "created_at" = "created_at" - INTERVAL '9 hours'
WHERE "created_at" > CURRENT_TIMESTAMP + INTERVAL '5 minutes';

UPDATE "articles"
SET "updated_at" = "updated_at" - INTERVAL '9 hours'
WHERE "updated_at" > CURRENT_TIMESTAMP + INTERVAL '5 minutes';

UPDATE "article_reads"
SET "read_at" = "read_at" - INTERVAL '9 hours'
WHERE "read_at" > CURRENT_TIMESTAMP + INTERVAL '5 minutes';

UPDATE "comments"
SET "created_at" = "created_at" - INTERVAL '9 hours'
WHERE "created_at" > CURRENT_TIMESTAMP + INTERVAL '5 minutes';

UPDATE "comments"
SET "updated_at" = "updated_at" - INTERVAL '9 hours'
WHERE "updated_at" > CURRENT_TIMESTAMP + INTERVAL '5 minutes';
