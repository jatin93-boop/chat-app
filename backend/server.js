console.log("[DEBUG] Starting backend server.js...");

try {
  const express = require("express");
  const http = require("http");
  const { Server } = require("socket.io");
  const cors = require("cors");

  const app = express();
  const server = http.createServer(app);

  app.use(cors());
  app.use(express.json());

  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  const users = new Map();
  const typingUsers = new Set();
  const messageHistory = [];

  // ✅ HEALTH ROUTE
  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      users: users.size,
      messages: messageHistory.length,
    });
  });

  // ✅ ROOT ROUTE (FIX FOR "Cannot GET /")
  app.get("/", (_req, res) => {
    res.send("Chat App Backend Running 🚀");
  });

  const createMessage = ({ sender = "Anonymous", text = "", type = "message" }) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sender,
    text,
    type,
    timestamp: new Date().toISOString(),
  });

  const broadcastPresence = () => {
    io.emit(
      "presence",
      Array.from(users.entries()).map(([id, name]) => ({
        id,
        name,
      }))
    );
  };

  const broadcastTyping = () => {
    io.emit("typing users", Array.from(typingUsers));
  };

  const pushToHistory = (message) => {
    messageHistory.push(message);
    if (messageHistory.length > 100) {
      messageHistory.shift();
    }
  };

  const removeUserFromTyping = (name) => {
    if (!name) return;
    typingUsers.delete(name);
    broadcastTyping();
  };

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    socket.emit("chat history", messageHistory);

    socket.on("user joined", ({ name }) => {
      const nextName = name?.trim() || "Anonymous";
      const previousName = users.get(socket.id);
      const isRename = Boolean(previousName && previousName !== nextName);

      if (previousName === nextName) {
        broadcastPresence();
        return;
      }

      if (isRename) {
        typingUsers.delete(previousName);
      }

      users.set(socket.id, nextName);
      broadcastPresence();

      const systemMessage = createMessage({
        sender: "System",
        text: isRename
          ? `${previousName} is now chatting as ${nextName}.`
          : `${nextName} joined the conversation.`,
        type: "system",
      });

      pushToHistory(systemMessage);
      io.emit("chat message", systemMessage);
      broadcastTyping();
    });

    socket.on("typing", ({ name, isTyping }) => {
      const activeName = users.get(socket.id) || name?.trim() || "Anonymous";

      if (isTyping) {
        typingUsers.add(activeName);
      } else {
        typingUsers.delete(activeName);
      }

      broadcastTyping();
    });

    socket.on("chat message", (message) => {
      const sender = users.get(socket.id) || message?.sender || "Anonymous";
      const text = message?.text || "";

      if (!text.trim()) return;

      removeUserFromTyping(sender);

      const payload = createMessage({
        sender,
        text,
        type: "message",
      });

      pushToHistory(payload);
      io.emit("chat message", payload);
    });

    socket.on("disconnect", () => {
      const name = users.get(socket.id) || "Anonymous";
      users.delete(socket.id);
      removeUserFromTyping(name);
      broadcastPresence();

      const systemMessage = createMessage({
        sender: "System",
        text: `${name} left the conversation.`,
        type: "system",
      });

      pushToHistory(systemMessage);
      io.emit("chat message", systemMessage);
      console.log("User disconnected:", socket.id);
    });
  });

  const PORT = process.env.PORT || 49152;

  server.listen(PORT, () => {
    console.log("🚀 Server running on port", PORT);
  });

} catch (err) {
  console.error("[ERROR] Backend failed to start:", err);
}
