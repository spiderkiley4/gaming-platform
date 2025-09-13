import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { getMessages, getServerChannelMessages } from './api';
import { useVoiceChat } from './hooks/useVoiceChat';
import { getSocket } from './socket';
import { API_URL } from './api';
import VideoPlayer from './components/VideoPlayer'; // Adjust the path as necessary
import { resolveAvatarUrl, resolveMediaUrl } from './utils/mediaUrl';

export default function ChatRoom({ channelId, userId, type, username, avatar, serverId }) {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const socket = getSocket();
  const { isMuted, isConnected, isSpeaking, isScreenSharing, peers, startVoiceChat, toggleMute, disconnect, startScreenShare, stopScreenShare, setPeerVolume } = useVoiceChat(channelId, socket);

  // Get all online users for mention suggestions
  const [users, setUsers] = useState([]);
  
  useEffect(() => {
    if (!socket) return;
    
    // Request online users
    socket.emit('get_online_users');
    
    const handleUsers = ({ users }) => {
      setUsers(users);
    };
    
    socket.on('online_users', handleUsers);
    socket.on('user_status', ({ userId, username, status, avatar_url }) => {
      setUsers(prev => {
        if (status === 'offline') {
          return prev.filter(u => u.userId !== userId);
        } else {
          const exists = prev.some(u => u.userId === userId);
          if (!exists) {
            return [...prev, { userId, username, avatar_url }];
          }
          // Update existing user's avatar if it changed
          return prev.map(u => 
            u.userId === userId ? { ...u, username, avatar_url } : u
          );
        }
      });
    });
    
    return () => {
      socket.off('online_users', handleUsers);
      socket.off('user_status');
    };
  }, [socket]);

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

  // Message handling and socket events
  useEffect(() => {
    if (!socket || type !== 'text') return;

    let isCurrentChannel = true;

    // Join channel or server
    if (serverId) {
      socket.emit('join_server', serverId);
    } else {
      socket.emit('join_channel', channelId);
    }
    
    // Load initial messages
    const loadMessages = async () => {
      try {
        let res;
        if (serverId) {
          // Use the imported function directly
          res = await getServerChannelMessages(serverId, channelId);
        } else {
          res = await getMessages(channelId);
        }
        
        if (isCurrentChannel) {
          setMessages(res.data);
          // Force scroll to bottom on initial load
          setTimeout(() => {
            if (isCurrentChannel) {
              scrollToBottom();
              setIsInitialLoad(false);
            }
          }, 100);
        }
      } catch (error) {
        console.error('Error loading messages:', error);
      }
    };
    
    loadMessages();

    // Setup message handler
    const handleNewMessage = (msg) => {
      if (isCurrentChannel) {
        setMessages(prev => [...prev, msg]);
        // Add small delay to ensure content is rendered
        setTimeout(() => scrollToBottom(), 50);
      }
    };

    // Subscribe to new messages
    const messageEvent = serverId ? 'new_server_message' : 'new_message';
    socket.on(messageEvent, handleNewMessage);

    // Cleanup function
    return () => {
      isCurrentChannel = false;
      socket.off(messageEvent, handleNewMessage);
    };
  }, [channelId, type, socket, serverId]);

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
        if (serverId) {
          formData.append('serverId', serverId);
        }
        
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
      if (serverId) {
        socket.emit('send_server_message', {
          content: messageInput,
          serverId,
          channelId
        });
      } else {
        socket.emit('send_message', {
          content: messageInput,
          channelId
        });
      }
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

  // Function to handle mentions in message content
  const formatMessageContent = (content, message) => {
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const username = part.slice(1);
        return (
          <span key={index} className="text-blue-400 font-medium bg-blue-500/20 px-1.5 py-0.5 rounded">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Request notification permissions on component mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Render message content based on type
  const renderMessageContent = (message) => {
    const resolved = resolveMediaUrl(message.content);
    switch (message.type) {
      case 'image':
        return (
          <div className="max-w-[300px] max-h-[300px] overflow-hidden rounded">
            <img 
              src={resolved} 
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
            <VideoPlayer src={resolved} />
          </div>
        );
      case 'file':
        const fileName = (resolved || message.content).split('/').pop();
        return (
          <div className="flex items-center gap-2 p-2 bg-gray-700 rounded">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <a 
              href={resolved}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline truncate"
            >
              {fileName}
            </a>
          </div>
        );
      default:
        return (
          <div className="text-white break-words">
            {formatMessageContent(message.content, message)}
          </div>
        );
    }
  };

  if (type === 'voice') {
    return (
      <div className="flex flex-col bg-gray-800 p-4 rounded-lg">
        <div className="flex items-center justify-between mb-4 p-4 bg-gray-700 rounded">
          <div className="flex items-center gap-2">
            {avatar ? (
              <img 
                src={resolveAvatarUrl(avatar)} 
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
            {isConnected && (
              <button
                onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                className={`p-2 rounded text-white ${
                  isScreenSharing ? 'bg-red-500 hover:bg-red-600' : 'bg-purple-500 hover:bg-purple-600'
                }`}
                title={isScreenSharing ? 'Stop Screen Share' : 'Start Screen Share'}
              >
                {isScreenSharing ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 p-4 bg-gray-700 rounded">
          <h3 className="text-lg font-semibold mb-4">Voice Channel Participants</h3>
          <div className="space-y-3">
            {/* Current user */}
            <div className="flex items-center gap-3 p-2 bg-gray-600 rounded">
              <div className={`relative rounded-full ${isSpeaking ? 'ring-2 ring-green-500 ring-offset-2 ring-offset-gray-700' : ''}`}>
                {avatar ? (
                  <img 
                    src={resolveAvatarUrl(avatar)} 
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
                    isMuted ? 'bg-red-500' : (isSpeaking ? 'bg-green-500 animate-pulse' : 'bg-gray-400')
                  }`}></div>
                )}
              </div>
              <div>
                <div className="font-medium">{username} (You)</div>
                <div className="text-sm text-gray-400">
                  {isConnected ? (isMuted ? 'Muted' : (isSpeaking ? 'Speaking' : 'Not speaking')) : 'Not Connected'}
                </div>
              </div>
            </div>

            {/* Other participants */}
            {Array.from(peers.entries()).map(([peerId, peer]) => {
              const fallbackUser = users.find(u => u.userId === peer.userId);
              const displayUsername = peer.username || fallbackUser?.username || `User ${peerId.slice(0, 4)}`;
              const displayAvatar = peer.avatar_url || fallbackUser?.avatar_url || null;
              return (
                <div key={peerId} className="flex items-center gap-3 p-2 bg-gray-600 rounded">
                  <div className={`relative rounded-full ${peer.speaking ? 'ring-2 ring-green-500 ring-offset-2 ring-offset-gray-700' : ''}`}>
                    {displayAvatar ? (
                      <img 
                        src={resolveAvatarUrl(displayAvatar)} 
                        alt={displayUsername} 
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-500 flex items-center justify-center">
                        {displayUsername.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-gray-700 ${peer.muted ? 'bg-red-500' : (peer.speaking ? 'bg-green-500 animate-pulse' : 'bg-gray-400')}`}></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{displayUsername}</div>
                    <div className="text-xs text-gray-300 mt-1 flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.01"
                        value={typeof peer.volume === 'number' ? Math.min(2, peer.volume) : 1}
                        onChange={(e) => setPeerVolume(peerId, parseFloat(e.target.value))}
                        className="w-40 accent-blue-500"
                      />
                      <input
                        type="number"
                        min={0}
                        max={5}
                        step={0.01}
                        value={typeof peer.volume === 'number' ? peer.volume : 1}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!Number.isNaN(val)) setPeerVolume(peerId, val);
                        }}
                        className="w-16 bg-gray-600 text-gray-100 px-1 py-0.5 rounded"
                      />
                      <span className="w-12 text-right">{Math.round((peer.volume ?? 1) * 100)}%</span>
                    </div>
                    {peer.isScreenSharing && (
                      <div className="mt-2">
                        <div className="flex items-center gap-2 text-xs text-purple-400 mb-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          Screen Sharing
                        </div>
                        {peer.videoStream && (
                          <div className="relative bg-black rounded overflow-hidden">
                            <video
                              ref={(videoElement) => {
                                if (videoElement && peer.videoStream) {
                                  videoElement.srcObject = peer.videoStream;
                                  videoElement.play().catch(console.error);
                                }
                              }}
                              className="w-full h-32 object-contain"
                              autoPlay
                              muted
                              playsInline
                            />
                            <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                              {displayUsername}'s Screen
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

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

  // Handle input changes and mention suggestions
  const handleInputChange = (e) => {
    const value = e.target.value;
    const position = e.target.selectionStart;
    setMessageInput(value);
    setCursorPosition(position);

    // Check for mention suggestions
    const beforeCursor = value.slice(0, position);
    const matches = beforeCursor.match(/@(\w*)$/);
    
    if (matches) {
      const query = matches[1].toLowerCase();
      setMentionQuery(query);
      const suggestions = users
        .filter(u => u.username.toLowerCase().includes(query))
        .slice(0, 5);
      setMentionSuggestions(suggestions);
    } else {
      setMentionSuggestions([]);
    }
  };

  // Handle mention selection
  const handleMentionSelect = (username) => {
    const beforeMention = messageInput.slice(0, cursorPosition).replace(/@\w*$/, '');
    const afterMention = messageInput.slice(cursorPosition);
    const newValue = `${beforeMention}@${username} ${afterMention}`;
    setMessageInput(newValue);
    setMentionSuggestions([]);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col bg-gray-800 p-4 rounded-lg h-[calc(100vh-140px)]">
      <div className="flex flex-col h-[calc(100vh-100px)] overflow-y-auto">
        {messages.map((message, index) => {
          const currentDate = new Date(message.created_at).toDateString();
          const prevDate = index > 0 ? new Date(messages[index - 1].created_at).toDateString() : null;
          const showDateHeader = currentDate !== prevDate;
          
          return (
            <div key={message.id}>
              {showDateHeader && (
                <div className="text-center my-4">
                  <span className="bg-gray-700 text-gray-300 px-3 py-1 rounded-full text-sm">
                    {formatDate(message.created_at)}
                  </span>
                </div>
              )}
              <div className={`p-2 mb-2 mr-4 rounded w-full hover:bg-gray-700/60 flex items-start gap-3`}>
                {message.avatar_url ? (
                  <img 
                    src={resolveAvatarUrl(message.avatar_url)} 
                    alt={message.username} 
                    className="w-12 h-12 rounded-full flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
                    <span>
                      {message.username ? message.username.charAt(0).toUpperCase() : `U${message.user_id}`}
                    </span>
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-300 font-medium">
                      {message.username || `User #${message.user_id}`}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(message.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <div>
                    {renderMessageContent(message)}
                  </div>
                </div>
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
        <div className="relative w-full">
          {mentionSuggestions.length > 0 && (
            <div className="absolute bottom-full mb-2 bg-gray-700 rounded shadow-lg max-h-40 overflow-y-auto w-64">
              {mentionSuggestions.map((user) => (
                <div
                  key={user.userId}
                  className="p-2 hover:bg-gray-600 cursor-pointer flex items-center gap-2"
                  onClick={() => handleMentionSelect(user.username)}
                >
                  {user.avatar_url ? (
                    <img src={resolveAvatarUrl(user.avatar_url)} alt="" className="w-6 h-6 rounded-full" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-500 flex items-center justify-center text-sm">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span>{user.username}</span>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex items-center">
            <input
              ref={inputRef}
              value={messageInput}
              className="flex flex-1 p-2 border border-gray-600 bg-gray-700 rounded text-white"
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (mentionSuggestions.length > 0) {
                    handleMentionSelect(mentionSuggestions[0].username);
                  } else {
                    sendMessage();
                  }
                }
              }}
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
      </div>
    </div>
  );
}
