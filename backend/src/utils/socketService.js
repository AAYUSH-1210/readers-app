// backend/src/utils/socketService.js
// Minimal socket registry helper. Initialize once with initSocket(io)
// and call emitToUser(userId, event, payload) to send realtime messages.

let ioInstance = null;
// Map userId (string) -> Set of socketIds
const userSockets = new Map();

export function initSocket(io) {
  ioInstance = io;

  io.on("connection", (socket) => {
    // expect client to pass { auth: { token, userId } } on handshake or
    // to emit an "auth" event immediately. We'll accept both styles.

    // prefer handshake auth.userId if present
    const handshakeUserId = socket.handshake?.auth?.userId;
    if (handshakeUserId) {
      const set = userSockets.get(String(handshakeUserId)) || new Set();
      set.add(socket.id);
      userSockets.set(String(handshakeUserId), set);
      socket.userId = String(handshakeUserId);
    }

    // also listen for explicit auth event (if client uses that)
    socket.on("auth", (data) => {
      const uid = data?.userId;
      if (!uid) return;
      const set = userSockets.get(String(uid)) || new Set();
      set.add(socket.id);
      userSockets.set(String(uid), set);
      socket.userId = String(uid);
    });

    socket.on("disconnect", () => {
      const uid = socket.userId;
      if (!uid) return;
      const set = userSockets.get(String(uid));
      if (!set) return;
      set.delete(socket.id);
      if (set.size === 0) userSockets.delete(String(uid));
    });
  });
}

export function emitToUser(userId, event, payload) {
  if (!ioInstance) return false;
  const set = userSockets.get(String(userId));
  if (!set || set.size === 0) return false;
  for (const sid of set) ioInstance.to(sid).emit(event, payload);
  return true;
}
