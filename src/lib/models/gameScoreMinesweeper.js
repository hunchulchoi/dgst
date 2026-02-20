import pkg from 'mongoose';
const { Schema, models, model } = pkg;

const gameScoreMinesweeperSchema = new Schema(
    {
        email: { type: String, required: true, index: true },
        nickname: { type: String, required: true },
        mode: { type: String, required: true }, // 'beginner', 'intermediate', 'expert'
        time: { type: Number, required: true }, // play time in seconds, lower is better
    },
    { timestamps: true, collection: 'game_score_minesweeper' }
);

gameScoreMinesweeperSchema.index({ createdAt: -1 });
gameScoreMinesweeperSchema.index({ email: 1, mode: 1, time: 1 });

export const GameScoreMinesweeper =
    models.game_score_minesweeper || model('game_score_minesweeper', gameScoreMinesweeperSchema);
