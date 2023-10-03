import pkg from 'mongoose';
const { Schema, models, model } = pkg;

export const commentSchema = new Schema(
  {
    email: { type: String, required: true },
    nickname: { type: String, required: true },
    photo: { type: String, trim: true, required: true },
    boardId: { type: String, trim: true, required: true },
    articleId: { type: String, trim: true, required: true },
    content: { type: String, trim: true},
    image: {type: String},
    state: { type: String, default: 'write' },
    like: { type: Number, default: 0 },
    unlike: { type: Number, default: 0 },
    modified_email: { type: String }
  },
  { timestamps: true }
);

export const Comment = models.comments || model('comments', commentSchema);
