import pkg from 'mongoose';
const { Schema, models, model } = pkg;

/**
 * 2048 게임 점수 (뺑뺑이 점수와 무관).
 * 게임오버 시 한 건 저장. 랭킹은 3일 내 id(email)별 최고점만 인정.
 */
const gameScore2048Schema = new Schema(
  {
    email: { type: String, required: true, index: true },
    nickname: { type: String, required: true },
    score: { type: Number, required: true },
  },
  { timestamps: true, collection: 'game_score_2048' }
);

gameScore2048Schema.index({ createdAt: -1 });
gameScore2048Schema.index({ email: 1, score: -1 });

export const GameScore2048 =
  models.game_score_2048 || model('game_score_2048', gameScore2048Schema);
