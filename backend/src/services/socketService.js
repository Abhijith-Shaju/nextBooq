const { Server } = require('socket.io');

let io = null;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Real-Time WebSocket connected: ${socket.id}`);

    socket.on('join_cafe_room', (cafeId) => {
      if (cafeId) {
        socket.join(`cafe:${cafeId}`);
        socket.join(cafeId);
        console.log(`📡 Socket ${socket.id} joined room for cafe: ${cafeId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 WebSocket disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io has not been initialized');
  }
  return io;
};

const notifyCafeRoom = (cafeId, event, data) => {
  if (io && cafeId) {
    io.to(`cafe:${cafeId}`).to(String(cafeId)).emit(event, data);
  }
};

module.exports = {
  initSocket,
  getIO,
  notifyCafeRoom,
};
