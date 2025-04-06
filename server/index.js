const express = require('express');
const WebSocket = require('ws');
const app = express();
const port = 8080;

// Set up a basic HTTP server to serve frontend assets (if needed)
app.get('/', (req, res) => res.send('Signaling server running'));
app.listen(3000, () => {
  console.log('Express server running on http://localhost:3000');
});

// Set up WebSocket for signaling
const wss = new WebSocket.Server({ port: port });

wss.on('connection', (ws) => {
  console.log('New client connected');
  ws.on('message', (message) => {
    // Broadcast signaling message to other peers
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

console.log(`Signaling server running on ws://localhost:${port}`);
