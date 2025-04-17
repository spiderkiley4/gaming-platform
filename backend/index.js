import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-production-domain.com'] // Replace with your actual production domain
    : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001', 'http://10.102.128.82:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

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

// Socket.io setup with authentication
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: process.env.NODE_ENV === 'production'
      ? ['https://your-production-domain.com'] // Replace with your actual production domain
      : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001', 'http://10.102.128.82:5173', "http://10.100.243.108:5173"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket']
});

// Socket middleware to authenticate connections
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Invalid token'));
    socket.user = decoded;
    next();
  });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.user.username);

  socket.on('join_channel', (channelId) => {
    socket.join(`channel-${channelId}`);
  });

  socket.on('send_message', async ({ content, channelId }) => {
    try {
      const result = await db.query(
        'INSERT INTO messages (content, user_id, channel_id) VALUES ($1, $2, $3) RETURNING *',
        [content, socket.user.id, channelId]
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

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
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

server.listen(process.env.PORT, () => {
  console.log(`Server listening on port ${process.env.PORT}`);
});
