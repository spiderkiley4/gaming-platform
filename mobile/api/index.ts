import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = 'http://192.168.1.101:3000';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Add retry logic
api.interceptors.response.use(undefined, async (error) => {
  if (error.code === 'ECONNABORTED' || !error.response) {
    const retries = error.config._retry || 0;
    if (retries < 2) {
      error.config._retry = retries + 1;
      return api(error.config);
    }
  }
  return Promise.reject(error);
});

// Add token to requests
api.interceptors.request.use(async (config) => {
  try {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.error('Error setting auth token:', error);
  }
  return config;
});

export const login = (username: string, password: string) => {
  return api.post('/auth/login', { username, password });
};

export const register = (username: string, password: string) => {
  return api.post('/auth/register', { username, password });
};

export const getUser = () => {
  return api.get('/auth/user');
};

export const logout = () => {
  return api.post('/auth/logout');
};