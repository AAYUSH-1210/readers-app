// backend/src/utils/socket.js
let _io = null;
export function setIo(io) {
  _io = io;
}
export function getIo() {
  return _io;
}
