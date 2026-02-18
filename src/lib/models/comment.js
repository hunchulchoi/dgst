import pkg from 'mongoose';
const { Schema, models, model } = pkg;

export const commentSchema = new Schema(
  {
    email: { type: String, required: true , index: true},
    nickname: { type: String, required: true },
    photo: { type: String, trim: true},
    boardId: { type: String, trim: true, required: true },
    articleId: { type: String, trim: true, required: true, index: true },
    parentCommentId: { type: String, trim: true, index: true},
    parentCommentNickname: { type: String, trim: true},
    depth: {type: Number, default: 1},
    content: { type: String, trim: true },
    image: { type: String },
    state: { type: String, default: 'write' },
    likes: [{ type: String }],
    unlikes: [{ type: String}],
    modified_email: { type: String },

  },
    {
        toJSON: { virtuals: true},
        toObject: { virtuals: true},
        timestamps: true,
        virtuals:{
          like:{
            get(){
              return this.likes?.length || 0;
            }
          }
        }
    }
);

// 게시글별 댓글 목록: articleId + createdAt 정렬 (COLLSCAN·메모리 정렬 방지)
commentSchema.index({ articleId: 1, createdAt: -1 });

export const Comment = models.comment || model('comment', commentSchema);
