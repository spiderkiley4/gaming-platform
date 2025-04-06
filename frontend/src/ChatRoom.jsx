import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { getMessages } from './api';
import { useVoiceChat } from './hooks/useVoiceChat';

const socket = io('http://localhost:3001');

export default function ChatRoom({ channelId, userId }) {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef(null);
  const { isMuted, peers, startVoiceChat, toggleMute } = useVoiceChat(channelId, socket);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    socket.emit('join_channel', channelId);
    getMessages(channelId).then(res => {
      setMessages(res.data);
    });

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
    <div className="flex flex-col bg-gray-800 p-4 rounded-lg">
      {/* Voice Chat Controls */}
      <div className="flex items-center gap-4 mb-4 p-2 bg-gray-700 rounded">
        <button
          onClick={startVoiceChat}
          className="p-2 bg-green-500 rounded text-white hover:bg-green-600"
        >
          Join Voice
        </button>
        <button
          onClick={toggleMute}
          className={`p-2 rounded text-white ${
            isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {isMuted ? 'Unmute' : 'Mute'}
        </button>
        <span className="text-gray-400">
          {peers.size} user{peers.size !== 1 ? 's' : ''} in voice
        </span>
      </div>

      {/* Existing Chat UI */}
      <div className="h-80 overflow-y-scroll">
        {messages.map((m) => (
          <div 
            key={m.id} 
            className="border border-gray-600 p-2 mb-2 bg-gray-700 rounded"
          >
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>User #{m.user_id}</span>
              <span>{new Date(m.created_at).toLocaleTimeString()}</span>
            </div>
            <div className="text-white">{m.content}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex items-center">
        <input
          value={messageInput}
          className="flex-1 p-2 border border-gray-600 bg-gray-700 rounded"
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder='Type your message...'
        />
        <button onClick={sendMessage} className="ml-4 p-2 w-20 bg-blue-500 rounded text-white hover:bg-blue-600">Send</button>
      </div>
    </div>
  );
}
