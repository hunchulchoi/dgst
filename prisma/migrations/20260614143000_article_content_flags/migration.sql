ALTER TABLE "articles"
ADD COLUMN "has_image" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "has_video" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "has_youtube" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "has_instagram" BOOLEAN NOT NULL DEFAULT false;

UPDATE "articles"
SET
  "has_image" = POSITION('<img ' IN "content") > 0,
  "has_video" = POSITION('<video ' IN "content") > 0,
  "has_youtube" = (
    POSITION('youtube.com' IN "content") > 0 OR
    POSITION('youtu.be' IN "content") > 0 OR
    POSITION('youtube.com/embed' IN "content") > 0
  ),
  "has_instagram" = (
    POSITION('instagram.com' IN "content") > 0 OR
    POSITION('blockquote class="instagram-media"' IN "content") > 0
  );
