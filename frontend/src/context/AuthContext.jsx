import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getCurrentUser, login, register } from '../api/index';
import { initSocket, disconnectSocket } from '../socket';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  // Debug user state changes
  useEffect(() => {
    console.log('[AuthContext] User state changed:', user);
  }, [user]);

  useEffect(() => {
    const loadUser = async () => {
      console.log('[AuthContext] loadUser function called');
      const token = localStorage.getItem('token');
      console.log('[AuthContext] Token from localStorage:', token ? 'Present' : 'Missing');
      
      if (token) {
        try {
          console.log('[AuthContext] Attempting to get current user...');
          const res = await getCurrentUser();
          console.log('[AuthContext] getCurrentUser successful:', res.data);
          
          // Remove mounted check to fix unmounting issue
          console.log('[AuthContext] Setting user from loadUser:', res.data);
          setUser(res.data);
          
          // Initialize socket asynchronously without blocking the user load
          setTimeout(() => {
            try {
              const socket = initSocket();
              if (!socket) {
                console.warn('Socket initialization failed during user load');
              }
            } catch (socketError) {
              console.error('Socket initialization error during user load:', socketError);
              // Don't throw error here as user load was successful
            }
          }, 100);
          
        } catch (err) {
          console.error('[AuthContext] Failed to load user:', err);
          console.error('[AuthContext] Error details:', {
            message: err.message,
            response: err.response?.data,
            status: err.response?.status
          });
          localStorage.removeItem('token');
          disconnectSocket();
          
          // Remove mounted check here too
          console.log('[AuthContext] Setting user to null due to error');
          setUser(null);
        }
      } else {
        console.log('[AuthContext] No token found, user will remain null');
      }
      
      // Remove mounted check here too
      console.log('[AuthContext] Setting loading to false');
      setLoading(false);
    };

    loadUser();

    return () => {
      disconnectSocket();
    };
  }, []);

  const loginUser = async (username, password) => {
    try {
      console.log('[AuthContext] Starting login process...');
      const res = await login(username, password);
      console.log('[AuthContext] Login API call successful:', res.data);
      
      localStorage.setItem('token', res.data.token);
      console.log('[AuthContext] Token stored in localStorage');
      
      // Temporarily remove mounted check to debug
      console.log('[AuthContext] Setting user state:', res.data.user);
      setUser(res.data.user);
      
      // Initialize socket asynchronously without blocking the login
      setTimeout(() => {
        try {
          const socket = initSocket();
          if (!socket) {
            console.warn('Socket initialization failed, but login was successful');
          }
        } catch (socketError) {
          console.error('Socket initialization error:', socketError);
          // Don't throw error here as login was successful
        }
      }, 100);
      
      console.log('[AuthContext] Login process completed successfully');
      return res.data;
    } catch (err) {
      console.error('[AuthContext] Login failed:', err);
      localStorage.removeItem('token');
      disconnectSocket();
      throw err;
    }
  };

  const registerUser = async (username, email, password) => {
    try {
      const res = await register(username, email, password);
      localStorage.setItem('token', res.data.token);
      
      // Temporarily remove mounted check to debug
      console.log('[AuthContext] Setting user state from registration:', res.data.user);
      setUser(res.data.user);
      
      // Initialize socket asynchronously without blocking the registration
      setTimeout(() => {
        try {
          const socket = initSocket();
          if (!socket) {
            console.warn('Socket initialization failed, but registration was successful');
          }
        } catch (socketError) {
          console.error('Socket initialization error:', socketError);
          // Don't throw error here as registration was successful
        }
      }, 100);
      
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
      disconnectSocket();
      localStorage.removeItem('token');
      // Remove mounted check to be consistent
      setUser(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loginUser, registerUser, logout }}>
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