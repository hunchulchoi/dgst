import pkg from 'mongoose';
const { Schema, models, model } = pkg;

/**
 * 전용 로그 모델: 게임 시작 및 특정 액션 기록용
 */
const gameLogSchema = new Schema(
    {
        game: { type: String, required: true, index: true }, // 'minesweeper', 'watermelon', '2048'
        action: { type: String, required: true }, // 'start', 'end'
        email: { type: String, index: true },
        meta: { type: Schema.Types.Mixed }
    },
    { timestamps: true, collection: 'game_logs' }
);

gameLogSchema.index({ createdAt: -1 });

export const GameLog = models.game_log || model('game_log', gameLogSchema);
