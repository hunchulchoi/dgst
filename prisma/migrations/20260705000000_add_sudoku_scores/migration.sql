CREATE TABLE "game_score_sudoku" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "mistakes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_score_sudoku_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "game_score_sudoku_created_at_idx" ON "game_score_sudoku"("created_at" DESC);

CREATE INDEX "game_score_sudoku_difficulty_seconds_mistakes_created_at_idx" ON "game_score_sudoku"("difficulty", "seconds", "mistakes", "created_at" DESC);

CREATE INDEX "game_score_sudoku_email_difficulty_seconds_mistakes_idx" ON "game_score_sudoku"("email", "difficulty", "seconds", "mistakes");
