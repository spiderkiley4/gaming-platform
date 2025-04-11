import axios from 'axios';

// Determine the API URL based on the environment
const API_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:3000'
  : 'https://your-production-api.com';

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
  if (error.code === 'ECONNABORTED' || !error.response) {
    const retries = error.config._retry || 0;
    if (retries < 2) {
      error.config._retry = retries + 1;
      return api(error.config);
    }
  }
  return Promise.reject(error);
});

export const login = (username: string, password: string) => {
  return api.post('/auth/login', { username, password });
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