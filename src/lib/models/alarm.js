import pkg from 'mongoose';
const { Schema, models, model } = pkg;

import '$lib/models/article.js';

export const alarmSchema = new Schema(
    {

        email: { type: String, required: true, index: true},
        boardId: { type: String, required: true},
        articleId: { type: String, required: true, index: true},
        title: { type: String, required: true},
        comments: [{ type: String, required: true}],
        comment: { type: String},
        commentContent: { type: String},
        like: {type: Number},
        readAt: {type: Date}

    },
    {
      timestamps: true,
      toJSON: {virtuals: true},
      virtuals:{
        commentCount:{
          get(){
            return this.comments?.length || 0;
          }
        },
      }
    }
);

export const Alarm = models.alarm || model('alarm', alarmSchema);
