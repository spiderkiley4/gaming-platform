import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Use consistent API URL across all platforms
export const API_URL = 'https://jemcord.mooo.com';

// Create axios instance with auth header interceptor
const api = axios.create({
  baseURL: API_URL,
  timeout: 20000, // Increased timeout
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add retry logic with exponential backoff and auth error handling
api.interceptors.response.use(undefined, async (error) => {
  // Handle authentication errors
  if (error.response?.status === 401) {
    console.log('[API] Authentication error - clearing token');
    await AsyncStorage.removeItem('token');
    // Don't retry auth errors
    return Promise.reject(error);
  }
  
  // Handle network errors with retry
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
  api.post('/api/auth/register', { username, email, password });

export const login = (username: string, password: string) => 
  api.post('/api/auth/login', { username, password });

export const getCurrentUser = () => 
  api.get('/api/users/me');

export const updateProfile = (data: { avatar_url?: string }) => 
  api.patch('/api/users/me', data);

// Channel endpoints
export const getChannels = (type?: 'text' | 'voice') => {
  const params = type ? { type } : {};
  return api.get('/api/channels', { params });
};

export const createChannel = (name: string, type: 'text' | 'voice' = 'text') => {
  return api.post('/api/channels', { name, type });
};

export const getMessages = (channelId: number) => 
  api.get(`/api/channels/${channelId}/messages`);

// Server-related API functions
export const getServers = () => 
  api.get('/api/servers');

export const createServer = (name: string, description?: string) => 
  api.post('/api/servers', { name, description });

export const getServer = (serverId: number) => 
  api.get(`/api/servers/${serverId}`);

export const getServerMembers = (serverId: number) => 
  api.get(`/api/servers/${serverId}/members`);

export const getServerChannels = (serverId: number, type?: 'text' | 'voice') => {
  const params = type ? { type } : {};
  return api.get(`/api/servers/${serverId}/channels`, { params });
};

export const createServerChannel = (serverId: number, name: string, type: 'text' | 'voice') => 
  api.post(`/api/servers/${serverId}/channels`, { name, type });

export const getServerChannelMessages = (serverId: number, channelId: number) => 
  api.get(`/api/servers/${serverId}/channels/${channelId}/messages`);

export const createServerInvite = (serverId: number, options?: { max_uses?: number; expires_in?: number }) => 
  api.post(`/api/servers/${serverId}/invites`, options);

export const joinServerByInvite = (inviteCode: string) => 
  api.post('/api/servers/join', { invite_code: inviteCode });

export default api;