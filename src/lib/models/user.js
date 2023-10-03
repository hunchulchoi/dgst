import mongoose, {Schema, model, models} from "mongoose";

export const userSchema = new Schema({
  email: {type: String, required: true, unique: true},
  nickname: {type: String, required: true, unique: true},
  introduction: {type: String, required: true},
  photo: {type: String},
  emailVerified: {type: Boolean},
  state: {type: String, required: true},
  grade: {type: String, default: 'user'},
  created_at: {type: Date},
  latest_login_at: {type: Date},
  last_modified: {type: Date, default: new Date()}
})

export const User = models.users || model('users', userSchema);
