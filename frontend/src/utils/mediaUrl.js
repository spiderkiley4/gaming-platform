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

// Generic resolver for any media or file URLs coming from messages
export const resolveMediaUrl = (url) => {
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
  return `${base}${path}`;
};


