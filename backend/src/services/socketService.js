const { Server } = require('socket.io');
const { authenticateSocket, isAuthorizedForCafe } = require('./socketAuth');

let io = null;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  // Reject the handshake outright for unauthenticated clients — without this,
  // anyone could connect and join_cafe_room for any tenant.
  io.use(async (socket, next) => {
    try {
      socket.user = await authenticateSocket(socket.handshake.auth?.token);
      next();
    } catch (error) {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Real-Time WebSocket connected: ${socket.id}`);

    socket.on('join_cafe_room', (cafeId) => {
      if (!cafeId || !isAuthorizedForCafe(socket.user, cafeId)) {
        socket.emit('join_cafe_room_error', { message: 'Not authorized for this cafe' });
        console.warn(`📡 Socket ${socket.id} denied join for cafe: ${cafeId}`);
        return;
      }

      socket.join(`cafe:${cafeId}`);
      socket.join(cafeId);
      console.log(`📡 Socket ${socket.id} joined room for cafe: ${cafeId}`);
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
