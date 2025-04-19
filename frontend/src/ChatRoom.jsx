import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { getMessages } from './api';
import { useVoiceChat } from './hooks/useVoiceChat';
import { getSocket } from './socket';
import { API_URL } from './api';
import VideoPlayer from './components/VideoPlayer'; // Adjust the path as necessary

export default function ChatRoom({ channelId, userId, type, username, avatar }) {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const socket = getSocket();
  const { isMuted, isConnected, peers, startVoiceChat, toggleMute, disconnect } = useVoiceChat(channelId, socket);

  // Function to check if we're near the bottom
  const isNearBottom = () => {
    const container = document.querySelector('.overflow-y-auto');
    if (!container) return true;
    const threshold = 150;
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  };

  // Function to scroll to bottom
  const scrollToBottom = (behavior = 'smooth') => {
    const container = document.querySelector('.overflow-y-auto');
    if (container && (shouldAutoScroll || isInitialLoad)) {
      if (isInitialLoad) {
        container.scrollTop = container.scrollHeight;
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior });
      }
    }
  };

  // Handle scroll events
  const handleScroll = () => {
    const shouldScroll = isNearBottom();
    if (shouldScroll !== shouldAutoScroll) {
      setShouldAutoScroll(shouldScroll);
    }
  };

  // Attach scroll listener
  useEffect(() => {
    const container = document.querySelector('.overflow-y-auto');
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [channelId]);

  // Handle message loading and socket events
  useEffect(() => {
    if (type === 'text') {
      let isCurrentChannel = true;

      // Join channel
      socket.emit('join_channel', channelId);
      
      // Load messages without clearing previous ones immediately
      getMessages(channelId).then(res => {
        if (isCurrentChannel) {
          setMessages(res.data);
          setTimeout(() => {
            if (isCurrentChannel) {
              scrollToBottom();
              setIsInitialLoad(false);
            }
          }, 100);
        }
      });

      const handleNewMessage = (msg) => {
        if (isCurrentChannel) {
          setMessages(prev => [...prev, msg]);
          setTimeout(() => scrollToBottom(), 50);
        }
      };

      socket.on('new_message', handleNewMessage);

      // Cleanup function
      return () => {
        isCurrentChannel = false;
        socket.off('new_message', handleNewMessage);
      };
    }
  }, [channelId, type, socket]);

  // Reset input state only (not messages) when changing channels
  useEffect(() => {
    setMessageInput('');
    setSelectedFile(null);
    setShouldAutoScroll(true);
    setIsInitialLoad(true);
  }, [channelId]);

  // Enhanced initial load effect
  useLayoutEffect(() => {
    if (messages.length > 0 && isInitialLoad) {
      scrollToBottom();
      setIsInitialLoad(false);
    }
  }, [messages, isInitialLoad]);

  // Improved message reception handling
  useEffect(() => {
    if (type === 'text') {
      // Leave previous channel if any
      socket.emit('join_channel', channelId);
      
      getMessages(channelId).then(res => {
        setMessages(res.data);
        // Force scroll to bottom on initial load
        setTimeout(() => scrollToBottom(), 100);
      });

      const handleNewMessage = (msg) => {
        setMessages((prev) => [...prev, msg]);
        // Add small delay to ensure content is rendered
        setTimeout(() => scrollToBottom(), 50);
      };

      socket.on('new_message', handleNewMessage);

      return () => {
        socket.off('new_message', handleNewMessage);
      };
    }
  }, [channelId, type, socket]);

  // Reset state when channel changes
  useEffect(() => {
    setMessages([]);
    setMessageInput('');
    setShouldAutoScroll(true);
    setIsInitialLoad(true);
    setSelectedFile(null);
  }, [channelId]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check file size (limit to 50MB)
    if (file.size > 50 * 1024 * 1024) {
      alert('File size should be less than 50MB');
      return;
    }
    
    // Store the selected file
    setSelectedFile(file);
    
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
  };

  const sendMessage = async () => {
    if (selectedFile) {
      setIsUploading(true);
      try {
        // Create a FormData object to send the file
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('channelId', channelId);
        
        // Send the file to the server
        const response = await fetch(`${API_URL}/api/upload-file`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: formData
        });
        
        if (!response.ok) {
          throw new Error('Failed to upload file');
        }
        
        // The backend will handle emitting the message through socket
        setSelectedFile(null);
      } catch (error) {
        console.error('Error uploading file:', error);
        alert('Failed to upload file. Please try again.');
      } finally {
        setIsUploading(false);
      }
    } else if (messageInput.trim()) {
      socket.emit('send_message', {
        content: messageInput,
        channelId
      });
      setMessageInput('');
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
    switch (message.type) {
      case 'image':
        return (
          <div className="max-w-[300px] max-h-[300px] overflow-hidden rounded">
            <img 
              src={message.content} 
              alt="Chat image" 
              className="w-full h-auto object-contain"
              loading="lazy"
              onLoad={() => {
                if (shouldAutoScroll) {
                  scrollToBottom();
                }
              }}
            />
          </div>
        );
      case 'video':
        return (
          <div className="max-w-[400px] rounded overflow-hidden bg-gray-700">
            <VideoPlayer src={message.content} />
          </div>
        );
      case 'file':
        const fileName = message.content.split('/').pop();
        return (
          <div className="flex items-center gap-2 p-2 bg-gray-700 rounded">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <a 
              href={message.content}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline truncate"
            >
              {fileName}
            </a>
          </div>
        );
      default:
        return <div className="text-white break-words">{message.content}</div>;
    }
  };

  if (type === 'voice') {
    return (
      <div className="flex flex-col bg-gray-800 p-4 rounded-lg">
        <div className="flex items-center justify-between mb-4 p-4 bg-gray-700 rounded">
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
          <div className="flex items-center gap-2">
            <button
              onClick={isConnected ? disconnect : startVoiceChat}
              className={`p-2 rounded text-white ${
                isConnected ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
              }`}
            >
              {isConnected ? 'Disconnect' : 'Join Voice'}
            </button>
            {isConnected && (
              <button
                onClick={toggleMute}
                className={`p-2 rounded text-white ${
                  isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 p-4 bg-gray-700 rounded">
          <h3 className="text-lg font-semibold mb-4">Voice Channel Participants</h3>
          <div className="space-y-3">
            {/* Current user */}
            <div className="flex items-center gap-3 p-2 bg-gray-600 rounded">
              <div className="relative">
                {avatar ? (
                  <img 
                    src={avatar} 
                    alt={username} 
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-500 flex items-center justify-center">
                    {username.charAt(0).toUpperCase()}
                  </div>
                )}
                {isConnected && (
                  <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-gray-700 ${
                    isMuted ? 'bg-red-500' : 'bg-green-500'
                  }`}></div>
                )}
              </div>
              <div>
                <div className="font-medium">{username} (You)</div>
                <div className="text-sm text-gray-400">
                  {isConnected ? (isMuted ? 'Muted' : 'Speaking') : 'Not Connected'}
                </div>
              </div>
            </div>

            {/* Other participants */}
            {Array.from(peers.entries()).map(([peerId, peer]) => (
              <div key={peerId} className="flex items-center gap-3 p-2 bg-gray-600 rounded">
                <div className="relative">
                  {peer.avatar ? (
                    <img 
                      src={peer.avatar} 
                      alt={peer.username || 'User'} 
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-500 flex items-center justify-center">
                      {(peer.username || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-gray-700"></div>
                </div>
                <div>
                  <div className="font-medium">{peer.username || `User ${peerId.slice(0, 4)}`}</div>
                  <div className="text-sm text-gray-400">Speaking</div>
                </div>
              </div>
            ))}

            {isConnected && peers.size === 0 && (
              <div className="text-center text-gray-400 py-4">
                No other participants in this channel
              </div>
            )}

            {!isConnected && (
              <div className="text-center text-gray-400 py-4">
                Join voice to see other participants
              </div>
            )}
          </div>
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
        {/* Preview section for selected file */}
        {selectedFile && (
          <div className="flex items-center justify-between bg-gray-700 p-2 rounded mb-2">
            <span className="text-white">{selectedFile.name}</span>
            <button onClick={removeSelectedFile} className="text-red-500">
              X
            </button>
          </div>
        )}
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
          onChange={handleFileUpload}
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
          ) : selectedFile ? (
            <span className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          )}
        </button>
        <button 
          onClick={sendMessage} 
          className="ml-2 p-2 w-20 bg-blue-500 rounded text-white hover:bg-blue-600"
          disabled={isUploading || (!messageInput.trim() && !selectedFile)}
        >
          Send
        </button>
      </div>
    </div>
  );
}
