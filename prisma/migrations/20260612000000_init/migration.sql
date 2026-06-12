-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "email_verified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "nickname" TEXT NOT NULL,
    "introduction" TEXT NOT NULL,
    "photo" TEXT,
    "state" TEXT NOT NULL,
    "grade" TEXT NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(3),
    "latest_login_at" TIMESTAMP(3),
    "last_modified" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'write',
    "reads" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "likes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unlikes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modified_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "photo" TEXT,
    "board_id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "parent_comment_id" TEXT,
    "parent_comment_nickname" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT,
    "image" TEXT,
    "state" TEXT NOT NULL DEFAULT 'write',
    "likes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unlikes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modified_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alarms" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "parent_comment_id" TEXT,
    "comment_content" TEXT,
    "comment_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alarms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_scores" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "game" TEXT NOT NULL DEFAULT 'slot',
    "bet" BIGINT NOT NULL,
    "payout" BIGINT NOT NULL,
    "delta" BIGINT NOT NULL,
    "balance" BIGINT NOT NULL,
    "reels" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_score_2048" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_score_2048_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_score_minesweeper" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "time" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_score_minesweeper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_score_watermelon" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_score_watermelon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_user_balance" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "total_spin" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slot_user_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_logs" (
    "id" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "email" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memos" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "deny" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3),
    "last_modified" TIMESTAMP(3),

    CONSTRAINT "memos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_logs" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT,
    "ip" TEXT NOT NULL,
    "device_id" TEXT,
    "user_agent" TEXT,
    "provider" TEXT,
    "path" TEXT,

    CONSTRAINT "login_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_nickname_key" ON "users"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE INDEX "articles_email_created_at_idx" ON "articles"("email", "created_at" DESC);

-- CreateIndex
CREATE INDEX "articles_board_id_state_created_at_idx" ON "articles"("board_id", "state", "created_at" DESC);

-- CreateIndex
CREATE INDEX "comments_email_idx" ON "comments"("email");

-- CreateIndex
CREATE INDEX "comments_article_id_created_at_idx" ON "comments"("article_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "comments_parent_comment_id_idx" ON "comments"("parent_comment_id");

-- CreateIndex
CREATE INDEX "alarms_email_updated_at_idx" ON "alarms"("email", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "alarms_email_read_at_created_at_idx" ON "alarms"("email", "read_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "alarms_article_id_idx" ON "alarms"("article_id");

-- CreateIndex
CREATE INDEX "game_scores_game_created_at_idx" ON "game_scores"("game", "created_at" DESC);

-- CreateIndex
CREATE INDEX "game_scores_game_bet_created_at_idx" ON "game_scores"("game", "bet", "created_at" DESC);

-- CreateIndex
CREATE INDEX "game_scores_email_created_at_idx" ON "game_scores"("email", "created_at" DESC);

-- CreateIndex
CREATE INDEX "game_score_2048_created_at_idx" ON "game_score_2048"("created_at" DESC);

-- CreateIndex
CREATE INDEX "game_score_2048_email_score_idx" ON "game_score_2048"("email", "score" DESC);

-- CreateIndex
CREATE INDEX "game_score_minesweeper_created_at_idx" ON "game_score_minesweeper"("created_at" DESC);

-- CreateIndex
CREATE INDEX "game_score_minesweeper_email_mode_time_idx" ON "game_score_minesweeper"("email", "mode", "time");

-- CreateIndex
CREATE INDEX "game_score_watermelon_created_at_idx" ON "game_score_watermelon"("created_at" DESC);

-- CreateIndex
CREATE INDEX "game_score_watermelon_email_score_idx" ON "game_score_watermelon"("email", "score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "slot_user_balance_email_key" ON "slot_user_balance"("email");

-- CreateIndex
CREATE INDEX "slot_user_balance_balance_idx" ON "slot_user_balance"("balance" DESC);

-- CreateIndex
CREATE INDEX "game_logs_game_idx" ON "game_logs"("game");

-- CreateIndex
CREATE INDEX "game_logs_email_idx" ON "game_logs"("email");

-- CreateIndex
CREATE INDEX "game_logs_created_at_idx" ON "game_logs"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "memos_email_key" ON "memos"("email");

-- CreateIndex
CREATE UNIQUE INDEX "memos_to_email_key" ON "memos"("to_email");

-- CreateIndex
CREATE INDEX "login_logs_at_idx" ON "login_logs"("at" DESC);

-- CreateIndex
CREATE INDEX "login_logs_user_id_idx" ON "login_logs"("user_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- UNLOGGED cache tables (Prisma schema 미지원)
CREATE UNLOGGED TABLE cache_kv (
  namespace  TEXT        NOT NULL,
  key        TEXT        NOT NULL,
  value      JSONB       NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (namespace, key)
);
CREATE INDEX cache_kv_expires_idx ON cache_kv (expires_at);
CREATE INDEX cache_kv_ns_key_prefix_idx ON cache_kv (namespace, key text_pattern_ops);

CREATE UNLOGGED TABLE rate_limit (
  bucket     TEXT PRIMARY KEY,
  count      INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE UNLOGGED TABLE dedup_lock (
  key        TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
