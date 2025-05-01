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

const app = express();
app.set('trust proxy', true);

app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] === 'https') {
    req.secure = true;
  }
  next();
});

// Configure CORS for both Express and Socket.IO
const corsOptions = {
  origin: [
    'https://jemcord.mooo.com',
    'http://jemcord.mooo.com',
    'https://www.jemcord.mooo.com',
    'http://www.jemcord.mooo.com',
    'https://47.6.25.173:3001',     // Production web
    'https://localhost:80',         // Production web
    'https://localhost:3001',        // Development web
    'https://localhost:19000',       // Expo development
    'https://localhost:19006',       // Expo web
    'https://localhost:8081',        // React Native packager
    'https://10.0.2.2:3001',        // Android emulator
    'https://10.0.2.2:19000',       // Android Expo
    'capacitor://localhost',        // Mobile app
    'https://localhost',             // Local electron
    'app://.',                      // Electron app
    'file://',                     // Electron local files
    'exp://',                      // Expo Go app
    'localhost'                     // Generic localhost
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  optionsSuccessStatus: 200,
  preflightContinue: false
};

//app.use(cors(corsOptions));

// Add CORS headers to all responses
/*app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (corsOptions.origin.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Methods', corsOptions.methods.join(','));
    res.header('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(','));
  }
  next();
});*/

app.use(express.json());

// Trust first proxy for secure connection detection
app.set('trust proxy', 1);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
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

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/*
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    // Validate input
    if (!username || !password || !email) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user exists
    const userExists = await db.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await db.query(
      'INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id, username, email, avatar_url, created_at',
      [username, hashedPassword, email]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);

    res.status(201).json({ user, token });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await db.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
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
app.get('/users/me', authenticateToken, async (req, res) => {
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

app.patch('/users/me', authenticateToken, async (req, res) => {
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
app.post('/upload-avatar', authenticateToken, upload.single('file'), async (req, res) => {
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

    // Get the URL for the uploaded file - ensure proper protocol
    const protocol = (req.headers['x-forwarded-proto'] === 'https' || req.secure) ? 'https' : 'http';
    const avatarUrl = `${protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    // Get current user data first
    const currentUser = await db.query(
      'SELECT avatar_url FROM users WHERE id = $1',
      [req.user.id]
    );

    // Update user's avatar_url in database
    const result = await db.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id, username, email, avatar_url, created_at',
      [avatarUrl, req.user.id]
    );

    // Try to delete old avatar file if it exists
    try {
      const oldAvatarUrl = currentUser.rows[0]?.avatar_url;
      if (oldAvatarUrl) {
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

    // Notify other users about the avatar update
    io.emit('user_status', {
      userId: req.user.id,
      username: result.rows[0].username,
      avatar_url: avatarUrl,
      status: 'online'
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to update avatar' });
  }
});

// Socket.io setup with HTTP server
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
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

// Track all users and their status
const userStatus = new Map();

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

io.on('connection', (socket) => {
  console.log('User connected:', socket.user.username, socket.id);
  
  // Add user to tracking with initial presence
  userStatus.set(socket.user.id, {
    userId: socket.user.id,
    username: socket.user.username,
    avatar_url: socket.user.avatar_url,
    status: 'online',
    presence: null
  });
  
  // Track user connection
  socket.broadcast.emit('user_status', { 
    userId: socket.user.id,
    username: socket.user.username,
    avatar_url: socket.user.avatar_url,
    status: 'online',
    presence: null
  });

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

  socket.on('join_channel', (channelId) => {
    socket.join(`channel-${channelId}`);
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

  socket.on('voice_join', ({ channelId }) => {
    console.log(`User ${socket.id} joining voice channel ${channelId}`);
    const voiceRoom = `voice-${channelId}`;
    
    // Get existing users in the voice room before joining
    const room = io.sockets.adapter.rooms.get(voiceRoom);
    const existingUsers = room ? Array.from(room) : [];
    console.log(`Existing users in channel ${channelId}:`, existingUsers);
    
    // Join the room
    socket.join(voiceRoom);
    
    // Send existing users to the new user
    socket.emit('voice_users', { 
      users: existingUsers
    });
    
    // Notify other users that someone joined
    socket.to(voiceRoom).emit('user_joined_voice', { 
      userId: socket.id
    });
  });

  socket.on('voice_leave', ({ channelId }) => {
    console.log(`User ${socket.id} leaving voice channel ${channelId}`);
    const voiceRoom = `voice-${channelId}`;
    socket.leave(voiceRoom);
    // Notify other users in the room that this user left
    socket.to(voiceRoom).emit('user_left_voice', { userId: socket.id });
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

  socket.on('disconnecting', () => {
    const rooms = socket.rooms;
    rooms.forEach((room) => {
      if (room.startsWith('voice-')) {
        console.log(`User ${socket.id} leaving voice room ${room}`);
        socket.to(room).emit('user_left_voice', { userId: socket.id });
      }
    });
  });

  socket.on('disconnect', (reason) => {
    console.log('User disconnected:', socket.user.username, 'Reason:', reason);
    
    // Update user status to offline
    userStatus.set(socket.user.id, {
      userId: socket.user.id,
      username: socket.user.username,
      avatar_url: socket.user.avatar_url,
      status: 'offline'
    });
    
    io.emit('user_status', { 
      userId: socket.user.id, 
      username: socket.user.username,
      avatar_url: socket.user.avatar_url,
      status: 'offline' 
    });
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

app.get('/channels', async (req, res) => {
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

app.post('/channels', async (req, res) => {
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

app.get('/channels/:id/messages', async (req, res) => {
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

// File upload endpoint
app.post('/upload-file', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { channelId } = req.body;
    if (!channelId) {
      // Delete the uploaded file if channelId is missing
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Channel ID is required' });
    }

    // Get the URL for the uploaded file - ensure proper protocol
    const protocol = (req.headers['x-forwarded-proto'] === 'https' || req.secure) ? 'https' : 'http';
    const fileUrl = `${protocol}://${req.get('host')}/uploads/${req.file.filename}`;

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

    // Emit the new message to all users in the channel
    io.to(`channel-${channelId}`).emit('new_message', message);

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

server.listen(process.env.PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${process.env.PORT} on all interfaces`);
});
