import { MongoClient, Db } from 'mongodb';
import { configureMongoDns } from './mongodb-dns.mjs';

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB = process.env.MONGODB_DB || 'campulse';

// Share the pending connection too: parallel requests and development reloads
// must not each pay for a new DNS/TLS handshake and connection pool.
const mongoGlobal = globalThis as typeof globalThis & {
  campusMongo?: { uri: string; promise: Promise<MongoClient> };
};

export async function getDb(): Promise<Db> {
  if (!MONGODB_URI) {
    throw new Error(
      'MONGODB_URI is not set. Add it to your .env.local file.\n' +
      'Example: MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net'
    );
  }

  configureMongoDns();
  if (!mongoGlobal.campusMongo || mongoGlobal.campusMongo.uri !== MONGODB_URI) {
    const client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    const connection = { uri: MONGODB_URI, promise: client.connect() };
    mongoGlobal.campusMongo = connection;
    connection.promise.catch(() => {
      if (mongoGlobal.campusMongo === connection) delete mongoGlobal.campusMongo;
      void client.close();
    });
  }
  const client = await mongoGlobal.campusMongo.promise;
  return client.db(MONGODB_DB);
}
