console.log("[DEBUG] Starting backend server.rooms.js...");

try {
  const path = require("path");
  const express = require("express");
  const http = require("http");
  const { Server } = require("socket.io");
  const cors = require("cors");

  const app = express();
  const server = http.createServer(app);

  app.use(cors());
  app.use(express.json());

  // ✅ Serve frontend (IMPORTANT)
  app.use(express.static(__dirname));

  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  const users = new Map();
  const rooms = new Map();

  const normalizeRoomCode = (value) =>
    (value || "LOBBY").trim().toUpperCase().slice(0, 12);

  const createMessage = ({ sender, text }) => ({
    id: Date.now(),
    sender,
    text,
    timestamp: new Date().toISOString(),
  });

  const getOrCreateRoom = (roomCode) => {
    const code = normalizeRoomCode(roomCode);

    if (!rooms.has(code)) {
      rooms.set(code, {
        members: new Set(),
        messages: [],
      });
    }
    return rooms.get(code);
  };

  // ✅ HEALTH ROUTE
  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      users: users.size,
    });
  });

  // ✅ ROOT → SERVE HTML
  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    users.set(socket.id, {
      id: socket.id,
      name: "Anonymous",
      roomCode: null,
    });

    socket.on("user joined", ({ name }) => {
      const user = users.get(socket.id);
      if (!user) return;

      user.name = name || "Anonymous";
      user.roomCode = "LOBBY";

      const room = getOrCreateRoom("LOBBY");
      room.members.add(socket.id);

      socket.join("LOBBY");

      socket.emit("chat history", room.messages);
    });

    socket.on("chat message", ({ text }) => {
      const user = users.get(socket.id);
      if (!user || !text) return;

      const room = getOrCreateRoom(user.roomCode);

      const msg = createMessage({
        sender: user.name,
        text: text,
      });

      room.messages.push(msg);

      io.to(user.roomCode).emit("chat message", msg);
    });

    socket.on("disconnect", () => {
      users.delete(socket.id);
      console.log("User disconnected:", socket.id);
    });
  });

  const PORT = process.env.PORT || 3000;

  server.listen(PORT, () => {
    console.log("🚀 Server running on port", PORT);
  });

} catch (err) {
  console.error("[ERROR] Backend failed:", err);
}
