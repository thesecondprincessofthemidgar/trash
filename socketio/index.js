const { createServer } = require("http");
const { Server } = require("socket.io");

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: ["http://127.0.0.1:8000", "http://localhost:8000"],
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("User connected");

  socket.on('join', (room) => {
    socket.join(room);
  });

  socket.on('sync', data => {
    const room = data.room;
    if (!room) return;
    console.log(`Sync event in room ${room}:`, data);
    socket.to(room).emit('sync', data);
  });
});

httpServer.listen(5000);
