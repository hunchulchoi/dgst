ALTER TABLE "articles"
ADD COLUMN "has_audio" BOOLEAN NOT NULL DEFAULT false;

UPDATE "articles"
SET "has_audio" = POSITION('<audio ' IN "content") > 0;
