import axios from 'axios';

export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? 'https://jemcord.mooo.com' : 'http://localhost:3001');

// Create axios instance with auth header interceptor
const api = axios.create({
  baseURL: API_URL
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth endpoints
export const register = (username, email, password) => 
  api.post('/api/auth/register', { username, email, password });

export const login = (username, password) => 
  api.post('/api/auth/login', { username, password });

export const getCurrentUser = () => 
  api.get('/api/users/me');

export const updateProfile = (data) => 
  api.patch('/api/users/me', data);

// Channel endpoints
export const getChannels = (type) => {
  const params = type ? { type } : {};
  return api.get('/api/channels', { params });
};

export const createChannel = (name, type = 'text') => {
  return api.post('/api/channels', { name, type });
};

export const getMessages = (channelId) => 
  api.get(`/api/channels/${channelId}/messages`);

// Server-related API functions
export const getServers = () => 
  api.get('/api/servers');

export const createServer = (name, description) => 
  api.post('/api/servers', { name, description });

export const getServer = (serverId) => 
  api.get(`/api/servers/${serverId}`);

export const getServerMembers = (serverId) => 
  api.get(`/api/servers/${serverId}/members`);

export const getServerChannels = (serverId, type) => {
  const params = type ? { type } : {};
  return api.get(`/api/servers/${serverId}/channels`, { params });
};

export const createServerChannel = (serverId, name, type) => 
  api.post(`/api/servers/${serverId}/channels`, { name, type });

export const getServerChannelMessages = (serverId, channelId) => 
  api.get(`/api/servers/${serverId}/channels/${channelId}/messages`);

export default api;
