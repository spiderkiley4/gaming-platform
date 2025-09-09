import { API_URL } from '../api/index';

export const resolveAvatarUrl = (url) => {
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
  return `${base}${path}`;
};


