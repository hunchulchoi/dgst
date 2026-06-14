-- Improve board/article ownership lookups and recent unread alarm scans.
CREATE INDEX "articles_email_board_id_state_created_at_idx"
ON "articles"("email", "board_id", "state", "created_at" DESC);

CREATE INDEX "comments_email_board_id_article_id_parent_comment_id_state_created_at_idx"
ON "comments"("email", "board_id", "article_id", "parent_comment_id", "state", "created_at" DESC);

DROP INDEX IF EXISTS "alarms_email_read_at_created_at_idx";

CREATE INDEX "alarms_email_read_at_updated_at_idx"
ON "alarms"("email", "read_at", "updated_at" DESC);
