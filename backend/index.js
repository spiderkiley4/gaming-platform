import express from 'express';
import https from 'https';
import cors from 'cors';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';
import { fileURLToPath } from 'url';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';

dotenv.config();

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', true);

// Environment-based CORS configuration
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

// Configure CORS for both Express and Socket.IO
const corsOptions = {
  origin: isDevelopment 
    ? [
        // Development origins - more permissive
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173',
        'http://localhost:8080',
        'http://localhost:19000',
        'http://localhost:19006',
        'http://localhost:8081',
        'http://10.0.2.2:3001',
        'http://10.0.2.2:19000',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:5173',
        'https://localhost:3000',
        'https://localhost:3001',
        'https://localhost:5173',
        'https://localhost:19000',
        'https://localhost:19006',
        'https://localhost:8081',
        'https://10.0.2.2:3001',
        'https://10.0.2.2:19000',
        'capacitor://localhost',
        'app://.',
        'file://',
        'exp://',
        'localhost',
        '127.0.0.1'
      ]
    : [
        // Production origins - more restrictive
        'https://jemcord.mooo.com',
        'http://jemcord.mooo.com',
        'https://www.jemcord.mooo.com',
        'http://www.jemcord.mooo.com',
        'https://47.6.25.173:3001',
        'https://localhost:80',
        'https://localhost:3001',
        'capacitor://localhost',
        'app://.',
        'file://',
        'exp://'
      ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  optionsSuccessStatus: 200,
  preflightContinue: false
};

// In development, allow all origins for debugging
if (isDevelopment) {
  corsOptions.origin = function (origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    // Allow all localhost and development origins
    if (origin.includes('localhost') || 
        origin.includes('127.0.0.1') || 
        origin.includes('10.0.2.2') ||
        origin.startsWith('capacitor://') ||
        origin.startsWith('app://') ||
        origin.startsWith('file://') ||
        origin.startsWith('exp://')) {
      return callback(null, true);
    }
    
    // Allow specific development domains if needed
    callback(null, true);
  };
}

app.use(cors(corsOptions));

// Add additional CORS headers for development
if (isDevelopment) {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });
}

app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept images, videos, and other files
  const allowedImageTypes = /\.(jpg|jpeg|png|gif|webp)$/i;
  const allowedVideoTypes = /\.(mp4|webm|ogg|mov)$/i;
  const allowedFileTypes = /\.(pdf|doc|docx|txt|zip|rar|7z)$/i;

  if (file.originalname.match(allowedImageTypes)) {
    file.fileType = 'image';
    return cb(null, true);
  }
  if (file.originalname.match(allowedVideoTypes)) {
    file.fileType = 'video';
    return cb(null, true);
  }
  if (file.originalname.match(allowedFileTypes)) {
    file.fileType = 'file';
    return cb(null, true);
  }
  cb(new Error('Invalid file type!'), false);
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Serve uploaded files with auth and Range support
// Note: protect direct access to uploads; require JWT via Authorization or query token
app.get('/api/uploads/:filename', (req, res, next) => {
  // Inline auth to support token via header or query param for <img>/<video>
  const header = req.headers['authorization'];
  const bearerToken = header && header.split(' ')[1];
  const queryToken = req.query.token;
  const token = bearerToken || queryToken;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });

    const filePath = path.join(uploadsDir, path.basename(req.params.filename));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(filePath);
    const range = req.headers.range;

    if (range) {
      // Parse Range header: e.g., bytes=start-end
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      if (isNaN(start) || isNaN(end) || start > end || start < 0 || end >= stat.size) {
        return res.status(416).set({ 'Content-Range': `bytes */${stat.size}` }).end();
      }

      const chunkSize = (end - start) + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': getMimeType(filePath)
      });
      const fileStream = fs.createReadStream(filePath, { start, end });
      return fileStream.pipe(res);
    }

    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': getMimeType(filePath),
      'Accept-Ranges': 'bytes'
    });
    const fileStream = fs.createReadStream(filePath);
    return fileStream.pipe(res);
  });
});

// Minimal mime resolver for common types
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.ogg':
      return 'video/ogg';
    case '.mov':
      return 'video/quicktime';
    case '.pdf':
      return 'application/pdf';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.zip':
      return 'application/zip';
    case '.rar':
      return 'application/vnd.rar';
    case '.7z':
      return 'application/x-7z-compressed';
    default:
      return 'application/octet-stream';
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/*
// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../web/dist')));

// Serve index.html for all other routes (SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../web/dist/index.html'));
});
*/

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Authentication required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    console.log('Registration attempt:', { username, email: email ? '***' : 'missing' });
    
    // Validate input
    if (!username || !password || !email) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Normalize username and email to lowercase for consistency
    const normalizedUsername = username.toLowerCase().trim();
    const normalizedEmail = email.toLowerCase().trim();

    // Additional validation
    if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
      return res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(normalizedUsername)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Check if username exists (case-insensitive)
    const usernameExists = await db.query(
      'SELECT id FROM users WHERE LOWER(username) = $1',
      [normalizedUsername]
    );

    console.log('Username check result:', { normalizedUsername, exists: usernameExists.rows.length > 0 });

    if (usernameExists.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Check if email exists (case-insensitive)
    const emailExists = await db.query(
      'SELECT id FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );

    console.log('Email check result:', { normalizedEmail, exists: emailExists.rows.length > 0 });

    if (emailExists.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with normalized username and email
    const result = await db.query(
      'INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id, username, email, avatar_url, created_at',
      [normalizedUsername, hashedPassword, normalizedEmail]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);

    console.log('User registered successfully:', { userId: user.id, username: user.username });
    res.status(201).json({ user, token });
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle specific database constraint violations
    if (error.code === '23505') { // Unique violation
      if (error.constraint === 'users_username_key') {
        return res.status(400).json({ error: 'Username already exists' });
      } else if (error.constraint === 'users_email_key') {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }
    
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Normalize username to lowercase for case-insensitive matching
    const normalizedUsername = username.toLowerCase().trim();

    const result = await db.query(
      'SELECT * FROM users WHERE LOWER(username) = $1',
      [normalizedUsername]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    
    // Remove password from response
    delete user.password;
    res.json({ user, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Protected user routes
app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, email, avatar_url, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const { avatar_url } = req.body;
    
    const result = await db.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id, username, email, avatar_url, created_at',
      [avatar_url, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload avatar endpoint
app.post('/api/upload-avatar', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate file type
    if (!req.file.mimetype.startsWith('image/')) {
      // Delete the invalid file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Only image files are allowed' });
    }

    // --- CRITICAL CHANGE HERE ---
    // Store and use a relative path for the avatar URL
    // Nginx will handle serving '/uploads/filename' from 'https://jemcord.mooo.com'
    const avatarUrl = `/uploads/${req.file.filename}`;

    // Get current user data first
    const currentUser = await db.query(
      'SELECT avatar_url FROM users WHERE id = $1',
      [req.user.id]
    );

    // Update user's avatar_url in database
    const result = await db.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id, username, email, avatar_url, created_at',
      [avatarUrl, req.user.id] // Save the relative path
    );

    // Try to delete old avatar file if it exists
    try {
      const oldAvatarUrl = currentUser.rows[0]?.avatar_url;
      if (oldAvatarUrl) {
        // Extract filename from relative or absolute URL
        const oldFilename = oldAvatarUrl.split('/').pop();
        if (oldFilename) {
          const oldFilePath = path.join(uploadsDir, oldFilename);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
      }
    } catch (deleteError) {
      // Log error but don't fail the request
      console.error('Error deleting old avatar:', deleteError);
    }

    res.json({ avatar_url: avatarUrl });

    // Notify other users about the avatar update with the relative URL
    io.emit('user_status', {
      userId: req.user.id,
      username: result.rows[0].username,
      avatar_url: avatarUrl, // Emit the relative path
      status: 'online'
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to update avatar' });
  }
});;

// Socket.io setup with HTTP/HTTPS server
let server;
if (isDevelopment && fs.existsSync('/home/jeremy/servercert/key.pem') && fs.existsSync('/home/jeremy/servercert/cert.pem')) {
  // Use HTTPS in development if certificates exist
  const httpsOptions = {
    key: fs.readFileSync('/home/jeremy/servercert/key.pem'),
    cert: fs.readFileSync('/home/jeremy/servercert/cert.pem'),
  };
  server = https.createServer(httpsOptions, app);
} else {
  // Use HTTP
  server = createServer(app);
}
const io = new Server(server, {
  path: '/api/socket.io',
  cors: {
    origin: isDevelopment ? true : corsOptions.origin,
    methods: corsOptions.methods,
    credentials: true,
    allowedHeaders: corsOptions.allowedHeaders
  },
  allowEIO3: true,
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 20000,
  maxHttpBufferSize: 1e8,
});

// Prefer explicit PORT, with a sensible default for local development
const PORT = process.env.PORT || 3001;

// Track all users and their status
const userStatus = new Map();
// Track multiple socket connections per user
const userConnections = new Map();

// Socket middleware to authenticate connections
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('Socket auth error:', err);
      return next(new Error('Invalid token'));
    }
    socket.user = decoded;
    next();
  });
});

io.on('connection', async (socket) => {
  console.log('User connected:', socket.user.username, socket.id);
  // Ensure avatar_url is present on the socket user from DB
  try {
    const userRes = await db.query('SELECT avatar_url FROM users WHERE id = $1', [socket.user.id]);
    socket.user.avatar_url = userRes.rows[0]?.avatar_url || null;
  } catch (err) {
    console.error('Error fetching user avatar_url:', err);
    socket.user.avatar_url = null;
  }
  
  // Track this socket connection for the user
  if (!userConnections.has(socket.user.id)) {
    userConnections.set(socket.user.id, new Set());
  }
  userConnections.get(socket.user.id).add(socket.id);
  
  // Add user to tracking with initial presence (only if this is their first connection)
  const isFirstConnection = userConnections.get(socket.user.id).size === 1;
  if (isFirstConnection) {
    userStatus.set(socket.user.id, {
      userId: socket.user.id,
      username: socket.user.username,
      avatar_url: socket.user.avatar_url,
      status: 'online',
      presence: null
    });
    
    // Broadcast user coming online (only for first connection)
    socket.broadcast.emit('user_status', { 
      userId: socket.user.id,
      username: socket.user.username,
      avatar_url: socket.user.avatar_url,
      status: 'online',
      presence: null
    });
  }

  // Handle presence updates
  socket.on('update_presence', ({ presence }) => {
    const currentStatus = userStatus.get(socket.user.id);
    if (currentStatus) {
      currentStatus.presence = presence;
      userStatus.set(socket.user.id, currentStatus);
      
      // Broadcast presence update to all users
      io.emit('user_status', {
        userId: socket.user.id,
        username: socket.user.username,
        avatar_url: socket.user.avatar_url,
        status: currentStatus.status,
        presence
      });
    }
  });

  // Handle request for current users
  socket.on('get_online_users', async () => {
    try {
      const result = await db.query(
        'SELECT id, username, avatar_url FROM users'
      );
      
      const allUsers = result.rows.map(user => {
        const status = userStatus.get(user.id);
        return {
          userId: user.id,
          username: user.username,
          avatar_url: user.avatar_url,
          status: status ? status.status : 'offline'
        };
      });

      socket.emit('online_users', { users: allUsers });
    } catch (error) {
      console.error('Error fetching users:', error);
      socket.emit('error', { message: 'Failed to fetch users' });
    }
  });

  // Provide current voice channel members/counts for a server
  socket.on('get_voice_channel_counts', async ({ serverId }) => {
    try {
      if (!serverId) {
        socket.emit('voice_channel_counts', { serverId: null, counts: {}, members: {} });
        return;
      }

      const channelResult = await db.query(
        "SELECT id FROM server_channels WHERE server_id = $1 AND type = 'voice'",
        [serverId]
      );

      const counts = {};
      const members = {};

      for (const row of channelResult.rows) {
        const voiceRoom = `voice-${row.id}`;
        const room = io.sockets.adapter.rooms.get(voiceRoom);
        const socketsInRoom = room ? Array.from(room) : [];
        counts[row.id] = socketsInRoom.length;
        members[row.id] = socketsInRoom
          .map((sid) => io.sockets.sockets.get(sid))
          .filter((s) => !!s && !!s.user)
          .map((s) => ({
            userId: s.user.id,
            username: s.user.username,
            avatar_url: s.user.avatar_url
          }));
      }

      socket.emit('voice_channel_counts', { serverId, counts, members });
    } catch (error) {
      console.error('Error getting voice channel counts:', error);
      socket.emit('voice_channel_counts', { serverId, counts: {}, members: {} });
    }
  });

  socket.on('join_channel', (channelId) => {
    socket.join(`channel-${channelId}`);
  });

  socket.on('join_server', (serverId) => {
    socket.join(`server-${serverId}`);
  });

  socket.on('send_message', async ({ content, channelId, type = 'text' }) => {
    try {
      const result = await db.query(
        'INSERT INTO messages (content, user_id, channel_id, type) VALUES ($1, $2, $3, $4) RETURNING *',
        [content, socket.user.id, channelId, type]
      );
      
      // Get user info for the message
      const userResult = await db.query(
        'SELECT username, avatar_url FROM users WHERE id = $1',
        [socket.user.id]
      );
      
      const message = {
        ...result.rows[0],
        username: userResult.rows[0].username,
        avatar_url: userResult.rows[0].avatar_url
      };

      io.to(`channel-${channelId}`).emit('new_message', message);
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('send_server_message', async ({ content, serverId, channelId, type = 'text' }) => {
    try {
      // Check if user is member of server
      const memberCheck = await db.query(
        'SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2',
        [serverId, socket.user.id]
      );

      if (memberCheck.rows.length === 0) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      // Check if channel belongs to server
      const channelCheck = await db.query(
        'SELECT 1 FROM server_channels WHERE id = $1 AND server_id = $2',
        [channelId, serverId]
      );

      if (channelCheck.rows.length === 0) {
        socket.emit('error', { message: 'Channel not found' });
        return;
      }

      const result = await db.query(
        'INSERT INTO messages (content, user_id, channel_id, type) VALUES ($1, $2, $3, $4) RETURNING *',
        [content, socket.user.id, channelId, type]
      );
      
      // Get user info for the message
      const userResult = await db.query(
        'SELECT username, avatar_url FROM users WHERE id = $1',
        [socket.user.id]
      );
      
      const message = {
        ...result.rows[0],
        username: userResult.rows[0].username,
        avatar_url: userResult.rows[0].avatar_url
      };

      io.to(`server-${serverId}`).emit('new_server_message', message);
    } catch (error) {
      console.error('Error sending server message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('get_voice_channel_info', ({ channelId }) => {
    console.log(`User ${socket.user.username} (${socket.id}) requesting info for voice channel ${channelId}`);
    const voiceRoom = `voice-${channelId}`;
    
    // Get existing users in the voice room
    const room = io.sockets.adapter.rooms.get(voiceRoom);
    const existingUsers = room ? Array.from(room) : [];
    
    // Get user info for existing users
    const existingUsersWithInfo = existingUsers.map(socketId => {
      const existingSocket = io.sockets.sockets.get(socketId);
      if (existingSocket && existingSocket.user) {
        return {
          socketId: socketId,
          userId: existingSocket.user.id,
          username: existingSocket.user.username,
          avatar_url: existingSocket.user.avatar_url,
          muted: !!existingSocket.voiceMuted
        };
      }
      return { socketId: socketId };
    });
    
    // Send voice channel info back to the requesting user
    socket.emit('voice_channel_info', { 
      channelId,
      users: existingUsersWithInfo,
      count: existingUsers.length
    });
  });

  socket.on('voice_join', ({ channelId }) => {
    console.log(`User ${socket.user.username} (${socket.id}) joining voice channel ${channelId}`);
    const voiceRoom = `voice-${channelId}`;
    
    // Leave all other voice channels first
    const currentRooms = Array.from(socket.rooms);
    currentRooms.forEach(room => {
      if (room.startsWith('voice-') && room !== voiceRoom) {
        console.log(`Leaving previous voice channel: ${room}`);
        socket.leave(room);
        // Notify other users in the previous room that this user left
        socket.to(room).emit('user_left_voice', { 
          socketId: socket.id,
          userId: socket.user.id,
          username: socket.user.username
        });
      }
    });
    
    // Get existing users in the voice room before joining
    const room = io.sockets.adapter.rooms.get(voiceRoom);
    const existingUsers = room ? Array.from(room) : [];
    console.log(`Existing users in channel ${channelId}:`, existingUsers);
    
    // Join the room
    socket.join(voiceRoom);
    
    // Ensure a voice muted flag exists on the socket
    if (typeof socket.voiceMuted !== 'boolean') socket.voiceMuted = false;
    
    // Get user info for existing users
    const existingUsersWithInfo = existingUsers.map(socketId => {
      const existingSocket = io.sockets.sockets.get(socketId);
      if (existingSocket && existingSocket.user) {
        return {
          socketId: socketId,
          userId: existingSocket.user.id,
          username: existingSocket.user.username,
          avatar_url: existingSocket.user.avatar_url,
          muted: !!existingSocket.voiceMuted
        };
      }
      return { socketId: socketId };
    });
    
    // Send existing users to the new user
    socket.emit('voice_users', { 
      users: existingUsersWithInfo
    });
    
    // Notify other users that someone joined
    socket.to(voiceRoom).emit('user_joined_voice', { 
      socketId: socket.id,
      userId: socket.user.id,
      username: socket.user.username,
      avatar_url: socket.user.avatar_url,
      muted: !!socket.voiceMuted
    });

    // Broadcast updated count and members for this channel
    try {
      const roomAfterJoin = io.sockets.adapter.rooms.get(voiceRoom);
      const socketsInRoom = roomAfterJoin ? Array.from(roomAfterJoin) : [];
      const users = socketsInRoom
        .map((sid) => io.sockets.sockets.get(sid))
        .filter((s) => !!s && !!s.user)
        .map((s) => ({ userId: s.user.id, username: s.user.username, avatar_url: s.user.avatar_url }));
      io.emit('voice_channel_count', { channelId, count: socketsInRoom.length, users });
    } catch (err) {
      console.error('Error broadcasting voice join count:', err);
    }
  });
  
  // Broadcast user mute status within a voice room
  socket.on('voice_mute', ({ channelId, muted }) => {
    try {
      const voiceRoom = `voice-${channelId}`;
      socket.voiceMuted = !!muted;
      socket.to(voiceRoom).emit('user_voice_mute', {
        socketId: socket.id,
        userId: socket.user.id,
        muted: !!muted
      });
    } catch (err) {
      console.error('Error handling voice_mute:', err);
    }
  });

  socket.on('voice_leave', ({ channelId }) => {
    console.log(`User ${socket.user.username} (${socket.id}) leaving voice channel ${channelId}`);
    const voiceRoom = `voice-${channelId}`;
    socket.leave(voiceRoom);
    // Notify other users in the room that this user left
    socket.to(voiceRoom).emit('user_left_voice', { 
      socketId: socket.id,
      userId: socket.user.id,
      username: socket.user.username
    });

    // Broadcast updated count and members for this channel
    try {
      const roomAfterLeave = io.sockets.adapter.rooms.get(voiceRoom);
      const socketsInRoom = roomAfterLeave ? Array.from(roomAfterLeave) : [];
      const users = socketsInRoom
        .map((sid) => io.sockets.sockets.get(sid))
        .filter((s) => !!s && !!s.user)
        .map((s) => ({ userId: s.user.id, username: s.user.username, avatar_url: s.user.avatar_url }));
      io.emit('voice_channel_count', { channelId, count: socketsInRoom.length, users });
    } catch (err) {
      console.error('Error broadcasting voice leave count:', err);
    }
  });

  socket.on('voice_offer', ({ offer, to }) => {
    console.log(`Relaying offer from ${socket.id} to ${to}`);
    if (!offer) {
      console.error('Received invalid offer');
      return;
    }
    socket.to(to).emit('voice_offer', { 
      offer,
      from: socket.id 
    });
  });

  socket.on('voice_answer', ({ answer, to }) => {
    console.log(`Relaying answer from ${socket.id} to ${to}`);
    if (!answer) {
      console.error('Received invalid answer');
      return;
    }
    socket.to(to).emit('voice_answer', { 
      answer,
      from: socket.id 
    });
  });

  socket.on('relay_ice_candidate', ({ candidate, to }) => {
    console.log(`Relaying ICE candidate from ${socket.id} to ${to}`);
    if (!candidate) {
      console.error('Received invalid ICE candidate');
      return;
    }
    socket.to(to).emit('relay_ice_candidate', {
      candidate,
      from: socket.id
    });
  });

  // Screen sharing events
  socket.on('screen_share_start', ({ channelId }) => {
    console.log(`User ${socket.user.username} (${socket.id}) started screen sharing in channel ${channelId}`);
    const voiceRoom = `voice-${channelId}`;
    socket.to(voiceRoom).emit('screen_share_start', {
      socketId: socket.id,
      userId: socket.user.id,
      username: socket.user.username
    });
  });

  socket.on('screen_share_stop', ({ channelId }) => {
    console.log(`User ${socket.user.username} (${socket.id}) stopped screen sharing in channel ${channelId}`);
    const voiceRoom = `voice-${channelId}`;
    socket.to(voiceRoom).emit('screen_share_stop', {
      socketId: socket.id,
      userId: socket.user.id,
      username: socket.user.username
    });
  });

  socket.on('disconnecting', () => {
    const rooms = socket.rooms;
    rooms.forEach((room) => {
      if (room.startsWith('voice-')) {
        console.log(`User ${socket.user.username} (${socket.id}) leaving voice room ${room}`);
        socket.to(room).emit('user_left_voice', { 
          socketId: socket.id,
          userId: socket.user.id,
          username: socket.user.username
        });

        // Broadcast updated count and members for this channel on disconnect
        try {
          const channelId = parseInt(room.replace('voice-', ''));
          const roomAfter = io.sockets.adapter.rooms.get(room);
          const socketsInRoom = roomAfter ? Array.from(roomAfter) : [];
          const users = socketsInRoom
            .map((sid) => io.sockets.sockets.get(sid))
            .filter((s) => !!s && !!s.user)
            .map((s) => ({ userId: s.user.id, username: s.user.username, avatar_url: s.user.avatar_url }));
          io.emit('voice_channel_count', { channelId, count: socketsInRoom.length, users });
        } catch (err) {
          console.error('Error broadcasting voice disconnect count:', err);
        }
      }
    });
  });

  socket.on('disconnect', (reason) => {
    console.log('User disconnected:', socket.user.username, 'Reason:', reason);
    
    // Remove this socket connection from the user's connections
    if (userConnections.has(socket.user.id)) {
      userConnections.get(socket.user.id).delete(socket.id);
      
      // If this was the last connection, set user to offline
      if (userConnections.get(socket.user.id).size === 0) {
        userConnections.delete(socket.user.id);
        
        // Update user status to offline
        userStatus.set(socket.user.id, {
          userId: socket.user.id,
          username: socket.user.username,
          avatar_url: socket.user.avatar_url,
          status: 'offline'
        });
        
        // Broadcast user going offline
        io.emit('user_status', { 
          userId: socket.user.id, 
          username: socket.user.username,
          avatar_url: socket.user.avatar_url,
          status: 'offline' 
        });
      }
    }
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Server routes
app.get('/api/servers', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.*, sm.nickname, u.username as owner_username 
       FROM servers s 
       LEFT JOIN server_members sm ON s.id = sm.server_id AND sm.user_id = $1
       LEFT JOIN users u ON s.owner_id = u.id
       WHERE s.owner_id = $1 OR EXISTS (
         SELECT 1 FROM server_members WHERE server_id = s.id AND user_id = $1
       )
       ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching servers:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/servers', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Server name is required' });
    }

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ error: 'Server name must be between 2 and 100 characters' });
    }

    // Create server
    const serverResult = await db.query(
      'INSERT INTO servers (name, description, owner_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description || null, req.user.id]
    );
    
    const server = serverResult.rows[0];

    // Add owner as member
    await db.query(
      'INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)',
      [server.id, req.user.id]
    );

    // Create default roles
    await db.query(
      'INSERT INTO server_roles (server_id, name, color, permissions, position) VALUES ($1, $2, $3, $4, $5)',
      [server.id, '@everyone', '#99AAB5', 0, 0]
    );

    await db.query(
      'INSERT INTO server_roles (server_id, name, color, permissions, position) VALUES ($1, $2, $3, $4, $5)',
      [server.id, 'Admin', '#FF0000', 2147483647, 1] // All permissions
    );

    // Create default channels
    await db.query(
      'INSERT INTO server_channels (server_id, name, type, position) VALUES ($1, $2, $3, $4)',
      [server.id, 'general', 'text', 0]
    );

    await db.query(
      'INSERT INTO server_channels (server_id, name, type, position) VALUES ($1, $2, $3, $4)',
      [server.id, 'General', 'voice', 1]
    );

    // Emit new server event
    io.emit('new_server', server);
    
    res.status(201).json(server);
  } catch (error) {
    console.error('Error creating server:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create invite endpoint
app.post('/api/servers/:id/invites', authenticateToken, async (req, res) => {
  try {
    const serverId = parseInt(req.params.id);
    const { max_uses, expires_in } = req.body || {}; // expires_in in seconds

    // Only owner can create invites
    const serverCheck = await db.query('SELECT owner_id FROM servers WHERE id = $1', [serverId]);
    if (serverCheck.rows.length === 0) return res.status(404).json({ error: 'Server not found' });
    if (serverCheck.rows[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Only the server owner can create invites' });

    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const generateCode = (len = 8) => Array.from({ length: len }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    let code = generateCode();
    // Ensure uniqueness (simple retry loop)
    for (let i = 0; i < 5; i++) {
      const exists = await db.query('SELECT 1 FROM server_invites WHERE code = $1', [code]);
      if (exists.rows.length === 0) break;
      code = generateCode();
    }

    const expiresAt = expires_in ? new Date(Date.now() + (parseInt(expires_in) * 1000)) : null;
    const result = await db.query(
      'INSERT INTO server_invites (server_id, code, max_uses, expires_at, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [serverId, code, max_uses ?? null, expiresAt, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating invite:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Join via invite code
app.post('/api/invites/:code/join', authenticateToken, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const inviteRes = await db.query('SELECT * FROM server_invites WHERE code = $1', [code]);
    if (inviteRes.rows.length === 0) return res.status(404).json({ error: 'Invite not found' });
    const invite = inviteRes.rows[0];

    // Validate expiration and uses
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Invite expired' });
    }
    if (invite.max_uses && invite.uses >= invite.max_uses) {
      return res.status(409).json({ error: 'Invite exhausted' });
    }

    // Add user as member if not already
    const exists = await db.query(
      'SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2',
      [invite.server_id, req.user.id]
    );
    if (exists.rows.length === 0) {
      await db.query('INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)', [invite.server_id, req.user.id]);
    }

    // Increment uses
    await db.query('UPDATE server_invites SET uses = uses + 1 WHERE id = $1', [invite.id]);

    // Return the server info
    const server = await db.query('SELECT * FROM servers WHERE id = $1', [invite.server_id]);
    res.json(server.rows[0]);
  } catch (error) {
    console.error('Error joining via invite:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// List invites for a server
app.get('/api/servers/:id/invites', authenticateToken, async (req, res) => {
  try {
    const serverId = parseInt(req.params.id);

    // Only owner can list invites
    const serverCheck = await db.query('SELECT owner_id FROM servers WHERE id = $1', [serverId]);
    if (serverCheck.rows.length === 0) return res.status(404).json({ error: 'Server not found' });
    if (serverCheck.rows[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Only the server owner can view invites' });

    const result = await db.query(
      'SELECT * FROM server_invites WHERE server_id = $1 ORDER BY created_at DESC',
      [serverId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing invites:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete an invite
app.delete('/api/servers/:id/invites/:inviteId', authenticateToken, async (req, res) => {
  try {
    const serverId = parseInt(req.params.id);
    const inviteId = parseInt(req.params.inviteId);

    // Only owner can delete invites
    const serverCheck = await db.query('SELECT owner_id FROM servers WHERE id = $1', [serverId]);
    if (serverCheck.rows.length === 0) return res.status(404).json({ error: 'Server not found' });
    if (serverCheck.rows[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Only the server owner can delete invites' });

    // Check if invite exists and belongs to this server
    const inviteCheck = await db.query(
      'SELECT id FROM server_invites WHERE id = $1 AND server_id = $2',
      [inviteId, serverId]
    );
    if (inviteCheck.rows.length === 0) return res.status(404).json({ error: 'Invite not found' });

    await db.query('DELETE FROM server_invites WHERE id = $1', [inviteId]);
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting invite:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/servers/:id', authenticateToken, async (req, res) => {
  try {
    const serverId = req.params.id;
    
    // Check if user is member of server
    const memberCheck = await db.query(
      'SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2',
      [serverId, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(
      `SELECT s.*, u.username as owner_username 
       FROM servers s 
       LEFT JOIN users u ON s.owner_id = u.id
       WHERE s.id = $1`,
      [serverId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Server not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching server:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/servers/:id/members', authenticateToken, async (req, res) => {
  try {
    const serverId = req.params.id;
    
    // Check if user is member of server
    const memberCheck = await db.query(
      'SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2',
      [serverId, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(
      `SELECT sm.*, u.username, u.avatar_url, u.created_at as user_created_at,
              array_agg(sr.name) as roles
       FROM server_members sm
       LEFT JOIN users u ON sm.user_id = u.id
       LEFT JOIN server_member_roles smr ON sm.id = smr.member_id
       LEFT JOIN server_roles sr ON smr.role_id = sr.id
       WHERE sm.server_id = $1
       GROUP BY sm.id, u.username, u.avatar_url, u.created_at
       ORDER BY sm.joined_at ASC`,
      [serverId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching server members:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/servers/:id/channels', authenticateToken, async (req, res) => {
  try {
    const serverId = req.params.id;
    const type = req.query.type; // Optional type filter
    
    // Check if user is member of server
    const memberCheck = await db.query(
      'SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2',
      [serverId, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let query = 'SELECT * FROM server_channels WHERE server_id = $1';
    const params = [serverId];

    if (type) {
      query += ' AND type = $2';
      params.push(type);
    }

    query += ' ORDER BY position ASC, created_at ASC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching server channels:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/servers/:id/channels', authenticateToken, async (req, res) => {
  try {
    const serverId = req.params.id;
    const { name, type } = req.body;
    
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Channel name is required' });
    }
    
    if (!type || !['text', 'voice'].includes(type)) {
      return res.status(400).json({ error: 'Invalid channel type. Must be "text" or "voice"' });
    }

    // Check if user is owner or has admin permissions
    const serverCheck = await db.query(
      'SELECT owner_id FROM servers WHERE id = $1',
      [serverId]
    );

    if (serverCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (serverCheck.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only server owner can create channels' });
    }

    // Get next position
    const positionResult = await db.query(
      'SELECT COALESCE(MAX(position), -1) + 1 as next_position FROM server_channels WHERE server_id = $1',
      [serverId]
    );
    const nextPosition = positionResult.rows[0].next_position;

    const result = await db.query(
      'INSERT INTO server_channels (server_id, name, type, position) VALUES ($1, $2, $3, $4) RETURNING *',
      [serverId, name, type, nextPosition]
    );
    
    const channel = result.rows[0];

    // Emit new channel event to server members
    io.to(`server-${serverId}`).emit('new_server_channel', channel);
    
    res.status(201).json(channel);
  } catch (error) {
    console.error('Error creating server channel:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Legacy channel routes for backward compatibility
app.get('/api/channels', async (req, res) => {
  const type = req.query.type; // Optional type filter
  let query = 'SELECT * FROM channels';
  const params = [];

  if (type) {
    query += ' WHERE type = $1';
    params.push(type);
  }

  const result = await db.query(query, params);
  res.json(result.rows);
});

app.post('/api/channels', async (req, res) => {
  const { name, type } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Invalid name' });
  }
  if (!type || !['text', 'voice'].includes(type)) {
    return res.status(400).json({ error: 'Invalid channel type. Must be "text" or "voice"' });
  }

  const result = await db.query(
    'INSERT INTO channels (name, type) VALUES ($1, $2) RETURNING *',
    [name, type]
  );
  const channel = result.rows[0];

  io.emit('new_channel', channel);
  res.json(channel);
});

app.get('/api/channels/:id/messages', async (req, res) => {
  const result = await db.query(
    `SELECT m.*, u.username, u.avatar_url 
     FROM messages m 
     LEFT JOIN users u ON m.user_id = u.id 
     WHERE m.channel_id = $1 
     ORDER BY m.created_at ASC`,
    [req.params.id]
  );
  res.json(result.rows);
});

// Server channel messages endpoint
app.get('/api/servers/:serverId/channels/:channelId/messages', authenticateToken, async (req, res) => {
  try {
    const { serverId, channelId } = req.params;
    
    // Check if user is member of server
    const memberCheck = await db.query(
      'SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2',
      [serverId, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if channel belongs to server
    const channelCheck = await db.query(
      'SELECT 1 FROM server_channels WHERE id = $1 AND server_id = $2',
      [channelId, serverId]
    );

    if (channelCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const result = await db.query(
      `SELECT m.*, u.username, u.avatar_url 
       FROM messages m 
       LEFT JOIN users u ON m.user_id = u.id 
       WHERE m.channel_id = $1 
       ORDER BY m.created_at ASC`,
      [channelId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching server channel messages:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// File upload endpoint
app.post('/api/upload-file', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { channelId, serverId } = req.body;
    if (!channelId) {
      // Delete the uploaded file if channelId is missing
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Channel ID is required' });
    }

    // If serverId is provided, validate that user is member of server and channel belongs to server
    if (serverId) {
      const memberCheck = await db.query(
        'SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2',
        [serverId, req.user.id]
      );

      if (memberCheck.rows.length === 0) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ error: 'Access denied' });
      }

      const channelCheck = await db.query(
        'SELECT 1 FROM server_channels WHERE id = $1 AND server_id = $2',
        [channelId, serverId]
      );

      if (channelCheck.rows.length === 0) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Channel not found' });
      }
    }

    // Get the URL for the uploaded file - ensure proper protocol
    const protocol = (req.headers['x-forwarded-proto'] === 'https' || req.secure) ? 'https' : 'http';
    const fileUrl = `/uploads/${req.file.filename}`;

    // Insert the message with appropriate type
    const messageResult = await db.query(
      'INSERT INTO messages (content, user_id, channel_id, type) VALUES ($1, $2, $3, $4) RETURNING *',
      [fileUrl, req.user.id, channelId, req.file.fileType]
    );

    // Insert file metadata
    await db.query(
      'INSERT INTO media_files (message_id, url, filename, mime_type, size, file_type) VALUES ($1, $2, $3, $4, $5, $6)',
      [messageResult.rows[0].id, fileUrl, req.file.filename, req.file.mimetype, req.file.size, req.file.fileType]
    );

    // Get user info for the message
    const userResult = await db.query(
      'SELECT username, avatar_url FROM users WHERE id = $1',
      [req.user.id]
    );

    const message = {
      ...messageResult.rows[0],
      username: userResult.rows[0].username,
      avatar_url: userResult.rows[0].avatar_url
    };

    // Emit the new message to all users in the channel or server
    if (serverId) {
      io.to(`server-${serverId}`).emit('new_server_message', message);
    } else {
      io.to(`channel-${channelId}`).emit('new_message', message);
    }

    // Only send success status, no need to send the message again since it will come through socket
    res.json({ success: true });
  } catch (error) {
    console.error('Error uploading file:', error);
    // Delete the uploaded file if there was an error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'server works!' });
});

server.listen(PORT, '0.0.0.0', () => {
  const protocol = isDevelopment && fs.existsSync('/home/jeremy/servercert/key.pem') ? 'https' : 'http';
  console.log(`Server listening on ${protocol}://localhost:${PORT} on all interfaces`);
});
