import axios from 'axios';

// Determine the API URL based on the environment
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Add retry logic
api.interceptors.response.use(undefined, async (error) => {
  console.log('[API] Response interceptor - error:', {
    url: error.config?.url,
    status: error.response?.status,
    message: error.message,
    data: error.response?.data
  });
  
  if (error.code === 'ECONNABORTED' || !error.response) {
    const retries = error.config._retry || 0;
    if (retries < 2) {
      error.config._retry = retries + 1;
      return api(error.config);
    }
  }
  return Promise.reject(error);
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  console.log('[API] Request interceptor - token from localStorage:', token ? 'Present' : 'Missing');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    console.log('[API] Authorization header set for:', config.url);
  } else {
    console.log('[API] No token found for request:', config.url);
  }
  return config;
});

export const login = (username: string, password: string) => {
  return api.post('/api/auth/login', { username, password });
};

export const register = (username: string, email: string, password: string) => {
  return api.post('/api/auth/register', { username, email, password });
};

export const getCurrentUser = () => {
  return api.get('/api/users/me');
};

export const fetchData = (endpoint: string) => {
  return api.get(endpoint);
};

export const postData = (endpoint: string, data: any) => {
  return api.post(endpoint, data);
};

export const putData = (endpoint: string, data: any) => {
  return api.put(endpoint, data);
};

export const deleteData = (endpoint: string) => {
  return api.delete(endpoint);
};

// Server-related API functions
export const getServers = () => {
  return api.get('/api/servers');
};

export const createServer = (name: string, description?: string) => {
  return api.post('/api/servers', { name, description });
};

export const getServer = (serverId: number) => {
  return api.get(`/api/servers/${serverId}`);
};

export const getServerMembers = (serverId: number) => {
  return api.get(`/api/servers/${serverId}/members`);
};

export const getServerChannels = (serverId: number, type?: string) => {
  const params = type ? { type } : {};
  return api.get(`/api/servers/${serverId}/channels`, { params });
};

export const createServerChannel = (serverId: number, name: string, type: 'text' | 'voice') => {
  return api.post(`/api/servers/${serverId}/channels`, { name, type });
};

export const getServerChannelMessages = (serverId: number, channelId: number) => {
  return api.get(`/api/servers/${serverId}/channels/${channelId}/messages`);
};

// Legacy channel functions for backward compatibility
export const getChannels = (type?: string) => {
  const params = type ? { type } : {};
  return api.get('/api/channels', { params });
};

export const createChannel = (name: string, type: 'text' | 'voice') => {
  return api.post('/api/channels', { name, type });
};

export const getChannelMessages = (channelId: number) => {
  return api.get(`/api/channels/${channelId}/messages`);
};

export { API_URL };