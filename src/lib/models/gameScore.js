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
    reels: [{ type: String, required: true }],
  },
  { timestamps: true }
);

export const GameScore = models.game_score || model('game_score', gameScoreSchema);


