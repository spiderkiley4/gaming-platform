import { io } from 'socket.io-client';
import { API_URL } from './api';

// Use the same protocol (http/https) as the API_URL
const wsUrl = API_URL;

let socket = null;

const createSocket = (token) => io(wsUrl, {
  path: '/api/socket.io',
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

const setupSocketListeners = (socket) => {
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
};

export const initSocket = () => {
  if (!socket) {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        socket = createSocket(token);
        setupSocketListeners(socket);
        
        // Add a timeout to prevent hanging
        const connectionTimeout = setTimeout(() => {
          if (socket && !socket.connected) {
            console.warn('Socket connection timeout, cleaning up');
            socket.disconnect();
            socket = null;
          }
        }, 10000); // 10 second timeout
        
        // Clear timeout when connected
        socket.on('connect', () => {
          clearTimeout(connectionTimeout);
        });
        
        // Clear timeout on error
        socket.on('connect_error', () => {
          clearTimeout(connectionTimeout);
        });
        
      } catch (error) {
        console.error('Error creating socket:', error);
        socket = null;
      }
    }
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = () => socket;

// Initialize socket on module load
export default initSocket();