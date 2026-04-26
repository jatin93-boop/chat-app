const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// middleware
app.use(cors());
app.use(express.json());

// serve frontend (index.html must be in same folder)
app.use(express.static(__dirname));

// socket setup
const io = new Server(server, {
  cors: { origin: "*" },
});

// memory storage
const users = new Map();
const rooms = new Map();

// helper
function getRoom(roomCode = "LOBBY") {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      members: new Set(),
      messages: [],
    });
  }
  return rooms.get(roomCode);
}

// root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// health route
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    users: users.size,
  });
});

// socket connection
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  users.set(socket.id, {
    name: "Anonymous",
    room: "LOBBY",
  });

  // user joins
  socket.on("user joined", ({ name, roomCode }) => {
    const user = users.get(socket.id);

    user.name = name || "Anonymous";
    user.room = roomCode || "LOBBY";

    const room = getRoom(user.room);
    room.members.add(socket.id);

    socket.join(user.room);

    // send old messages
    socket.emit("room history", room.messages);
  });

  // send message
  socket.on("room message", ({ text }) => {
    const user = users.get(socket.id);

    // ✅ IMPORTANT FIX
    if (!user || !text || !text.trim()) return;

    const room = getRoom(user.room);

    const msg = {
      sender: user.name,
      text: text.trim(),
    };

    room.messages.push(msg);

    io.to(user.room).emit("room message", msg);
  });

  // disconnect
  socket.on("disconnect", () => {
    users.delete(socket.id);
    console.log("User disconnected:", socket.id);
  });
});

// start server
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
