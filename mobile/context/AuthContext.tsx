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
  presence?: {
    type: 'playing' | 'listening';
    name: string;
  } | null;
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
  updatePresence: (presence: { type: string; name: string; } | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

let socket: Socket | null = null;

const initSocket = (token: string) => {
  console.log('[Auth] Initializing socket connection...');
  if (!token) {
    console.warn('[Auth] No token provided, cannot initialize socket');
    return null;
  }

  if (socket?.connected) {
    console.log('[Auth] Reusing existing connected socket:', {
      id: socket.id,
      transport: socket.io?.engine?.transport?.name,
      readyState: socket.io?.engine?.readyState
    });
    return socket;
  }

  if (socket) {
    console.log('[Auth] Disconnecting existing socket before reinitializing');
    socket.disconnect();
  }

  console.log('[Auth] Creating new socket instance with config:', {
    url: API_URL,
    transports: ['websocket', 'polling'],
    hasToken: !!token
  });

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

  // Add a timeout to prevent hanging
  const connectionTimeout = setTimeout(() => {
    if (socket && !socket.connected) {
      console.warn('[Auth] Socket connection timeout, cleaning up');
      socket.disconnect();
      socket = null;
    }
  }, 15000); // 15 second timeout

  socket.on('connect', () => {
    console.log('[Auth] Socket connected successfully:', {
      id: socket?.id,
      transport: socket?.io?.engine?.transport?.name,
      readyState: socket?.io?.engine?.readyState
    });
    clearTimeout(connectionTimeout);
    socket?.emit('get_online_users');
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected. Reason:', reason);
    console.log('[Socket] Was connected:', socket?.connected);
    console.log('[Socket] Current state:', socket?.io?.engine?.readyState);
    clearTimeout(connectionTimeout);
    
    if (reason === 'io server disconnect') {
      console.log('[Socket] Server initiated disconnect, attempting reconnect...');
      socket?.connect();
    }
  });

  socket.on('connect_error', async (error: Error & { description?: string }) => {
    console.error('[Auth] Socket connection error:', {
      message: error.message,
      description: error.description,
      transport: socket?.io?.engine?.transport?.name,
      readyState: socket?.io?.engine?.readyState
    });
    clearTimeout(connectionTimeout);

    if (error.message === 'Authentication required' || error.message === 'Invalid token') {
      console.log('[Auth] Authentication error, clearing token');
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

  socket.io.on('reconnect_attempt', (attempt) => {
    console.log('[Auth] Socket reconnection attempt:', {
      attempt,
      transport: socket?.io?.engine?.transport?.name,
      readyState: socket?.io?.engine?.readyState
    });
  });

  socket.io.on('reconnect_error', (error) => {
    console.error('[Auth] Socket reconnection error:', {
      error,
      transport: socket?.io?.engine?.transport?.name,
      readyState: socket?.io?.engine?.readyState
    });
  });

  socket.io.on('reconnect_failed', () => {
    console.error('[Auth] Socket reconnection failed after all attempts:', {
      transport: socket?.io?.engine?.transport?.name,
      readyState: socket?.io?.engine?.readyState
    });
  });

  socket.io.on('ping', () => {
    console.log('[Socket] Ping sent at:', new Date().toISOString());
  });

  console.log('[Socket] Connecting socket...');
  socket.connect();
  return socket;
};

const disconnectSocket = () => {
  if (socket) {
    console.log('[Auth] Disconnecting socket...');
    socket.disconnect();
    socket = null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<Map<string, any>>(new Map());
  const [offlineUsers, setOfflineUsers] = useState<Map<string, any>>(new Map());
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);

  // Initialize socket when token is available
  const initializeSocket = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        console.log('[Auth] Attempting to initialize socket with token');
        const newSocket = initSocket(token);
        if (newSocket) {
          console.log('[Auth] Socket initialized successfully');
          setSocketInstance(newSocket);
          return newSocket;
        } else {
          console.log('[Auth] Failed to initialize socket');
        }
      } else {
        console.log('[Auth] No token available for socket initialization');
      }
      return null;
    } catch (error) {
      console.error('[Auth] Error initializing socket:', error);
      return null;
    }
  };

  // Add a function to handle socket disconnection with state
  const handleDisconnectSocket = () => {
    disconnectSocket();
    setSocketInstance(null);
  };

  // Handle initial app load
  useEffect(() => {
    const loadUser = async () => {
      try {
        console.log('[Auth] Loading user and initializing socket...');
        const token = await AsyncStorage.getItem('token');
        if (token) {
          const res = await getCurrentUser();
          setUser(res.data);
          
          // Initialize socket asynchronously without blocking the user load
          setTimeout(async () => {
            try {
              const newSocket = await initializeSocket();
              if (newSocket) {
                setSocketInstance(newSocket);
              } else {
                console.warn('[Auth] Could not initialize socket during user load');
              }
            } catch (socketError) {
              console.error('[Auth] Socket initialization error during user load:', socketError);
              // Don't throw error here as user load was successful
            }
          }, 100);
          
        } else {
          console.log('[Auth] No token found during initial load');
        }
      } catch (error) {
        console.error('[Auth] Failed to load user:', error);
        await AsyncStorage.removeItem('token');
        handleDisconnectSocket();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  // Socket cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketInstance) {
        console.log('[Auth] Cleaning up socket on unmount');
        handleDisconnectSocket();
      }
    };
  }, [socketInstance]);

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
      
      // Set user first, then initialize socket asynchronously
      setUser(res.data.user);
      
      // Initialize socket asynchronously without blocking the login
      setTimeout(async () => {
        try {
          const newSocket = initSocket(res.data.token);
          if (newSocket) {
            setSocketInstance(newSocket);
          } else {
            console.warn('[Auth] Socket initialization failed, but login was successful');
          }
        } catch (socketError) {
          console.error('[Auth] Socket initialization error:', socketError);
          // Don't throw error here as login was successful
        }
      }, 100);
      
    } catch (error: any) {
      const message = error.message === 'Network Error' || error.message === 'No internet connection'
        ? 'Please check your internet connection and try again'
        : 'Login failed. Please check your credentials.';
      
      Alert.alert('Error', message);
      console.error('[Auth] Login error:', error);
      await AsyncStorage.removeItem('token');
      disconnectSocket();
      setSocketInstance(null);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const registerUser = async (username: string, email: string, password: string) => {
    try {
      const res = await register(username, email, password);
      await AsyncStorage.setItem('token', res.data.token);
      
      // Set user first, then initialize socket asynchronously
      setUser(res.data.user);
      
      // Initialize socket asynchronously without blocking the registration
      setTimeout(async () => {
        try {
          const newSocket = initSocket(res.data.token);
          if (newSocket) {
            setSocketInstance(newSocket);
          } else {
            console.warn('[Auth] Socket initialization failed, but registration was successful');
          }
        } catch (socketError) {
          console.error('[Auth] Socket initialization error:', socketError);
          // Don't throw error here as registration was successful
        }
      }, 100);
      
    } catch (err) {
      console.error('Registration failed:', err);
      await AsyncStorage.removeItem('token');
      disconnectSocket();
      setSocketInstance(null);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('token');
      disconnectSocket();
      setSocketInstance(null);
      setUser(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const updatePresence = (presence: { type: string; name: string; } | null) => {
    if (socketInstance) {
      socketInstance.emit('update_presence', { presence });
    }
  };

  // Update socket event handlers to handle presence
  useEffect(() => {
    if (!socketInstance) return;

    socketInstance.on('user_status', ({ userId, username, avatar_url, status, presence }) => {
      if (status === 'online') {
        setOnlineUsers(prev => {
          const newUsers = new Map(prev);
          newUsers.set(userId, { userId, username, avatar_url, status, presence });
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

    return () => {
      socketInstance.off('user_status');
    };
  }, [socketInstance]);

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
      socket: socketInstance,
      updatePresence
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