import axios from 'axios';

export const API_URL = 'https://47.6.25.173:3001';

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
  api.post('/auth/register', { username, email, password });

export const login = (username, password) => 
  api.post('/auth/login', { username, password });

export const getCurrentUser = () => 
  api.get('/users/me');

export const updateProfile = (data) => 
  api.patch('/users/me', data);

// Channel endpoints
export const getChannels = (type) => {
  const params = type ? { type } : {};
  return api.get('/channels', { params });
};

export const createChannel = (name, type = 'text') => {
  return api.post('/channels', { name, type });
};

export const getMessages = (channelId) => 
  api.get(`/channels/${channelId}/messages`);

export default api;
