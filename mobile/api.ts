import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Use consistent API URL across all platforms
export const API_URL = 'http://47.6.25.173:3001';

// Create axios instance with auth header interceptor
const api = axios.create({
  baseURL: API_URL,
  timeout: 20000, // Increased timeout
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add retry logic with exponential backoff
api.interceptors.response.use(undefined, async (error) => {
  if (error.code === 'ECONNABORTED' || !error.response) {
    const retries = error.config._retry || 0;
    if (retries < 3) { // Increased max retries
      error.config._retry = retries + 1;
      // Exponential backoff
      const backoffDelay = Math.min(1000 * Math.pow(2, retries), 10000);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
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

// Auth endpoints
export const register = (username: string, email: string, password: string) => 
  api.post('/auth/register', { username, email, password });

export const login = (username: string, password: string) => 
  api.post('/auth/login', { username, password });

export const getCurrentUser = () => 
  api.get('/users/me');

export const updateProfile = (data: { avatar_url?: string }) => 
  api.patch('/users/me', data);

// Channel endpoints
export const getChannels = (type?: 'text' | 'voice') => {
  const params = type ? { type } : {};
  return api.get('/channels', { params });
};

export const createChannel = (name: string, type: 'text' | 'voice' = 'text') => {
  return api.post('/channels', { name, type });
};

export const getMessages = (channelId: number) => 
  api.get(`/channels/${channelId}/messages`);

export default api;
