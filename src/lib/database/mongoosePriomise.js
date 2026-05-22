import mongoose from 'mongoose';
import { MONGODB_CONNECTION_STRING, DB_NAME } from '$env/static/private';

const uri = MONGODB_CONNECTION_STRING;
const connectOptions = {
  dbName: DB_NAME,
  serverSelectionTimeoutMS: 10_000,
  connectTimeoutMS: 10_000
};

/** @type {Promise<typeof mongoose> | null} */
let connectionPromise = null;

if (process.env.NODE_ENV === 'development' && global.__mongooseConnectionPromise) {
  connectionPromise = global.__mongooseConnectionPromise;
}

mongoose.connection.on('disconnected', () => {
  connectionPromise = null;
  if (process.env.NODE_ENV === 'development') {
    global.__mongooseConnectionPromise = null;
  }
});

/**
 * MongoDB(Mongoose) 연결. 실패 시 rejected — 호출부에서 await 필수.
 * @returns {Promise<typeof mongoose>}
 */
export default function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose);
  }

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(uri, connectOptions)
      .then((m) => {
        console.log(DB_NAME, 'DB ready');
        return m;
      })
      .catch((err) => {
        connectionPromise = null;
        if (process.env.NODE_ENV === 'development') {
          global.__mongooseConnectionPromise = null;
        }
        console.error(DB_NAME, 'DB connection failed', err);
        throw err;
      });

    if (process.env.NODE_ENV === 'development') {
      global.__mongooseConnectionPromise = connectionPromise;
    }
  }

  return connectionPromise;
}
