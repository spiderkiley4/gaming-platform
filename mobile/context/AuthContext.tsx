import { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser, login, register } from '../api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../api';
import axios from 'axios';
import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

interface User {
  id: number;
  username: string;
  email: string;
  avatar_url?: string;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  loading: boolean;
  loginUser: (username: string, password: string) => Promise<void>;
  registerUser: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  socket: Socket | null;
  onlineUsers: Map<string, any>;
  offlineUsers: Map<string, any>;
}

const AuthContext = createContext<AuthContextType | null>(null);

let socket: Socket | null = null;

const initSocket = (token: string) => {
  console.log('[Socket] Initializing socket connection...');
  if (!token) {
    console.log('[Socket] No token provided, cannot initialize socket');
    return null;
  }

  if (socket?.connected) {
    console.log('[Socket] Reusing existing connected socket:', socket.id);
    return socket;
  }

  if (socket) {
    console.log('[Socket] Disconnecting existing socket before reinitializing');
    socket.disconnect();
  }

  console.log('[Socket] Creating new socket instance');
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
    forceNew: true,
    autoConnect: true
  });

  // Connection event handlers
  socket.on('connect', () => {
    console.log('[Socket] Connected successfully with ID:', socket?.id);
    console.log('[Socket] Transport:', socket?.io?.engine?.transport?.name);
    console.log('[Socket] Upgrade:', socket?.io?.engine?.transport?.upgrade);
    socket?.emit('get_online_users');
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected. Reason:', reason);
    console.log('[Socket] Was connected:', socket?.connected);
    console.log('[Socket] Current state:', socket?.io?.engine?.readyState);
    
    if (reason === 'io server disconnect') {
      console.log('[Socket] Server initiated disconnect, attempting reconnect...');
      socket?.connect();
    }
  });

  socket.on('connect_error', async (error) => {
    console.error('[Socket] Connection error:', error.message);
    console.log('[Socket] Error details:', {
      type: error.type,
      description: error.description,
      context: error.context
    });

    if (error.message === 'Authentication required' || error.message === 'Invalid token') {
      console.log('[Socket] Authentication error, clearing token');
      await AsyncStorage.removeItem('token');
    } else {
      console.log('[Socket] Attempting reconnect after error...');
      setTimeout(() => {
        if (socket && !socket.connected) {
          console.log('[Socket] Retrying connection...');
          socket.connect();
        }
      }, 1000);
    }
  });

  socket.io.on('reconnect', (attemptNumber) => {
    console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
    console.log('[Socket] New socket ID:', socket?.id);
  });

  socket.io.on('reconnect_attempt', (attemptNumber) => {
    console.log('[Socket] Reconnection attempt:', attemptNumber);
    console.log('[Socket] Using transport:', socket?.io?.engine?.transport?.name);
  });

  socket.io.on('reconnect_error', (error) => {
    console.error('[Socket] Reconnection error:', error);
    console.log('[Socket] Current state:', socket?.io?.engine?.readyState);
  });

  socket.io.on('reconnect_failed', () => {
    console.error('[Socket] Reconnection failed after all attempts');
    console.log('[Socket] Final state:', socket?.io?.engine?.readyState);
  });

  socket.io.on('ping', () => {
    console.log('[Socket] Ping sent at:', new Date().toISOString());
  });

  socket.io.on('pong', (latency) => {
    console.log('[Socket] Pong received. Latency:', latency, 'ms');
  });

  console.log('[Socket] Connecting socket...');
  socket.connect();
  return socket;
};

const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<Map<string, any>>(new Map());
  const [offlineUsers, setOfflineUsers] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    const loadUser = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          const res = await getCurrentUser();
          setUser(res.data);
          const newSocket = initSocket(token);
          if (!newSocket) {
            throw new Error('Failed to initialize socket');
          }

          // Set up socket listeners for user status
          newSocket.emit('get_online_users');
          
          newSocket.on('online_users', ({ users }) => {
            const onlineMap = new Map();
            const offlineMap = new Map();
            
            users.forEach((u: any) => {
              if (u.status === 'online') {
                onlineMap.set(u.userId, u);
              } else {
                offlineMap.set(u.userId, u);
              }
            });
            
            setOnlineUsers(onlineMap);
            setOfflineUsers(offlineMap);
          });

          newSocket.on('user_status', ({ userId, username, avatar_url, status }) => {
            if (status === 'online') {
              setOnlineUsers(prev => {
                const newUsers = new Map(prev);
                newUsers.set(userId, { userId, username, avatar_url, status });
                return newUsers;
              });
              setOfflineUsers(prev => {
                const newUsers = new Map(prev);
                newUsers.delete(userId);
                return newUsers;
              });
            } else {
              setOfflineUsers(prev => {
                const newUsers = new Map(prev);
                newUsers.set(userId, { userId, username, avatar_url, status: 'offline' });
                return newUsers;
              });
              setOnlineUsers(prev => {
                const newUsers = new Map(prev);
                newUsers.delete(userId);
                return newUsers;
              });
            }
          });
        }
      } catch (error) {
        console.error('Failed to load user:', error);
        await AsyncStorage.removeItem('token');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadUser();

    // Don't disconnect socket on unmount - let it be managed by explicit connect/disconnect calls
    return () => {};
  }, []);

  // Socket lifecycle management
  useEffect(() => {
    const netInfoUnsubscribe = NetInfo.addEventListener(state => {
      console.log('[Socket] Network state changed:', {
        isConnected: state.isConnected,
        type: state.type,
        isInternetReachable: state.isInternetReachable
      });

      // Only attempt reconnection if we have a socket instance
      if (state.isConnected && socket?.disconnected) {
        console.log('[Socket] Network available, attempting reconnection');
        socket.connect();
      }
    });

    // Don't handle AppState changes here - let SocketManager handle it
    
    return () => {
      netInfoUnsubscribe();
    };
  }, [socket]);

  const loginUser = async (username: string, password: string) => {
    try {
      setLoading(true);
      const netState = await NetInfo.fetch();
      
      if (!netState.isConnected) {
        throw new Error('No internet connection');
      }

      const res = await login(username, password);
      await AsyncStorage.setItem('token', res.data.token);
      
      // Initialize socket before setting user
      const newSocket = initSocket(res.data.token);
      if (!newSocket) {
        throw new Error('Failed to initialize socket');
      }
      
      // Set user after socket is initialized
      setUser(res.data.user);
      
    } catch (error: any) {
      const message = error.message === 'Network Error' || error.message === 'No internet connection'
        ? 'Please check your internet connection and try again'
        : 'Login failed. Please check your credentials.';
      
      Alert.alert('Error', message);
      console.error('[Auth] Login error:', error);
      await AsyncStorage.removeItem('token');
      disconnectSocket();
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const registerUser = async (username: string, email: string, password: string) => {
    try {
      const res = await register(username, email, password);
      await AsyncStorage.setItem('token', res.data.token);
      setUser(res.data.user);
      const newSocket = initSocket(res.data.token);
      if (!newSocket) {
        throw new Error('Failed to initialize socket');
      }
    } catch (err) {
      console.error('Registration failed:', err);
      await AsyncStorage.removeItem('token');
      disconnectSocket();
      throw err;
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('token');
      disconnectSocket();
      setUser(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  if (loading) {
    return null; // Or a loading spinner component
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      setUser, 
      loginUser, 
      registerUser, 
      logout,
      loading,
      onlineUsers,
      offlineUsers,
      socket
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};