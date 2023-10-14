import pkg from 'mongoose';
const { Schema, models, model } = pkg;

import '$lib/models/article.js';

export const alarmSchema = new Schema(
    {

        email: { type: String, required: true, index: true},
        articleId: { type: String, required: true, index: true},
        title: { type: String, required: true},
        comments: [{ type: String, required: true}],
        comment: { type: String},
        commentContent: { type: String}
    },
    { timestamps: true }
);

export const Alarm = models.alarm || model('alarm', alarmSchema);
