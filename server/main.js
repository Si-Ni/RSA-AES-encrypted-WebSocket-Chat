const express = require("express");
const http = require("http");
const socketio = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const PORT = 3000;

server.listen(PORT, "localhost", () => {
  console.log("listening on *: " + PORT);
});

users = [];

io.on("connection", (socket) => {
  console.log("a user connected");
  socket.on("key-generated", (publicKey) => {
    socket.emit("online", users);
    usersObj = { id: socket.id, publicKey: publicKey };
    users.push(usersObj);
    socket.broadcast.emit("user-connected", usersObj);
  });

  socket.on("message", (data) => {
    if (!users.some((user) => user.id === data.to)) return;
    io.to(data.to).emit("receivedMessage", {
      from: socket.id,
      encryptedMessage: data.msg,
    });
  });

  socket.on("disconnect", () => {
    console.log("user disconnected " + socket.id);
    const index = users.findIndex((user) => user.id === socket.id);
    if (index !== -1) {
      users.splice(index, 1)[0];
    }
    socket.broadcast.emit("user-disconnected", socket.id);
  });
});
