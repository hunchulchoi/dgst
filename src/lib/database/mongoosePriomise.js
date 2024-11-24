import mongoose from 'mongoose';
import { MONGODB_CONNECTION_STRING, DB_NAME } from '$env/static/private';

const uri = MONGODB_CONNECTION_STRING;
const connectOptions = {
  /*useNewUrlParser: true,
  useUnifiedTopology: true,*/
  dbName: DB_NAME
};

const connection = mongoose
  .connect(uri, connectOptions)
  .then(() => console.log(DB_NAME, 'DB ready'))
  .catch((err) => console.error(DB_NAME, err));

export default function connectDB() {
  return connection;
}
