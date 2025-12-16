// backend/src/controllers/follow.controller.js
// Follow controller.
//
// Responsibilities:
// - Manage follow / unfollow actions
// - Maintain social graph integrity
// - Emit activity logs and notifications on follow
//
// Notes:
// - ObjectId validation is assumed to be handled at the routing layer
// - Unfollow actions are intentionally silent (no activity, no notification)
// - Followers / following lists are currently unpaginated (by design)

import Follow from "../models/Follow.js";
import User from "../models/User.js";
import { logActivity } from "../utils/activityLogger.js";
import { createNotification } from "../utils/notify.js";

/**
 * POST /api/follow/:userId
 * Follow a user.
 */
export async function followUser(req, res, next) {
  try {
    const follower = req.user.id;
    const following = req.params.userId;

    // Prevent self-follow
    if (follower === following) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }

    // Ensure target user exists
    const targetUser = await User.findById(following);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Prevent duplicate follows
    const existing = await Follow.findOne({
      follower,
      following,
    });
    if (existing) {
      return res.status(200).json({ message: "Already following" });
    }

    const follow = await Follow.create({
      follower,
      following,
    });

    // Log follow activity (actor defaults to user)
    logActivity({
      user: follower,
      type: "follow",
      action: "created",
      meta: { following },
    });

    // Notify the user being followed
    await createNotification({
      user: following,
      fromUser: follower,
      type: "follow",
      targetType: "none",
      message: "started following you",
    });

    res.status(201).json({ message: "Followed", follow });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/follow/:userId
 * Unfollow a user.
 *
 * Note:
 * - No activity or notification is emitted by design.
 */
export async function unfollowUser(req, res, next) {
  try {
    const follower = req.user.id;
    const following = req.params.userId;

    const deleted = await Follow.findOneAndDelete({
      follower,
      following,
    });

    if (!deleted) {
      return res.status(404).json({ message: "Not following this user" });
    }

    res.json({ message: "Unfollowed" });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/follow/check/:userId
 * Check if the authenticated user follows the target user.
 */
export async function checkFollow(req, res, next) {
  try {
    const follower = req.user.id;
    const following = req.params.userId;

    const isFollowing = await Follow.exists({
      follower,
      following,
    });

    res.json({
      follower,
      following,
      isFollowing: Boolean(isFollowing),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/followers/:userId
 * Get followers of a user.
 *
 * Note:
 * - Currently unpaginated
 */
export async function getFollowers(req, res, next) {
  try {
    const userId = req.params.userId;

    const followers = await Follow.find({
      following: userId,
    }).populate("follower", "name username avatarUrl");

    res.json({
      count: followers.length,
      followers,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/following/:userId
 * Get users this user follows.
 *
 * Note:
 * - Currently unpaginated
 */
export async function getFollowing(req, res, next) {
  try {
    const userId = req.params.userId;

    const following = await Follow.find({
      follower: userId,
    }).populate("following", "name username avatarUrl");

    res.json({
      count: following.length,
      following,
    });
  } catch (err) {
    next(err);
  }
}
