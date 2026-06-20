CREATE TABLE "article_reads" (
    "article_id" TEXT NOT NULL,
    "viewer_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_reads_pkey" PRIMARY KEY ("article_id","viewer_id")
);

CREATE INDEX "article_reads_viewer_id_read_at_idx"
ON "article_reads"("viewer_id", "read_at" DESC);

ALTER TABLE "article_reads"
ADD CONSTRAINT "article_reads_article_id_fkey"
FOREIGN KEY ("article_id") REFERENCES "articles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
