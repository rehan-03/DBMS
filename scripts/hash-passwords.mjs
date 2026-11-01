/**
 * scripts/hash-passwords.mjs
 *
 * One-time migration script: fetches all users whose passwords are plain-text
 * and replaces them with bcrypt hashes.
 *
 * Usage:
 *   MONGODB_URI=mongodb+srv://... node scripts/hash-passwords.mjs
 */

import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import nextEnv from "@next/env";
import { configureMongoDns } from "../lib/mongodb-dns.mjs";

nextEnv.loadEnvConfig(process.cwd());
configureMongoDns();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "campulse";

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not set.");
  process.exit(1);
}

const TABLES = [
  { collection: "students", pk: "uid" },
  { collection: "staff",    pk: "suid" },
  { collection: "hods",     pk: "huid" },
];

async function run() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log("✅ Connected to MongoDB");

  const db = client.db(MONGODB_DB);

  for (const { collection: collName, pk } of TABLES) {
    const coll = db.collection(collName);
    const rows = await coll.find({ password: { $exists: true } }).toArray();

    console.log(`\n📦 Processing "${collName}" — ${rows.length} records`);

    let updated = 0;
    for (const row of rows) {
      if (!row.password) continue;

      // Already hashed — bcrypt hashes start with $2
      if (String(row.password).startsWith("$2")) continue;

      const hash = await bcrypt.hash(row.password, 10);
      await coll.updateOne({ [pk]: row[pk] }, { $set: { password: hash } });
      updated++;
      process.stdout.write(".");
    }

    console.log(`\n  ✅ Updated ${updated} plain-text passwords in "${collName}".`);
  }

  await client.close();
  console.log("\n🎉 Password hashing complete!");
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
