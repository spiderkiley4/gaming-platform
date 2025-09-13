import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { getMessages, getServerChannelMessages } from './api';
import { getSocket } from './socket';
import { API_URL } from './api';
import VideoPlayer from './components/VideoPlayer'; // Adjust the path as necessary
import { resolveAvatarUrl, resolveMediaUrl } from './utils/mediaUrl';

// Screen share video component
const ScreenShareVideo = ({ videoStream, username }) => {
  const videoRef = useRef(null);
  const currentStreamRef = useRef(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement && videoStream && videoStream !== currentStreamRef.current) {
      console.log('Setting video stream for screen share:', videoStream);
      currentStreamRef.current = videoStream;
      
      // Clear any existing stream first
      if (videoElement.srcObject) {
        videoElement.srcObject = null;
      }
      
      // Set new stream
      videoElement.srcObject = videoStream;
      
      // Play with better error handling
      videoElement.play().catch(error => {
        // Only log non-abort errors
        if (!error.message.includes('aborted')) {
          console.error('Error playing screen share video:', error);
        }
      });
    }
  }, [videoStream]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center">
      <video
        ref={videoRef}
        className="max-w-full max-h-full object-contain"
        autoPlay
        muted
        playsInline
        onError={(e) => {
          // Only log non-abort errors
          if (!e.target.error || e.target.error.code !== MediaError.MEDIA_ERR_ABORTED) {
            console.error('Video element error:', e.target.error);
          }
        }}
      />
      <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white text-sm px-3 py-2 rounded-lg">
        {username}'s Screen
      </div>
    </div>
  );
};

export default function ChatRoom({ channelId, userId, type, username, avatar, serverId, voiceChat, isPreview = false }) {
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
  const hasAttemptedVoiceJoin = useRef(false);
  const socket = getSocket();
  
  // Use voice chat state from parent component (App) to persist across navigation
  const { 
    isMuted = false, 
    isDeafened = false, 
    isConnected = false, 
    isSpeaking = false, 
    isScreenSharing = false, 
    peers = new Map(), 
    localScreenStreamRef = null,
    startVoiceChat = () => {}, 
    toggleMute = () => {}, 
    toggleDeafen = () => {}, 
    disconnect = () => {}, 
    startScreenShare = () => {}, 
    stopScreenShare = () => {}, 
    setPeerVolume = () => {} 
  } = voiceChat || {};

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

  // Auto-join voice chat when component mounts for voice channels (unless in preview mode)
  useEffect(() => {
    if (type === 'voice' && voiceChat && !isConnected && startVoiceChat && !hasAttemptedVoiceJoin.current && !isPreview) {
      // Join immediately without delay for better UX
      hasAttemptedVoiceJoin.current = true;
      startVoiceChat();
    }
    
    // Reset the flag when switching away from voice channels
    if (type !== 'voice') {
      hasAttemptedVoiceJoin.current = false;
    }
  }, [type, voiceChat, isConnected, startVoiceChat, isPreview]);

  if (type === 'voice') {
    
    // Find if anyone is screen sharing (including local user)
    const screenSharingPeer = Array.from(peers.entries()).find(([_, peer]) => peer.isScreenSharing);
    const localScreenSharing = isScreenSharing && localScreenStreamRef?.current;
    
    // Create participants list including current user
    const allParticipants = [];
    if (isConnected) {
      allParticipants.push({
        id: 'current-user',
        username: username,
        avatar: avatar,
        isCurrentUser: true,
        isMuted: isMuted,
        isDeafened: isDeafened,
        isSpeaking: isSpeaking,
        isScreenSharing: isScreenSharing
      });
    }
    
    // Add other peers
    Array.from(peers.entries()).forEach(([peerId, peer]) => {
      const fallbackUser = users.find(u => u.userId === peer.userId);
      allParticipants.push({
        id: peerId,
        userId: peer.userId,
        username: peer.username || fallbackUser?.username || `User ${peerId.slice(0, 4)}`,
        avatar: peer.avatar_url || fallbackUser?.avatar_url || null,
        isCurrentUser: false,
        isMuted: peer.muted,
        isDeafened: false, // Remote users can't be deafened
        isSpeaking: peer.speaking,
        isScreenSharing: peer.isScreenSharing
      });
    });
    
    return (
      <div className="flex flex-col h-full bg-gray-900">

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {(localScreenSharing || screenSharingPeer) ? (
            // Screen Share View with users at bottom
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 bg-black flex items-center justify-center relative overflow-hidden">
                {localScreenSharing ? (
                  // Show local user's screen share
                  <ScreenShareVideo 
                    videoStream={localScreenStreamRef.current} 
                    username={`${username} (You)`}
                  />
                ) : (
                  // Show remote user's screen share
                  <ScreenShareVideo 
                    videoStream={screenSharingPeer[1].videoStream} 
                    username={screenSharingPeer[1].username || `User ${screenSharingPeer[0].slice(0, 4)}`}
                  />
                )}
              </div>
              
              {/* Users at bottom when screen sharing */}
              <div className="p-4 bg-gray-800 border-t border-gray-700">
                {/* Participants grid at bottom - smaller version of normal view */}
                 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                   {allParticipants.map((participant) => (
                     <div 
                       key={participant.id} 
                       className={`relative group flex items-center justify-center bg-gray-800 rounded-xl p-3 hover:bg-gray-750 transition-colors cursor-pointer ${
                         participant.isSpeaking ? 'shadow-[0_0_0_3px_rgba(34,197,94,1)]' : ''
                       }`}
                       title={participant.isCurrentUser ? `${participant.username} (You)` : participant.username}
                     >
                       <div className="relative w-16 h-16 rounded-full">
                         <div className="w-full h-full rounded-full overflow-hidden">
                           {participant.avatar ? (
                             <img 
                               src={resolveAvatarUrl(participant.avatar)} 
                               alt={participant.username} 
                               className="w-full h-full object-cover"
                             />
                           ) : (
                             <div className="w-full h-full bg-gray-600 flex items-center justify-center">
                               <span className="text-white font-medium text-lg">
                                 {participant.username.charAt(0).toUpperCase()}
                               </span>
                             </div>
                           )}
                         </div>
                         <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-gray-800 ${
                           participant.isMuted ? 'bg-red-500' : 
                           participant.isDeafened ? 'bg-orange-500' :
                           participant.isSpeaking ? 'bg-green-500' : 'bg-gray-400'
                         }`}></div>
                         {participant.isScreenSharing && (
                           <div className="absolute top-0 right-0 w-4 h-4 bg-purple-500 rounded-full border-2 border-gray-800 flex items-center justify-center">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                             </svg>
                           </div>
                         )}
                       </div>
                       
                       {/* Hover tooltip */}
                       <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                         {participant.isCurrentUser ? `${participant.username} (You)` : participant.username}
                         <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                       </div>
                     </div>
                   ))}
                 </div>
              </div>
            </div>
          ) : (
            // No Screen Share - Large user squares filling space
            <div className="flex-1 p-6">
              {!isConnected ? (
                // Join button in center when not connected
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-semibold text-white mb-2">Voice Channel</h3>
                  <p className="text-gray-400 mb-8 text-center max-w-md">
                    {isPreview 
                      ? "Right-click to preview this voice channel. Click the button below to join the conversation."
                      : "You're not connected to voice. Click the button below to join the conversation."
                    }
                  </p>
                  <button
                    onClick={startVoiceChat}
                    className="px-8 py-4 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg flex items-center gap-3 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    Join Voice Channel
                  </button>
                </div>
               ) : (
                 // Large user squares when connected
                 <div className="h-full flex flex-col">
                   {/* Large user grid filling most space */}
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {allParticipants.map((participant) => (
                      <div key={participant.id} className={`flex flex-col items-center justify-center bg-gray-800 rounded-xl p-6 hover:bg-gray-750 transition-colors ${
                        participant.isSpeaking ? 'shadow-[0_0_0_4px_rgba(34,197,94,1)]' : ''
                      }`}>
                        <div className="relative w-24 h-24 rounded-full mb-4">
                          <div className="w-full h-full rounded-full overflow-hidden">
                            {participant.avatar ? (
                              <img 
                                src={resolveAvatarUrl(participant.avatar)} 
                                alt={participant.username} 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-600 flex items-center justify-center">
                                <span className="text-white font-medium text-2xl">
                                  {participant.username.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className={`absolute bottom-0 right-0 w-6 h-6 rounded-full border-4 border-gray-800 ${
                            participant.isMuted ? 'bg-red-500' : 
                            participant.isDeafened ? 'bg-orange-500' :
                            participant.isSpeaking ? 'bg-green-500' : 'bg-gray-400'
                          }`}></div>
                        </div>
                        <h4 className="text-white font-medium text-lg text-center mb-1">
                          {participant.isCurrentUser ? `${participant.username} (You)` : participant.username}
                        </h4>
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          {participant.isMuted && <span className="text-red-400">Muted</span>}
                          {participant.isDeafened && <span className="text-orange-400">Deafened</span>}
                          {participant.isSpeaking && <span className="text-green-400">Speaking</span>}
                          {participant.isScreenSharing && (
                            <div className="flex items-center gap-1 text-purple-400">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              <span>Sharing</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Controls - Discord Style */}
        <div className="flex-shrink-0 p-4 bg-gray-800 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <button
                    onClick={toggleMute}
                    className={`p-3 rounded-full ${
                      isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-600 hover:bg-gray-500'
                    }`}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    )}
                  </button>
                  
                  <button
                    onClick={toggleDeafen}
                    className={`p-3 rounded-full ${
                      isDeafened ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-600 hover:bg-gray-500'
                    }`}
                    title={isDeafened ? 'Undeafen' : 'Deafen'}
                  >
                    {isDeafened ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    )}
                  </button>
                  
                  <button
                    onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                    className={`p-3 rounded-full ${
                      isScreenSharing ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-600 hover:bg-gray-500'
                    }`}
                    title={isScreenSharing ? 'Stop Screen Share' : 'Start Screen Share'}
                  >
                    {isScreenSharing ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={startVoiceChat}
                  className="p-3 rounded-full bg-green-500 hover:bg-green-600"
                  title="Join Voice Channel"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
              )}
            </div>
            
            {isConnected && (
              <button
                onClick={disconnect}
                className="p-3 rounded-full bg-red-500 hover:bg-red-600"
                title="Disconnect"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 3l18 18" />
                </svg>
              </button>
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
      <div className="flex flex-col h-[calc(100vh-100px)] overflow-y-auto -mr-4 pr-4">
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
