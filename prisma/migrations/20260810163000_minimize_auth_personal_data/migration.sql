-- Consolidate the legacy account image before removing duplicate profile fields.
UPDATE "users"
SET "photo" = "image"
WHERE "photo" IS NULL
  AND "image" IS NOT NULL
  AND BTRIM("image") <> '';

-- Auth.js requires the nullable column, but this service does not use the value.
UPDATE "users"
SET "email_verified" = NULL
WHERE "email_verified" IS NOT NULL;

-- Keep provider account IDs only in accounts and replace duplicated users.id values
-- with opaque internal identifiers. Existing account/session foreign keys cascade.
CREATE TEMPORARY TABLE "auth_user_id_map" AS
SELECT "id" AS "old_id", GEN_RANDOM_UUID()::TEXT AS "new_id"
FROM "users";

UPDATE "login_logs" AS "log"
SET "user_id" = "map"."new_id"
FROM "auth_user_id_map" AS "map"
WHERE "log"."user_id" = "map"."old_id";

UPDATE "users" AS "user"
SET "id" = "map"."new_id"
FROM "auth_user_id_map" AS "map"
WHERE "user"."id" = "map"."old_id";

DROP TABLE "auth_user_id_map";

-- Login records without a valid member cannot support an account security audit.
DELETE FROM "login_logs" AS "log"
WHERE "log"."user_id" IS NULL
   OR NOT EXISTS (
     SELECT 1
     FROM "users" AS "user"
     WHERE "user"."id" = "log"."user_id"
   );

ALTER TABLE "users"
  DROP COLUMN "name",
  DROP COLUMN "image",
  DROP COLUMN "created_at",
  DROP COLUMN "latest_login_at",
  DROP COLUMN "last_modified";

ALTER TABLE "login_logs"
  DROP COLUMN "ip",
  DROP COLUMN "device_id",
  DROP COLUMN "user_agent",
  DROP COLUMN "provider",
  DROP COLUMN "path",
  ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "login_logs"
  ADD CONSTRAINT "login_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Remove cached copies of old member IDs, full user agents, and retired DAU keys.
DELETE FROM "cache_kv"
WHERE "namespace" IN ('user', 'session', 'device');

DELETE FROM "dedup_lock"
WHERE "key" LIKE 'dau:%';
