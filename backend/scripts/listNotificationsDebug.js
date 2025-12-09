// backend/scripts/listNotificationsDebug.js
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import Notification from "../src/models/Notification.js";
import User from "../src/models/User.js";

async function main() {
  try {
    console.log("MONGO_URI:", process.env.MONGO_URI);
    await mongoose.connect(process.env.MONGO_URI);

    const total = await Notification.countDocuments();
    console.log("Total notifications in DB:", total);

    const list = await Notification.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    if (list.length === 0) {
      console.log("No notifications to show.");
      await mongoose.disconnect();
      process.exit(0);
    }

    // Collect unique user/fromUser ids to resolve usernames
    const ids = new Set();
    list.forEach((n) => {
      if (n.user) ids.add(String(n.user));
      if (n.fromUser) ids.add(String(n.fromUser));
    });

    const idArray = Array.from(ids);
    const users = await User.find({ _id: { $in: idArray } })
      .select("username name")
      .lean();
    const userMap = {};
    users.forEach((u) => {
      userMap[String(u._id)] = u;
    });

    console.log("Latest notifications (up to 20):");
    list.forEach((n) => {
      const uid = String(n.user || "");
      const fu = String(n.fromUser || "");
      console.log("--------------------------------------------------");
      console.log("notif._id:", String(n._id));
      console.log("type:", n.type, "message:", n.message);
      console.log(
        "recipient userId:",
        uid,
        " =>",
        userMap[uid]
          ? `${userMap[uid].username} (${userMap[uid].name || ""})`
          : "<user not found>"
      );
      console.log(
        "actor fromUserId:",
        fu,
        " =>",
        userMap[fu]
          ? `${userMap[fu].username} (${userMap[fu].name || ""})`
          : "<actor not found>"
      );
      console.log("targetType:", n.targetType, "targetId:", n.targetId);
      console.log("seen:", n.seen);
      console.log("createdAt:", n.createdAt);
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Error:", err && err.stack ? err.stack : err);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  }
}

main();
