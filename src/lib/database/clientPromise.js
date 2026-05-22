// This approach is taken from https://github.com/vercel/next.js/tree/canary/examples/with-mongodb

import { MongoClient } from 'mongodb';
import { NODE_ENV, MONGODB_CONNECTION_STRING } from '$env/static/private';
import { isDbConnectSkipped } from '$lib/database/skipDbConnect.js';

if (!MONGODB_CONNECTION_STRING) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_CONNECTION_STRING"');
}

const uri = MONGODB_CONNECTION_STRING;
const options = {};

let client;
/** @type {Promise<MongoClient | null>} */
let clientPromise;

function createClientPromise() {
  if (isDbConnectSkipped()) {
    return Promise.resolve(null);
  }

  if (NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri, options);
      global._mongoClientPromise = client.connect();
    }
    return global._mongoClientPromise;
  }

  client = new MongoClient(uri, options);
  return client.connect();
}

clientPromise = createClientPromise();

export default clientPromise;
