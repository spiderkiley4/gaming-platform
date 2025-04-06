import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import db from './db.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: 'http://localhost:5173', methods: ['GET', 'POST'] }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_channel', (channelId) => {
    socket.join(`channel-${channelId}`);
  });

  socket.on('send_message', async ({ content, userId, channelId }) => {
    const result = await db.query(
      'INSERT INTO messages (content, user_id, channel_id) VALUES ($1, $2, $3) RETURNING *',
      [content, userId, channelId]
    );
    const message = result.rows[0];
    io.to(`channel-${channelId}`).emit('new_message', message);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

app.get('/channels', async (req, res) => {
  const result = await db.query('SELECT * FROM channels');
  res.json(result.rows);
});

app.post('/channels', async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Invalid name' });
  }

  const result = await db.query(
    'INSERT INTO channels (name) VALUES ($1) RETURNING *',
    [name]
  );
  const channel = result.rows[0];

  io.emit('new_channel', channel); // 🧠 Notify all clients
  res.json(channel);
});


app.get('/channels/:id/messages', async (req, res) => {
  const result = await db.query(
    'SELECT * FROM messages WHERE channel_id = $1 ORDER BY created_at ASC',
    [req.params.id]
  );
  res.json(result.rows);
});

server.listen(process.env.PORT, () => {
  console.log(`Server listening on port ${process.env.PORT}`);
});
