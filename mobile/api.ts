import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Use localhost for development
export const API_URL = __DEV__ 
  ? 'http://localhost:3001'
  : 'http://192.168.1.60:3001';  // Production URL should be updated

// Create axios instance with auth header interceptor
const api = axios.create({
  baseURL: API_URL
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
