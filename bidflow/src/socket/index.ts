import { Server as SocketServer } from 'socket.io';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { EVENTS } from './events';
import { JwtPayload } from '../types';

let io: SocketServer;

export function initSocket(httpServer: Server): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: '*' },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        (socket as any).user = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      } catch { /* connexion anonyme */ }
    }
    next();
  });

  io.on('connection', (socket) => {
    socket.on(EVENTS.WATCH,   (auctionId: string) => socket.join(auctionId));
    socket.on(EVENTS.UNWATCH, (auctionId: string) => socket.leave(auctionId));
  });

  return io;
}

export function getIO(): SocketServer {
  if (!io) throw new Error('Socket.io non initialisé — appeler initSocket() d\'abord');
  return io;
}
