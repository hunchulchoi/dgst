import pkg from 'mongoose';
const { Schema, models, model } = pkg;

export const memoSchema = new Schema({
  email: { type: String, required: true, unique: true },
  toEmail: { type: String, required: true, unique: true },
  content: { type: String, required: true },
  deny: { type: Boolean, default: false },
  created_at: { type: Date },
  last_modified: { type: Date, default: new Date() }
});

export const Memo = models.memo || model('memo', memoSchema);
