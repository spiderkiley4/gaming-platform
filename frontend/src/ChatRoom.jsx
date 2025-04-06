import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { getMessages } from './api';

const socket = io('http://localhost:3001');

export default function ChatRoom({ channelId, userId }) {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');

  useEffect(() => {
    socket.emit('join_channel', channelId);
    getMessages(channelId).then(res => setMessages(res.data));

    socket.on('new_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => socket.off('new_message');
  }, [channelId]);

  const sendMessage = () => {
    if (messageInput.trim()) {
      socket.emit('send_message', {
        content: messageInput,
        userId,
        channelId
      });
      setMessageInput('');
    }
  };

  return (
    <div>
      <div style={{ height: 300, overflowY: 'scroll' }}>
        {messages.map((m) => (
          <div key={m.id}>{m.content}</div>
        ))}
      </div>
      <input
        value={messageInput}
        onChange={(e) => setMessageInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
}
