/**
 * Mongoose가 연 연결의 MongoClient — Auth adapter·login_logs와 풀 공유.
 * 별도 MongoClient.connect() 호출 없음.
 */
import mongoose from 'mongoose';
import connectDB from '$lib/database/mongoosePriomise.js';
import { isDbConnectSkipped } from '$lib/database/skipDbConnect.js';

/** @type {Promise<import('mongodb').MongoClient | null>} */
const clientPromise = isDbConnectSkipped()
  ? Promise.resolve(null)
  : connectDB().then(() => {
      const client = mongoose.connection.getClient();
      if (!client) {
        throw new Error('[mongo] mongoose.connection.getClient() returned null');
      }
      return client;
    });

export default clientPromise;
