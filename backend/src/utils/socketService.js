// backend/src/utils/socketService.js
import { setIo } from "./socket.js"; // ensures getIo() returns same io
import debug from "debug";
const log = debug("app:socketService");

// ioInstance will be set via initSocket (and also via setIo)
let ioInstance = null;

// Optional in-memory map for visibility: userId -> Set(socketId)
const userSockets = new Map();

export function initSocket(io) {
  if (!io) throw new Error("initSocket requires socket.io instance");
  ioInstance = io;
  // expose io via socket.js/getIo
  try {
    setIo(io);
  } catch (e) {
    // swallow if setIo not available for some reason
    log("setIo failed", e && e.message ? e.message : e);
  }

  io.on("connection", (socket) => {
    // after JWT auth middleware in server.js, socket.user should be present
    const userId = socket.user?.id || socket.handshake?.auth?.userId;
    if (userId) {
      const uid = String(userId);
      // join a per-user room (works with redis adapter later)
      try {
        socket.join(`user:${uid}`);
      } catch (e) {
        log("socket.join failed", e && e.message ? e.message : e);
      }

      // maintain optional local mapping (useful in single-node dev)
      const set = userSockets.get(uid) || new Set();
      set.add(socket.id);
      userSockets.set(uid, set);
      socket.userId = uid;
      log("socket connected and joined room for user", uid, socket.id);
    } else {
      log("socket connected without user (unauthenticated):", socket.id);
    }

    // example: let client request unread count or quick actions
    socket.on("get:unreadCount", async (cb) => {
      try {
        // lazy import to avoid circular deps
        const Notification = (await import("../models/Notification.js"))
          .default;
        if (!socket.userId) return cb && cb(null, { unread: 0 });
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

export function getConnectedUserIds() {
  return Array.from(userSockets.keys());
}
