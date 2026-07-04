-- CreateTable
CREATE TABLE "game_score_billiards" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_score_billiards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_score_billiards_created_at_idx" ON "game_score_billiards"("created_at" DESC);

-- CreateIndex
CREATE INDEX "game_score_billiards_mode_score_created_at_idx" ON "game_score_billiards"("mode", "score" DESC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "game_score_billiards_email_mode_score_idx" ON "game_score_billiards"("email", "mode", "score" DESC);
