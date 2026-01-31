import "dotenv/config";
import { MongoClient } from "mongodb";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

const args = new Set(process.argv.slice(2));
const confirm = args.has("--confirm");
const dryRun = !confirm;

const required = [
  "MONGODB_URI",
  "MONGODB_DB",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const client = new MongoClient(process.env.MONGODB_URI);

async function headObject(key) {
  return r2.send(
    new HeadObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
    })
  );
}

async function main() {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB);
  const tiles = db.collection("tiles");

  const missingMaster = [];
  const cursor = tiles.find({
    $or: [
      { r2: { $exists: false } },
      { "r2.masterKey": { $exists: false } },
      { "r2.masterKey": "" },
    ],
  });

  for await (const tile of cursor) {
    missingMaster.push(tile._id);
  }

  const missingInR2 = [];
  const checkCursor = tiles.find({
    "r2.masterKey": { $exists: true, $ne: "" },
  });

  for await (const tile of checkCursor) {
    try {
      await headObject(tile.r2.masterKey);
    } catch (error) {
      const status = error?.$metadata?.httpStatusCode;
      if (status === 404 || error?.name === "NotFound") {
        missingInR2.push(tile._id);
      } else {
        console.error(`Error checking ${tile._id}:`, error?.message ?? error);
      }
    }
  }

  const toDelete = Array.from(new Set([...missingMaster, ...missingInR2]));

  console.log(`Tiles missing masterKey: ${missingMaster.length}`);
  console.log(`Tiles missing in R2: ${missingInR2.length}`);
  console.log(`Total candidates: ${toDelete.length}`);

  if (dryRun) {
    console.log("Dry run: no deletions. Use --confirm to delete.");
    return;
  }

  if (toDelete.length) {
    const result = await tiles.deleteMany({ _id: { $in: toDelete } });
    console.log(`Deleted ${result.deletedCount} tiles.`);
  } else {
    console.log("Nothing to delete.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await client.close();
  });
