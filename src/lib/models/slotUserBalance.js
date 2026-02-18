import pkg from 'mongoose';
const { Schema, models, model } = pkg;

/**
 * 슬롯 유저별 "현재 잔액·닉네임·총 스핀 수" 요약.
 * game_scores 집계 대신 랭킹/잔액 조회용으로 사용 (30만 건 스캔 제거).
 */
const slotUserBalanceSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    nickname: { type: String, required: true },
    balance: { type: Number, required: true, default: 0 },
    totalSpin: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

slotUserBalanceSchema.index({ balance: -1 });
slotUserBalanceSchema.index({ email: 1 }, { unique: true });

export const SlotUserBalance =
  models.slot_user_balance || model('slot_user_balance', slotUserBalanceSchema);
