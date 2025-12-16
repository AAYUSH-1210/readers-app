// backend/src/utils/socketService.js
// Central Socket.IO service responsible for:
// - Initializing socket listeners
// - Managing per-user rooms
// - Emitting realtime events to users
//
// This module intentionally separates socket lifecycle management
// from lightweight emit helpers to avoid tight coupling with HTTP layers.

import { setIo } from "./socket.js"; // ensures getIo() returns same io
import debug from "debug";

const log = debug("app:socketService");

// Internal Socket.IO instance reference (set during initialization)
let ioInstance = null;

// Optional in-memory visibility map: userId -> Set(socketId)
// This is NOT authoritative in multi-node setups and is mainly useful
// for debugging or single-node development.
const userSockets = new Map();

/**
 * Initializes Socket.IO listeners and exposes io instance globally.
 * Must be called once during server startup.
 *
 * @param {import("socket.io").Server} io
 */
export function initSocket(io) {
  if (!io) throw new Error("initSocket requires socket.io instance");

  ioInstance = io;

  // Expose io instance via socket.js for other modules (best-effort)
  try {
    setIo(io);
  } catch (e) {
    // Non-fatal: socketService can still function without getIo()
    log("setIo failed", e && e.message ? e.message : e);
  }

  io.on("connection", (socket) => {
    // After JWT auth middleware, socket.user should be present
    const userId = socket.user?.id || socket.handshake?.auth?.userId;

    if (userId) {
      const uid = String(userId);

      // Join per-user room (compatible with Redis adapter in future)
      try {
        socket.join(`user:${uid}`);
      } catch (e) {
        log("socket.join failed", e && e.message ? e.message : e);
      }

      // Track socket locally (non-authoritative, for visibility only)
      const set = userSockets.get(uid) || new Set();
      set.add(socket.id);
      userSockets.set(uid, set);

      socket.userId = uid;
      log("socket connected and joined room for user", uid, socket.id);
    } else {
      log("socket connected without user (unauthenticated):", socket.id);
    }

    /**
     * Example on-demand action:
     * Client can request unread notification count.
     */
    socket.on("get:unreadCount", async (cb) => {
      try {
        // Lazy import avoids circular dependencies
        const Notification = (await import("../models/Notification.js"))
          .default;

        if (!socket.userId) {
          return cb && cb(null, { unread: 0 });
        }

        const count = await Notification.countDocuments({
          user: socket.userId,
          seen: false,
        });

        cb && cb(null, { unread: count });
      } catch (e) {
        cb && cb(e && e.message ? e.message : "error");
      }
    });

    socket.on("disconnect", () => {
      const uid = socket.userId;
      if (!uid) return;

      const set = userSockets.get(uid);
      if (!set) return;

      set.delete(socket.id);
      if (set.size === 0) userSockets.delete(uid);

      log("socket disconnected", uid, socket.id);
    });
  });
}

/**
 * Emits an event to a single user via their room.
 * Returns false if Socket.IO is not initialized or emit fails.
 */
export function emitToUser(userId, event, payload) {
  if (!ioInstance) return false;

  try {
    ioInstance.to(`user:${String(userId)}`).emit(event, payload);
    return true;
  } catch (e) {
    console.error("emitToUser failed", e && e.message ? e.message : e);
    return false;
  }
}

/**
 * Emits an event to multiple users.
 * Uses per-user rooms for delivery.
 */
export function emitToUsers(userIds = [], event, payload) {
  if (!ioInstance) return false;

  try {
    for (const id of userIds) {
      ioInstance.to(`user:${String(id)}`).emit(event, payload);
    }
    return true;
  } catch (e) {
    console.error("emitToUsers failed", e && e.message ? e.message : e);
    return false;
  }
}

/**
 * Returns a list of userIds that currently have active socket connections.
 * Intended for debugging / visibility only.
 */
export function getConnectedUserIds() {
  return Array.from(userSockets.keys());
}
