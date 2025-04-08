import { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser, login, register } from '../api';
import { initSocket, disconnectSocket } from '../socket';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      getCurrentUser()
        .then(res => {
          setUser(res.data);
          initSocket();
        })
        .catch(() => {
          localStorage.removeItem('token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const loginUser = async (username, password) => {
    const res = await login(username, password);
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    initSocket();
    return res.data;
  };

  const registerUser = async (username, email, password) => {
    const res = await register(username, email, password);
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    initSocket();
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    disconnectSocket();
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