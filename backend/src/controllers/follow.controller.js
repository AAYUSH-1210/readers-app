// backend/src/controllers/follow.controller.js
import Follow from "../models/Follow.js";
import User from "../models/User.js";
import { logActivity } from "../utils/activityLogger.js";
import { createNotification } from "../utils/notify.js";

/* Follow a user */
export async function followUser(req, res, next) {
  try {
    const follower = req.user.id;
    const following = req.params.userId;

    if (follower === following) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }

    const targetUser = await User.findById(following);
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    const existing = await Follow.findOne({ follower, following });
    if (existing) return res.status(200).json({ message: "Already following" });

    const follow = await Follow.create({ follower, following });

    // Activity log
    logActivity({
      user: follower,
      type: "follow",
      action: "created",
      meta: { following },
    });

    // 🔔 Send notification to the user being followed
    await createNotification({
      user: following, // receiving user
      fromUser: follower, // actor user
      type: "follow",
      targetType: "none",
      message: "started following you",
    });

    res.status(201).json({ message: "Followed", follow });
  } catch (err) {
    next(err);
  }
}

/* Unfollow a user */
export async function unfollowUser(req, res, next) {
  try {
    const follower = req.user.id;
    const following = req.params.userId;

    const deleted = await Follow.findOneAndDelete({ follower, following });

    if (!deleted) {
      return res.status(404).json({ message: "Not following this user" });
    }

    res.json({ message: "Unfollowed" });
  } catch (err) {
    next(err);
  }
}

/* Check if current user follows userId */
export async function checkFollow(req, res, next) {
  try {
    const follower = req.user.id;
    const following = req.params.userId;

    const isFollowing = await Follow.exists({ follower, following });

    res.json({ follower, following, isFollowing: Boolean(isFollowing) });
  } catch (err) {
    next(err);
  }
}

/* Get followers of a user */
export async function getFollowers(req, res, next) {
  try {
    const userId = req.params.userId;

    const followers = await Follow.find({ following: userId }).populate(
      "follower",
      "name username avatarUrl"
    );

    res.json({ count: followers.length, followers });
  } catch (err) {
    next(err);
  }
}

/* Get following list (users this user follows) */
export async function getFollowing(req, res, next) {
  try {
    const userId = req.params.userId;

    const following = await Follow.find({ follower: userId }).populate(
      "following",
      "name username avatarUrl"
    );

    res.json({ count: following.length, following });
  } catch (err) {
    next(err);
  }
}
