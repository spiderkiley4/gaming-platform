import { useEffect, useState, useRef } from 'react';
import { getMessages } from './api';
import { useVoiceChat } from './hooks/useVoiceChat';
import { getSocket } from './socket';

export default function ChatRoom({ channelId, userId, type, username, avatar }) {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef(null);
  const socket = getSocket();
  const { isMuted, isConnected, peers, startVoiceChat, toggleMute, disconnect } = useVoiceChat(channelId, socket);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (type === 'text') {
      socket.emit('join_channel', channelId);
      getMessages(channelId).then(res => {
        setMessages(res.data);
      });

      socket.on('new_message', (msg) => {
        setMessages((prev) => [...prev, msg]);
      });

      return () => socket.off('new_message');
    }
  }, [channelId, type, socket]);

  const sendMessage = () => {
    if (messageInput.trim()) {
      socket.emit('send_message', {
        content: messageInput,
        channelId
      });
      setMessageInput('');
    }
  };

  if (type === 'voice') {
    return (
      <div className="flex flex-col bg-gray-800 p-4 rounded-lg">
        <div className="flex items-center gap-4 mb-4 p-4 bg-gray-700 rounded">
          <div className="flex items-center gap-2">
            {avatar ? (
              <img 
                src={avatar} 
                alt={username} 
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                {username.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-gray-300">{username}</span>
          </div>
          <button
            onClick={isConnected ? disconnect : startVoiceChat}
            className={`p-2 rounded text-white ${
              isConnected ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            {isConnected ? 'Disconnect' : 'Join Voice'}
          </button>
          {isConnected && (
            <>
              <button
                onClick={toggleMute}
                className={`p-2 rounded text-white ${
                  isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
              <span className="text-gray-400">
                {peers.size + 1} user{peers.size + 1 !== 1 ? 's' : ''} in voice
              </span>
            </>
          )}
        </div>
        <div className="text-center text-gray-400 mt-4">
          {isConnected ? 'Voice chat active' : 'Click "Join Voice" to start chatting'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-gray-800 p-4 rounded-lg">
      <div className="h-80 overflow-y-scroll">
        {messages.map((m) => (
          <div 
            key={m.id} 
            className={`border border-gray-600 p-2 mb-2 bg-gray-700 rounded ${
              m.user_id === userId ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[80%]'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              {m.avatar_url ? (
                <img 
                  src={m.avatar_url} 
                  alt={m.username} 
                  className="w-6 h-6 rounded-full"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-sm">
                  {m.username ? m.username.charAt(0).toUpperCase() : `U${m.user_id}`}
                </div>
              )}
              <span className="text-sm text-gray-300">
                {m.username || `User #${m.user_id}`}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(m.created_at).toLocaleTimeString()}
              </span>
            </div>
            <div className="text-white break-words">{m.content}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex items-center mt-4">
        <input
          value={messageInput}
          className="flex-1 p-2 border border-gray-600 bg-gray-700 rounded text-white"
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type your message..."
        />
        <button 
          onClick={sendMessage} 
          className="ml-4 p-2 w-20 bg-blue-500 rounded text-white hover:bg-blue-600"
        >
          Send
        </button>
      </div>
    </div>
  );
}
