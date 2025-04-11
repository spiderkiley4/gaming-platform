import { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser, login, register } from '../api';
import { initSocket, disconnectSocket } from '../socket';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await getCurrentUser();
          setUser(res.data);
          const socket = initSocket();
          if (!socket) {
            throw new Error('Failed to initialize socket');
          }
        } catch (err) {
          console.error('Failed to load user:', err);
          localStorage.removeItem('token');
          disconnectSocket();
          setUser(null);
        }
      }
      setLoading(false);
    };

    loadUser();

    return () => {
      disconnectSocket();
    };
  }, []);

  const loginUser = async (username, password) => {
    try {
      const res = await login(username, password);
      localStorage.setItem('token', res.data.token);
      setUser(res.data.user);
      const socket = initSocket();
      if (!socket) {
        throw new Error('Failed to initialize socket');
      }
      return res.data;
    } catch (err) {
      console.error('Login failed:', err);
      localStorage.removeItem('token');
      disconnectSocket();
      throw err;
    }
  };

  const registerUser = async (username, email, password) => {
    try {
      const res = await register(username, email, password);
      localStorage.setItem('token', res.data.token);
      setUser(res.data.user);
      const socket = initSocket();
      if (!socket) {
        throw new Error('Failed to initialize socket');
      }
      return res.data;
    } catch (err) {
      console.error('Registration failed:', err);
      localStorage.removeItem('token');
      disconnectSocket();
      throw err;
    }
  };

  const logout = () => {
    try {
      localStorage.removeItem('token');
      disconnectSocket();
      setUser(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <AuthContext.Provider value={{ user, loginUser, registerUser, logout }}>
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