// This approach is taken from https://github.com/vercel/next.js/tree/canary/examples/with-mongodb

import { MongoClient } from 'mongodb';
import { NODE_ENV, MONGODB_CONNECTION_STRING, DB_NAME } from '$env/static/private';
import { isDbConnectSkipped } from '$lib/database/skipDbConnect.js';
import logger from '$lib/util/logger.js';
import {
  buildMongoFailureLog,
  redactConnectionUrl
} from '$lib/util/connectionLog.js';

if (!MONGODB_CONNECTION_STRING) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_CONNECTION_STRING"');
}

const uri = MONGODB_CONNECTION_STRING;
const options = {
  serverSelectionTimeoutMS: 10_000,
  connectTimeoutMS: 10_000
};

let client;
/** @type {Promise<MongoClient | null>} */
let clientPromise;

/**
 * @param {unknown} err
 */
function logNativeMongoFailure(err) {
  logger.error(
    buildMongoFailureLog('[mongo-native] connect failed', err, {
      dbName: DB_NAME,
      uri: redactConnectionUrl(uri),
      driver: 'mongodb',
      nodeEnv: NODE_ENV
    })
  );
}

function createClientPromise() {
  if (isDbConnectSkipped()) {
    return Promise.resolve(null);
  }

  logger.info({
    message: '[mongo-native] connecting',
    dbName: DB_NAME,
    uri: redactConnectionUrl(uri),
    driver: 'mongodb',
    nodeEnv: NODE_ENV
  });

  if (NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri, options);
      global._mongoClientPromise = client.connect().then((connected) => {
        logger.info({
          message: '[mongo-native] connected',
          dbName: DB_NAME,
          uri: redactConnectionUrl(uri),
          driver: 'mongodb'
        });
        return connected;
      }).catch((err) => {
        global._mongoClientPromise = undefined;
        logNativeMongoFailure(err);
        throw err;
      });
    }
    return global._mongoClientPromise;
  }

  client = new MongoClient(uri, options);
  return client.connect().then((connected) => {
    logger.info({
      message: '[mongo-native] connected',
      dbName: DB_NAME,
      uri: redactConnectionUrl(uri),
      driver: 'mongodb'
    });
    return connected;
  }).catch((err) => {
    logNativeMongoFailure(err);
    throw err;
  });
}

clientPromise = createClientPromise();

export default clientPromise;
