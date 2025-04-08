import { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser, login, register } from '../api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../api';

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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const initSocket = (token: string) => {
    if (socket?.connected) return socket;

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
  };

  const disconnectSocket = () => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  };

  useEffect(() => {
    const loadUser = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          const res = await getCurrentUser();
          setUser(res.data);
          initSocket(token);
        }
      } catch (error) {
        await AsyncStorage.removeItem('token');
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const loginUser = async (username: string, password: string) => {
    const res = await login(username, password);
    await AsyncStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    initSocket(res.data.token);
  };

  const registerUser = async (username: string, email: string, password: string) => {
    const res = await register(username, email, password);
    await AsyncStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    initSocket(res.data.token);
  };

  const logout = async () => {
    await AsyncStorage.removeItem('token');
    setUser(null);
    disconnectSocket();
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