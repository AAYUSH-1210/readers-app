// backend/tools/socketTestClient.js
import { io } from "socket.io-client";

const SERVER = process.env.SOCKET_SERVER || "http://localhost:5000";
const TOKEN = process.env.TEST_TOKEN || "<PASTE_A_VALID_JWT_HERE>";

const socket = io(SERVER, {
  auth: { token: TOKEN },
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("connected", socket.id);
  // request unread count as a quick sanity check
  socket.emit("get:unreadCount", (err, res) => {
    if (err) console.error("unread count error", err);
    else console.log("unread count:", res);
  });
});

socket.on("disconnect", (reason) => {
  console.log("disconnected", reason);
});

socket.on("notification", (data) => {
  console.log("notification:", data);
});

socket.on("feed:update", (data) => {
  console.log("feed:update:", data);
});

// keep process alive
process.on("SIGINT", () => {
  console.log("closing test client");
  socket.close();
  process.exit(0);
});
