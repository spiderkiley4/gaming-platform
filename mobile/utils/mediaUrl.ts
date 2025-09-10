import { API_URL } from '@/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Cache for token to avoid repeated async calls
let tokenCache: string | null = null;
let tokenPromise: Promise<string | null> | null = null;

// Initialize token cache
const initializeToken = async (): Promise<string | null> => {
  if (tokenCache !== null) return tokenCache;
  if (tokenPromise) return tokenPromise;
  
  tokenPromise = AsyncStorage.getItem('token').then(token => {
    tokenCache = token;
    return token;
  });
  
  return tokenPromise;
};

export const resolveAvatarUrl = async (url: string): Promise<string> => {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const base = (API_URL || '').replace(/\/$/, '');
  let path = url.startsWith('/') ? url : `/${url}`;
  if (path.startsWith('/api/uploads')) {
    // already correct
  } else if (path.startsWith('/uploads')) {
    path = `/api${path}`;
  } else {
    // Assume avatars are stored under uploads if not specified
    path = `/api/uploads${path}`;
  }
  return appendToken(`${base}${path}`);
};

// Generic resolver for any media or file URLs coming from messages
export const resolveMediaUrl = async (url: string): Promise<string> => {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const base = (API_URL || '').replace(/\/$/, '');
  let path = url;
  // Normalize to string without surrounding whitespace
  path = String(path).trim();
  // If it's a bare filename like "123.webp", ensure it becomes /api/uploads/123.webp
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  if (path.startsWith('/api/uploads')) {
    // already correct
  } else if (path.startsWith('/uploads')) {
    path = `/api${path}`;
  } else {
    // Any other relative path should be treated as an upload
    path = `/api/uploads${path}`;
  }
  return appendToken(`${base}${path}`);
};

// Append JWT token to uploads URLs so images can be authorized
async function appendToken(url: string): Promise<string> {
  try {
    const token = await initializeToken();
    if (!token) return url;
    
    // For React Native, we'll append the token as a query parameter
    if (url.includes('token=')) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  } catch (_) {
    return url;
  }
}
