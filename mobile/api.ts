import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Use localhost for iOS simulator, actual IP for physical devices
export const API_URL = Platform.OS === 'ios' 
  ? 'http://47.6.25.173:3001'  
  : 'http://47.6.25.173:3001'; // Update this IP to match your computer's local IP

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
