import { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser, login, register } from '@/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Socket } from 'socket.io-client';
import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { initSocket, disconnectSocket, getSocket } from '../utils/socket';
import { router } from 'expo-router';
import { savePreviousUser } from '../utils/userStorage';

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
        const newSocket = await initSocket();
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
        setLoading(true);
        const token = await AsyncStorage.getItem('token');
        if (token) {
          try {
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
          } catch (authError: any) {
            console.error('[Auth] Authentication failed - token may be invalid:', authError);
            if (authError.response?.status === 401) {
              console.log('[Auth] Token is invalid, clearing auth state');
              await logout();
            } else {
              // For other errors, still clear the token as it might be corrupted
              await logout();
            }
          }
        } else {
          console.log('[Auth] No token found during initial load');
        }
      } catch (error) {
        console.error('[Auth] Failed to load user:', error);
        await logout();
      } finally {
        console.log('[Auth] Setting loading to false');
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
      const currentSocket = getSocket();
      if (state.isConnected && currentSocket?.disconnected) {
        console.log('[Socket] Network available, attempting reconnection');
        currentSocket.connect();
      }
    });

    // Don't handle AppState changes here - let SocketManager handle it
    
    return () => {
      netInfoUnsubscribe();
    };
  }, [socketInstance]);

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
      
      // Save user to previous users list
      await savePreviousUser({
        id: res.data.user.id,
        username: res.data.user.username,
        email: res.data.user.email,
        avatar_url: res.data.user.avatar_url
      });
      
      // Initialize socket asynchronously without blocking the login
      setTimeout(async () => {
        try {
          const newSocket = await initSocket();
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
      
      // Save user to previous users list
      await savePreviousUser({
        id: res.data.user.id,
        username: res.data.user.username,
        email: res.data.user.email,
        avatar_url: res.data.user.avatar_url
      });
      
      // Initialize socket asynchronously without blocking the registration
      setTimeout(async () => {
        try {
          const newSocket = await initSocket();
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
      console.log('[Auth] Logging out user...');
      await AsyncStorage.removeItem('token');
      disconnectSocket();
      setSocketInstance(null);
      setUser(null);
      setOnlineUsers(new Map());
      setOfflineUsers(new Map());
      console.log('[Auth] Logout completed successfully - user state cleared');
      
      // Force navigation to auth screen
      setTimeout(() => {
        console.log('[Auth] Navigating to auth screen after logout');
        router.replace('/(auth)/auth');
      }, 100);
    } catch (err) {
      console.error('[Auth] Logout failed:', err);
      // Force clear state even if storage fails
      setUser(null);
      setSocketInstance(null);
      setOnlineUsers(new Map());
      setOfflineUsers(new Map());
      console.log('[Auth] Force cleared user state after logout error');
      
      // Force navigation to auth screen even on error
      setTimeout(() => {
        console.log('[Auth] Navigating to auth screen after logout error');
        router.replace('/(auth)/auth');
      }, 100);
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