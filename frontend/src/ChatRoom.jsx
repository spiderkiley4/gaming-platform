import { useEffect, useState, useRef } from 'react';
import { getMessages } from './api';
import { useVoiceChat } from './hooks/useVoiceChat';
import { getSocket } from './socket';

export default function ChatRoom({ channelId, userId, type, username, avatar }) {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
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

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check if file is an image
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }
    
    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size should be less than 5MB');
      return;
    }
    
    setIsUploading(true);
    
    try {
      // Create a FormData object to send the file
      const formData = new FormData();
      formData.append('image', file);
      formData.append('channelId', channelId);
      
      // Send the image to the server
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload image');
      }
      
      const data = await response.json();
      
      // Emit the image message through socket
      socket.emit('send_message', {
        content: data.imageUrl,
        channelId,
        type: 'image'
      });
      
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setIsUploading(false);
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Check if date is today, yesterday, or another date
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  // Render message content based on type
  const renderMessageContent = (message) => {
    if (message.type === 'image') {
      return (
        <div className="max-w-[300px] max-h-[300px] overflow-hidden rounded">
          <img 
            src={message.content} 
            alt="Chat image" 
            className="w-full h-auto object-contain"
            loading="lazy"
          />
        </div>
      );
    }
    return <div className="text-white break-words">{message.content}</div>;
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
    <div className="flex flex-col bg-gray-800 p-4 rounded-lg h-[calc(100vh-140px)]">
      <div className="flex flex-col h-[calc(100vh-100px)] overflow-y-auto">
        {messages.map((m, index) => {
          const currentDate = new Date(m.created_at).toDateString();
          const prevDate = index > 0 ? new Date(messages[index - 1].created_at).toDateString() : null;
          const showDateHeader = currentDate !== prevDate;
          
          return (
            <div key={m.id}>
              {showDateHeader && (
                <div className="text-center my-4">
                  <span className="bg-gray-700 text-gray-300 px-3 py-1 rounded-full text-sm">
                    {formatDate(m.created_at)}
                  </span>
                </div>
              )}
              <div 
                className={`p-2 mb-2 mr-4 rounded w-full hover:bg-gray-700/60 ${
                  m.user_id === userId ? 'ml-auto' : 'mr-auto'
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
                {renderMessageContent(m)}
              </div>
            </div>
          );
        })}
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
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleImageUpload}
        />
        <button 
          onClick={() => fileInputRef.current.click()}
          className="ml-2 p-2 bg-gray-600 rounded text-white hover:bg-gray-500"
          disabled={isUploading}
        >
          {isUploading ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Uploading...
            </span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </button>
        <button 
          onClick={sendMessage} 
          className="ml-2 p-2 w-20 bg-blue-500 rounded text-white hover:bg-blue-600"
        >
          Send
        </button>
      </div>
    </div>
  );
}
