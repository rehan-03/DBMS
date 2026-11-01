/**
 * scripts/view-db.mjs
 * CLI viewer for MongoDB database collections and documents.
 * Usage: node scripts/view-db.mjs [collection_name]
 */

import { MongoClient } from 'mongodb';
import nextEnv from '@next/env';
import { configureMongoDns } from '../lib/mongodb-dns.mjs';

nextEnv.loadEnvConfig(process.cwd());
configureMongoDns();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/campulse';
const dbName = process.env.MONGODB_DB || 'campulse';
const targetCollection = process.argv[2];

async function main() {
  console.log('\n🔍 Connecting to configured MongoDB database...');
  console.log(`📁 Database: ${dbName}\n`);

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });

  try {
    await client.connect();
    console.log('✅ Connected successfully!\n');
    const db = client.db(dbName);

    const collections = await db.listCollections().toArray();

    if (collections.length === 0) {
      console.log('⚠️  No collections found in database "' + dbName + '".');
      console.log('   (Collections are created automatically when documents are inserted.)\n');
      return;
    }

    if (targetCollection) {
      const coll = db.collection(targetCollection);
      const count = await coll.countDocuments();
      console.log(`📦 Collection: [${targetCollection}] (${count} documents total)`);
      console.log('─'.repeat(50));
      const sample = await coll.find({}, { projection: { password: 0 } })
        .sort({ created_at: -1, _id: -1 }).limit(10).toArray();
      console.log(JSON.stringify(sample, null, 2));
    } else {
      console.log('📊 Collections overview:');
      console.log('─'.repeat(50));
      for (const c of collections) {
        const count = await db.collection(c.name).countDocuments();
        console.log(`  • ${c.name.padEnd(25)} : ${count} documents`);
      }
      console.log('─'.repeat(50));
      console.log('\n💡 Tip: View documents of a specific collection with:');
      console.log('   node scripts/view-db.mjs <collection_name>\n');
    }
  } catch (err) {
    process.exitCode = 1;
    console.error('❌ Failed to connect to MongoDB:');
    console.error('   ' + err.message);
    console.log('\n📌 Verify:');
    console.log('   1. Is MongoDB running locally or on Atlas?');
    console.log('   2. Is your connection string correct in .env.local?');
  } finally {
    await client.close();
  }
}

main();
