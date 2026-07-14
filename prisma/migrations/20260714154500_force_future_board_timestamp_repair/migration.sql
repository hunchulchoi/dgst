-- Re-run the board timestamp repair under a new migration id because the first repair was marked
-- applied without changing the production rows. Board audit timestamps cannot legitimately be
-- more than five minutes in the future.

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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "articles"
    WHERE "created_at" > CURRENT_TIMESTAMP + INTERVAL '5 minutes'
       OR "updated_at" > CURRENT_TIMESTAMP + INTERVAL '5 minutes'
  ) OR EXISTS (
    SELECT 1 FROM "article_reads"
    WHERE "read_at" > CURRENT_TIMESTAMP + INTERVAL '5 minutes'
  ) OR EXISTS (
    SELECT 1 FROM "comments"
    WHERE "created_at" > CURRENT_TIMESTAMP + INTERVAL '5 minutes'
       OR "updated_at" > CURRENT_TIMESTAMP + INTERVAL '5 minutes'
  ) THEN
    RAISE EXCEPTION 'future board timestamps remain after KST repair';
  END IF;
END $$;
