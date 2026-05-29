import mongoose from 'mongoose';
import { MONGODB_CONNECTION_STRING, DB_NAME } from '$env/static/private';
import { isDbConnectSkipped } from '$lib/database/skipDbConnect.js';
import logger from '$lib/util/logger.js';
import {
  buildMongoFailureLog,
  extractMongoErrorMeta,
  redactConnectionUrl
} from '$lib/util/connectionLog.js';
import { traceFromUnknown } from '$lib/util/formatErrorTrace.js';

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
  logger.warn({
    message: `[mongo] disconnected | db=${DB_NAME}`,
    dbName: DB_NAME,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host || undefined,
    uri: redactConnectionUrl(uri)
  });

  connectionPromise = null;
  if (process.env.NODE_ENV === 'development') {
    global.__mongooseConnectionPromise = null;
  }
});

mongoose.connection.on('error', (err) => {
  logger.error({
    message: `[mongo] connection error event | db=${DB_NAME}`,
    dbName: DB_NAME,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host || undefined,
    uri: redactConnectionUrl(uri),
    ...extractMongoErrorMeta(err),
    trace: traceFromUnknown(err)
  });
});

/**
 * MongoDB(Mongoose) 연결. 실패 시 rejected — 호출부에서 await 필수.
 * @returns {Promise<typeof mongoose>}
 */
export default function connectDB() {
  if (isDbConnectSkipped()) {
    return Promise.resolve(mongoose);
  }

  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose);
  }

  if (!connectionPromise) {
    logger.info({
      message: `[mongo] connecting | db=${DB_NAME}`,
      dbName: DB_NAME,
      uri: redactConnectionUrl(uri),
      serverSelectionTimeoutMS: connectOptions.serverSelectionTimeoutMS,
      connectTimeoutMS: connectOptions.connectTimeoutMS
    });

    connectionPromise = mongoose
      .connect(uri, connectOptions)
      .then((m) => {
        logger.info({
          message: `[mongo] connected | db=${DB_NAME}`,
          dbName: DB_NAME,
          host: m.connection.host,
          readyState: m.connection.readyState,
          uri: redactConnectionUrl(uri)
        });
        return m;
      })
      .catch((err) => {
        connectionPromise = null;
        if (process.env.NODE_ENV === 'development') {
          global.__mongooseConnectionPromise = null;
        }

        logger.error(
          buildMongoFailureLog(`[mongo] connect failed | db=${DB_NAME}`, err, {
            dbName: DB_NAME,
            uri: redactConnectionUrl(uri),
            readyState: mongoose.connection.readyState,
            serverSelectionTimeoutMS: connectOptions.serverSelectionTimeoutMS,
            connectTimeoutMS: connectOptions.connectTimeoutMS
          })
        );

        throw err;
      });

    if (process.env.NODE_ENV === 'development') {
      global.__mongooseConnectionPromise = connectionPromise;
    }
  }

  return connectionPromise;
}
