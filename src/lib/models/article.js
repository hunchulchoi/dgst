import pkg from 'mongoose';
const { Schema, models, model } = pkg;

import '$lib/models/comment';

export const articleSchema = new Schema(
  {
    email: { type: String, required: true , index: true },
    nickname: { type: String, required: true },
    boardId: { type: String, required: true },
    title: { type: String, trim: true, required: true },
    content: { type: String, trim: true, required: true },
    state: { type: String, default: 'write' },
    reads: [{type: String, unique: true}],
    likes: [{type: String, unique: true}],
    unlikes: [{type: String, unique: true}],
    modified_email: { type: String },
    comments: [{ type: Schema.Types.ObjectId, ref: 'comment', unique: true }]
  },
    {
        toJSON: {virtuals: true},
        timestamps: true,
        virtuals:{
            read:{
                get(){
                    return this.reads?.length || 0;
                }
            },
            comment:{
                get(){
                    return this.comments?.length || 0;
                }
            },
            like:{
                get(){
                    return this.likes?.length || 0;
                }
            }
        }}
);

articleSchema.index({email:-1, createdAt:-1})

export const Article = models.ariticle || model('article', articleSchema);
