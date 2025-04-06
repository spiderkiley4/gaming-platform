import axios from 'axios';

export const API_URL = 'http://<your-local-ip>:3001'; // e.g. http://192.168.1.42:3001

export const getChannels = () => axios.get(`${API_URL}/channels`);
export const getMessages = (channelId: number) =>
  axios.get(`${API_URL}/channels/${channelId}/messages`);
