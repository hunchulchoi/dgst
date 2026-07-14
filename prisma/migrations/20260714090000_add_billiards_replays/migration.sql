-- CreateTable
CREATE TABLE "billiards_replays" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billiards_replays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billiards_replays_article_id_key" ON "billiards_replays"("article_id");

-- CreateIndex
CREATE INDEX "billiards_replays_email_created_at_idx" ON "billiards_replays"("email", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "billiards_replays" ADD CONSTRAINT "billiards_replays_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
