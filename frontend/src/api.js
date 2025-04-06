import axios from 'axios';

export const API_URL = 'http://localhost:3001';

// Existing API calls
export const getChannels = () => axios.get(`${API_URL}/channels`);
export const getMessages = (channelId) => axios.get(`${API_URL}/channels/${channelId}/messages`);

// New API call for creating a channel
export const createChannel = (name) => {
  return axios.post(`${API_URL}/channels`, { name });
};
