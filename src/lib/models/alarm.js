import pkg from 'mongoose';
const { Schema, models, model } = pkg;

import '$lib/models/article.js.js';

export const alarmSchema = new Schema(
    {

        email: { type: String, required: true, index: true, unique: true },
        articles:[{
            articleId:{type: Schema.Types.ObjectId, ref: 'article'},
            count:{type: Number}
        }]
    },
    { timestamps: true }
);

export const Alarm = models.comment || model('alarm', alarmSchema);
