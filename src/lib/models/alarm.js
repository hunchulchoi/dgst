import pkg from 'mongoose';
const { Schema, models, model } = pkg;

import '$lib/models/article.js';

export const alarmSchema = new Schema(
  {

    email: { type: String, required: true, index: true },
    boardId: { type: String, required: true },
    articleId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    comments: [{ type: String, required: true }],
    comment: { type: String },
    commentContent: { type: String },
    like: { type: Number },
    readAt: { type: Date }

  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    virtuals: {
      commentCount: {
        get() {
          return this.comments?.length || 0;
        }
      },
    }
  }
);

// 알림 목록: email + updatedAt 조건·정렬
alarmSchema.index({ email: 1, updatedAt: -1 });
// 읽지 않은 알림 개수: layout/slot 등 countDocuments(email, readAt: null, createdAt 범위)
alarmSchema.index({ email: 1, readAt: 1, createdAt: -1 });

export const Alarm = models.alarm || model('alarm', alarmSchema);
