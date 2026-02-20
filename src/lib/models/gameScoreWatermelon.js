import pkg from 'mongoose';
const { Schema, models, model } = pkg;

/**
 * Watermelon Game Score Model.
 * Stores individual game scores. Ranking logic handles aggregation (max score per user in last 3 days).
 */
const gameScoreWatermelonSchema = new Schema(
  {
    email: { type: String, required: true, index: true },
    nickname: { type: String, required: true },
    score: { type: Number, required: true }
  },
  { timestamps: true, collection: 'game_score_watermelon' }
);

gameScoreWatermelonSchema.index({ createdAt: -1 });
gameScoreWatermelonSchema.index({ email: 1, score: -1 });

export const GameScoreWatermelon =
  models.game_score_watermelon || model('game_score_watermelon', gameScoreWatermelonSchema);
