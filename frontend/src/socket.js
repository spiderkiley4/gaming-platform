import { io } from 'socket.io-client';
import { API_URL } from './api';

let socket = null;

export const initSocket = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;

  if (socket?.connected) return socket;

  if (socket) {
    socket.disconnect();
  }

  socket = io(API_URL, {
    transports: ['websocket', 'polling'],
    upgrade: true,
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 20000,
    forceNew: true
  });

  socket.on('connect', () => {
    console.log('Socket connected with ID:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    if (reason === 'io server disconnect') {
      // Server initiated disconnect, try reconnecting
      socket.connect();
    }
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    if (error.message === 'Authentication required' || error.message === 'Invalid token') {
      localStorage.removeItem('token');
      window.location.reload();
    } else {
      // Try reconnecting for other errors
      setTimeout(() => {
        socket.connect();
      }, 1000);
    }
  });

  socket.io.on('reconnect_attempt', (attempt) => {
    console.log(`Attempting to reconnect... (attempt ${attempt})`);
  });

  socket.io.on('reconnect', (attempt) => {
    console.log(`Reconnected after ${attempt} attempts`);
  });

  socket.io.on('reconnect_error', (error) => {
    console.error('Reconnection error:', error);
  });

  socket.io.on('reconnect_failed', () => {
    console.error('Failed to reconnect');
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export default { initSocket, getSocket, disconnectSocket };