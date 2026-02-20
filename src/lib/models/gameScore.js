import pkg from 'mongoose';
const { Schema, models, model } = pkg;

export const gameScoreSchema = new Schema(
  {
    email: { type: String, required: true, index: true },
    nickname: { type: String, required: true },
    game: { type: String, required: true, default: 'slot' },
    bet: { type: Number, required: true },
    payout: { type: Number, required: true },
    delta: { type: Number, required: true },
    balance: { type: Number, required: true },
    reels: [{ type: String, required: true }]
  },
  { timestamps: true }
);

// 집계/통계: 오늘 스핀 수·유저 수 (slotStats, KST 오늘 기준)
gameScoreSchema.index({ game: 1, createdAt: -1 });
// 집계: game + bet 조건
gameScoreSchema.index({ game: 1, bet: 1, createdAt: -1 });
// 최근 기록 조회: email + createdAt 정렬
gameScoreSchema.index({ email: 1, createdAt: -1 });

export const GameScore = models.game_score || model('game_score', gameScoreSchema);
