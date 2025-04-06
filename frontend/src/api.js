import axios from 'axios';
export const API_URL = 'http://localhost:3001';

export const getChannels = () => axios.get(`${API_URL}/channels`);
export const getMessages = (channelId) => axios.get(`${API_URL}/channels/${channelId}/messages`);
