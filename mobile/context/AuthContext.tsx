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
  loading: boolean;
  loginUser: (username: string, password: string) => Promise<void>;
  registerUser: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  socket: Socket | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

let socket: Socket | null = null;

const initSocket = (token: string): Socket | null => {
  try {
    if (socket?.connected) return socket;

    if (socket) {
      socket.disconnect();
    }

    socket = io(API_URL, {
      transports: ['websocket'],
      upgrade: false,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 20000
    });

    socket.on('connect', () => {
      console.log('Socket connected with ID:', socket?.id);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      if (error.message === 'Authentication required' || error.message === 'Invalid token') {
        AsyncStorage.removeItem('token');
      }
    });

    return socket;
  } catch (err) {
    console.error('Failed to initialize socket:', err);
    return null;
  }
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
        }
      } catch (error) {
        console.error('Failed to load user:', error);
        await AsyncStorage.removeItem('token');
        disconnectSocket();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadUser();

    return () => {
      disconnectSocket();
    };
  }, []);

  const loginUser = async (username: string, password: string) => {
    try {
      setLoading(true);
      const netState = await NetInfo.fetch();
      
      if (!netState.isConnected) {
        throw new Error('No internet connection');
      }

      const res = await login(username, password);
      await AsyncStorage.setItem('token', res.data.token);
      setUser(res.data.user);
      const newSocket = initSocket(res.data.token);
      if (!newSocket) {
        throw new Error('Failed to initialize socket');
      }
    } catch (error: any) {
      const message = error.message === 'Network Error' || error.message === 'No internet connection'
        ? 'Please check your internet connection and try again'
        : 'Login failed. Please check your credentials.';
      
      Alert.alert('Error', message);
      console.error('Login error:', error);
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
    <AuthContext.Provider value={{ user, loading, loginUser, registerUser, logout, socket }}>
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