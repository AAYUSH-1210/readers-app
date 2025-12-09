// backend/scripts/debugDbInfo.js
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import Review from "../src/models/Review.js";

async function main() {
  console.log("MONGO_URI (env):", process.env.MONGO_URI);
  await mongoose.connect(process.env.MONGO_URI, {});
  console.log("Connected host:", mongoose.connection.host);
  console.log("Connected db name:", mongoose.connection.name);
  console.log("Review collection name:", Review.collection.collectionName);
  const cnt = await Review.countDocuments().catch(() => "<ERR>");
  console.log("reviews count:", cnt);
  const sample = await Review.find()
    .limit(5)
    .select("_id externalId user")
    .lean()
    .catch(() => []);
  console.log(
    "sample ids:",
    sample.map((s) => s._id)
  );
  const id = "6937a3384c5a1ee814c89f4e";
  console.log("check id valid:", mongoose.isValidObjectId(id));
  const found = await Review.findById(id)
    .lean()
    .catch(() => null);
  console.log("findById result exists?", !!found);
  if (found) console.log("found doc _id:", found._id.toString());
  await mongoose.disconnect();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
