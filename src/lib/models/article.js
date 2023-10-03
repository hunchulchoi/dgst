import pkg from 'mongoose';
const { Schema, models, model } = pkg;

import "$lib/models/comment.js";

export const articleSchema = new Schema(
	{
		email: { type: String, required: true },
		nickname: { type: String, required: true },
		boardId: { type: String, required: true },
		title: { type: String, trim: true, required: true },
		content: { type: String, trim: true, required: true },
		state: { type: String, default: 'write' },
		read: { type: Number, default: 0 },
		like: { type: Number, default: 0 },
		unlike: { type: Number, default: 0 },
		modified_email: { type: String },
		comments: [{ type: Schema.Types.ObjectId, ref: 'comments' }]
	},
	{ timestamps: true }
);

export const Article = models.ariticles || model('articles', articleSchema);
