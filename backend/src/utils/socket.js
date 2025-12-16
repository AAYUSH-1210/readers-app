// backend/src/utils/socket.js
// Lightweight singleton holder for the Socket.IO server instance.
// This allows non-HTTP modules (services, utils) to emit events
// without creating circular dependencies or reinitializing Socket.IO.

let _io = null;

/**
 * Sets the Socket.IO instance.
 * Should be called once during server initialization.
 *
 * @param {import("socket.io").Server} io
 */
export function setIo(io) {
  _io = io;
}

/**
 * Retrieves the Socket.IO instance.
 * May return null if Socket.IO has not been initialized yet.
 */
export function getIo() {
  return _io;
}
