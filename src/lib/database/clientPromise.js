/**
 * Mongoose가 연 연결의 MongoClient — Auth adapter·login_logs와 풀 공유.
 * disconnect 후에도 connectDB() 경유로 재연결된 클라이언트를 반환한다.
 */
import mongoose from 'mongoose';
import connectDB from '$lib/database/mongoosePriomise.js';
import { isDbConnectSkipped } from '$lib/database/skipDbConnect.js';

/**
 * @returns {Promise<import('mongodb').MongoClient | null>}
 */
function resolveMongoClient() {
  if (isDbConnectSkipped()) {
    return Promise.resolve(null);
  }

  return connectDB().then(() => {
    const client = mongoose.connection.getClient();
    if (!client) {
      throw new Error('[mongo] mongoose.connection.getClient() returned null');
    }
    return client;
  });
}

/** MongoDBAdapter·await clientPromise 호환 thenable */
const clientPromise = {
  then(onFulfilled, onRejected) {
    return resolveMongoClient().then(onFulfilled, onRejected);
  },
  catch(onRejected) {
    return resolveMongoClient().catch(onRejected);
  },
  finally(onFinally) {
    return resolveMongoClient().finally(onFinally);
  }
};

export default clientPromise;
