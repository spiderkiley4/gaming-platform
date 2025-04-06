import axios from 'axios';

export const API_URL = 'http://192.168.1.60:3001';

// Existing API calls
export const getChannels = () => axios.get(`${API_URL}/channels`);
export const getMessages = (channelId: number) => axios.get(`${API_URL}/channels/${channelId}/messages`);

// New API call for creating a channel
export const createChannel = (name: string) => {
  return axios.post(`${API_URL}/channels`, { name });
};
