import { useEffect, useState } from 'react';
import { API_URL } from './api/index';
import ChatRoom from './ChatRoom';
import { initSocket, getSocket } from './socket';
import AuthForms from './components/AuthForms';
import { useAuth } from './context/AuthContext';
import VersionDisplay from './components/VersionDisplay';
import { useSpotifyPresence } from './hooks/useSpotifyPresence';
import ServerList from './components/ServerList';
import ServerChannels from './components/ServerChannels';
import ServerMembers from './components/ServerMembers';
import { resolveAvatarUrl } from './utils/mediaUrl';
import { useVoiceChat } from './hooks/useVoiceChat';
import UserBar from './components/UserBar';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import CustomThemeEditor from './components/CustomThemeEditor';
import './styles/themes.css';

function AppContent() {
  const { user, logout, setUser } = useAuth();
  const { currentTheme, isCustomTheme, switchTheme, getAvailableThemes } = useTheme();
  
  console.log('[App] Current user state:', user);
  
  // Suppress DTLS transport console errors
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      const message = args[0]?.toString() || '';
      if (message.includes('DtlsTransport') && message.includes('Received non-DTLS packet')) {
        // Suppress this specific error as it's expected during WebRTC connection establishment
        return;
      }
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);
  
  // Debug re-renders
  useEffect(() => {
    console.log('[App] App component re-rendered with user:', user);
  }, [user]);
  
  
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [selectedServer, setSelectedServer] = useState(null);
  
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('servers');
  const [onlineUsers, setOnlineUsers] = useState(new Map());
  const [offlineUsers, setOfflineUsers] = useState(new Map());
  const [isUserListCollapsed, setIsUserListCollapsed] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(new Map()); // Map of channel ID to unread count
  const [mentions, setMentions] = useState(new Map()); // Map of channel ID to mention count
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [userPresence, setUserPresence] = useState(null);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCustomThemeEditor, setShowCustomThemeEditor] = useState(false);
  const [customStatus, setCustomStatus] = useState('');
  
  const socket = getSocket();
  
  // Voice chat state - only active when in a voice channel
  const currentVoiceChannelId = selectedChannel?.type === 'voice' ? selectedChannel.id : null;
  const isVoicePreview = selectedChannel?.preview === true;
  const voiceChat = useVoiceChat(currentVoiceChannelId, socket, isVoicePreview);

  // Add presence update function
  const updatePresence = (presence) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('update_presence', { presence });
    }
  };

  // Initialize Spotify presence
  // useSpotifyPresence((presence) => {
  //   setUserPresence(presence);
  //   updatePresence(presence);
  // });

  // Add presence update interval effect
  useEffect(() => {
    const checkPresence = async () => {
      if (window.electron) {
        const games = await window.electron.invoke('get-running-games');
        if (games.length > 0) {
          const newPresence = { type: 'playing', name: games[0] };
          if (!userPresence || userPresence.type !== 'playing' || userPresence.name !== games[0]) {
            setUserPresence(newPresence);
            updatePresence(newPresence);
          }
        } else if (userPresence?.type === 'playing') {
          setUserPresence(null);
          updatePresence(null);
        }
      }
    };

    const presenceInterval = setInterval(checkPresence, 30000);
    checkPresence(); // Initial check

    return () => clearInterval(presenceInterval);
  }, [userPresence]);

  // Function to detect game processes
  const detectGameProcess = () => {
    if (window.electron) {
      window.electron.invoke('get-running-games').then(games => {
        if (games.length > 0) {
          updatePresence({ type: 'playing', name: games[0] });
        }
      });
    }
  };

  // Detect games periodically
  useEffect(() => {
    const checkInterval = setInterval(detectGameProcess, 30000); // Check every 30 seconds
    return () => clearInterval(checkInterval);
  }, []);

  // Set up WebSocket connections
  useEffect(() => {
    if (!user) return;

    const socket = getSocket();
    if (!socket) {
      console.log('No socket connection available');
      return;
    }

    // Function to handle new messages and update unread counts
    const handleNewMessage = (message) => {
      if (message.channel_id !== selectedChannel?.id) {
        // Update unread count
        setUnreadMessages(prev => {
          const newCount = (prev.get(message.channel_id) || 0) + 1;
          return new Map(prev).set(message.channel_id, newCount);
        });

        // Check for mentions
        const mentionRegex = new RegExp(`@${user.username}\\b`, 'i');
        if (mentionRegex.test(message.content)) {
          setMentions(prev => {
            const newCount = (prev.get(message.channel_id) || 0) + 1;
            return new Map(prev).set(message.channel_id, newCount);
          });

          // Show browser notification
          if (Notification.permission === "granted") {
            new Notification(`${message.username} mentioned you in ${message.channel_name}`, {
              body: message.content,
              icon: message.avatar_url || '/favicon.ico'
            });
          }
        }
      }
    };

    // Ensure socket is connected before setting up listeners
    const setupSocketListeners = () => {
      console.log('Setting up socket listeners');
      setIsConnected(true);

      socket.emit('get_online_users'); // Request current online users
      
      socket.on('new_message', handleNewMessage);

      socket.on('online_users', ({ users }) => {
        console.log('Received online users:', users);
        const onlineMap = new Map();
        const offlineMap = new Map();
        
        users.forEach(u => {
          if (u.status === 'online') {
            onlineMap.set(u.userId, u);
          } else {
            offlineMap.set(u.userId, u);
          }
        });
        
        setOnlineUsers(onlineMap);
        setOfflineUsers(offlineMap);
      });

      socket.on('user_status', ({ userId, username, avatar_url, status }) => {
        console.log('User status update:', userId, status);
        if (status === 'online') {
          setOnlineUsers(prev => {
            const newUsers = new Map(prev);
            newUsers.set(userId, { userId, username, avatar_url, status });
            return newUsers;
          });
          setOfflineUsers(prev => {
            const newUsers = new Map(prev);
            newUsers.delete(userId);
            return newUsers;
          });
        } else {
          setOfflineUsers(prev => {
            const newUsers = new Map(prev);
            newUsers.set(userId, { userId, username, avatar_url, status: 'offline' });
            return newUsers;
          });
          setOnlineUsers(prev => {
            const newUsers = new Map(prev);
            newUsers.delete(userId);
            return newUsers;
          });
        }
      });
    };

    socket.on('connect', () => {
      console.log('Connected to server');
      setupSocketListeners();
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
      setOnlineUsers(new Map());
    });

    // If socket is already connected, set up listeners immediately
    if (socket.connected) {
      setupSocketListeners();
    }

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('online_users');
      socket.off('user_status');
      socket.off('new_message');
    };
  }, [user, selectedChannel]);

  // Handle window state changes from electron
  useEffect(() => {
    if (window.electron) {
      window.electron.on('window-state-change', ({ isWindowFocused, isMinimized }) => {
        setIsWindowFocused(isWindowFocused);
        setIsMinimized(isMinimized);
      });

      return () => {
        window.electron.removeAllListeners('window-state-change');
      };
    }
  }, []);

  // Function to handle new message and update unread counts
  const handleNewMessage = (message) => {
    if (message.channel_id !== selectedChannel?.id) {
      // Update unread count
      setUnreadMessages(prev => {
        const newCount = (prev.get(message.channel_id) || 0) + 1;
        return new Map(prev).set(message.channel_id, newCount);
      });

      // Check for mentions
      const mentionRegex = new RegExp(`@${user.username}\\b`, 'i');
      if (mentionRegex.test(message.content)) {
        setMentions(prev => {
          const newCount = (prev.get(message.channel_id) || 0) + 1;
          return new Map(prev).set(message.channel_id, newCount);
        });

        // Show notification based on window state
        if (!isWindowFocused || isMinimized) {
          if (window.electron) {
            // Send to electron main process for native notification
            window.electron.send('new-message', {
              title: `${message.username} mentioned you in ${message.channel_name}`,
              body: message.content,
              channel: message.channel_id
            });
          } else if (Notification.permission === "granted") {
            // Fallback to web notification
            new Notification(`${message.username} mentioned you in ${message.channel_name}`, {
              body: message.content,
              icon: message.avatar_url || '/favicon.ico'
            });
          }
        }
      }
    }
  };

  if (!user) {
    console.log('[App] No user, rendering AuthForms');
    return <AuthForms />;
  }

  console.log('[App] User exists, rendering main app');

  // Profile settings modal component
  const ProfileSettingsModal = () => {
    if (!showProfileSettings) return null;
    
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-gray-800/70 backdrop-blur-md p-6 rounded-lg w-96 border border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Profile Settings</h2>
            <button 
              onClick={() => setShowProfileSettings(false)}
              className="text-gray-400 hover:text-gray-200 cursor-pointer"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-4">
            {/* Avatar Section */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <label className="cursor-pointer block">
                  {user.avatar_url ? (
                    <img 
                      src={resolveAvatarUrl(user.avatar_url)} 
                      alt={user.username} 
                      className="w-20 h-20 rounded-full group-hover:opacity-80 transition-opacity"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gray-600 flex items-center justify-center group-hover:bg-gray-500 transition-colors">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      if (file.size > 5 * 1024 * 1024) {
                        alert('Image must be less than 5MB');
                        return;
                      }

                      const formData = new FormData();
                      formData.append('file', file);

                      try {
                        const response = await fetch(`${API_URL}/api/upload-avatar`, {
                          method: 'POST',
                          headers: {
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                          },
                          body: formData
                        });

                        if (!response.ok) throw new Error('Failed to upload avatar');

                        const data = await response.json();
                        setUser(prev => ({ ...prev, avatar_url: data.avatar_url }));
                      } catch (error) {
                        console.error('Error uploading avatar:', error);
                        alert('Failed to upload avatar. Please try again.');
                      }
                    }}
                  />
                </label>
              </div>
              <div>
                <h3 className="font-medium text-lg">{user.username}</h3>
                <p className="text-gray-400 text-sm">Click the image to change your avatar</p>
              </div>
            </div>

            {/* Status Section */}
            <div>
              <label className="block text-gray-300 mb-2">Custom Status</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customStatus}
                  onChange={(e) => setCustomStatus(e.target.value)}
                  placeholder="Set your status..."
                  className="flex-1 bg-gray-700 rounded px-3 py-2 text-white"
                  maxLength={50}
                />
                <button
                  onClick={() => {
                    updatePresence(customStatus ? { type: 'custom', name: customStatus } : null);
                    setShowProfileSettings(false);
                  }}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Set
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Settings Modal Component
  const SettingsModal = () => {
    const [mediaPermissions, setMediaPermissions] = useState({
      microphone: 'unknown',
      camera: 'unknown',
      screenShare: 'unknown'
    });

    // Check media permissions when settings modal opens
    useEffect(() => {
      if (showSettings) {
        checkMediaPermissions();
      }
    }, [showSettings]);

    const checkMediaPermissions = async () => {
      try {
        // Check microphone permission
        const micPermission = await navigator.permissions.query({ name: 'microphone' });
        setMediaPermissions(prev => ({ ...prev, microphone: micPermission.state }));

        // Check camera permission
        const cameraPermission = await navigator.permissions.query({ name: 'camera' });
        setMediaPermissions(prev => ({ ...prev, camera: cameraPermission.state }));

        // For screen share, we can't directly check permissions, but we can test if the API is available
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          setMediaPermissions(prev => ({ ...prev, screenShare: 'granted' }));
        } else {
          setMediaPermissions(prev => ({ ...prev, screenShare: 'denied' }));
        }
      } catch (error) {
        console.log('Error checking media permissions:', error);
        // Fallback: try to access media devices to determine availability
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const hasMic = devices.some(device => device.kind === 'audioinput');
          const hasCamera = devices.some(device => device.kind === 'videoinput');
          
          setMediaPermissions(prev => ({
            ...prev,
            microphone: hasMic ? 'granted' : 'denied',
            camera: hasCamera ? 'granted' : 'denied'
          }));
        } catch (deviceError) {
          console.log('Error enumerating devices:', deviceError);
        }
      }
    };

    const getPermissionStatus = (permission) => {
      switch (permission) {
        case 'granted':
          return { color: 'bg-green-500', text: 'Available', textColor: 'text-green-400' };
        case 'denied':
          return { color: 'bg-red-500', text: 'Blocked', textColor: 'text-red-400' };
        case 'prompt':
          return { color: 'bg-yellow-500', text: 'Ask Permission', textColor: 'text-yellow-400' };
        default:
          return { color: 'bg-gray-500', text: 'Unknown', textColor: 'text-gray-400' };
      }
    };

    const requestMicrophonePermission = async () => {
      console.log('Requesting microphone permission...');
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('getUserMedia is not supported in this browser');
        }
        
        // First, check if audio devices are available
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        
        if (audioDevices.length === 0) {
          throw new Error('No microphone devices found. Please check if a microphone is connected.');
        }
        
        console.log('Found audio devices:', audioDevices.length);
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('Microphone permission granted, stream received:', stream);
        
        // Stop the stream immediately as we just needed to trigger the permission
        stream.getTracks().forEach(track => {
          track.stop();
          console.log('Stopped track:', track.kind);
        });
        
        // Recheck permissions after request
        await checkMediaPermissions();
        console.log('Permissions rechecked after microphone request');
      } catch (error) {
        console.error('Microphone permission error:', error);
        console.log('Error name:', error.name);
        console.log('Error message:', error.message);
        
        // Provide specific error messages based on error type
        if (error.name === 'NotFoundError' || error.message.includes('object can not be found')) {
          console.log('Microphone device not found - may be in use by another application');
          alert('Microphone not found. Please check if:\n• A microphone is connected\n• No other application is using the microphone\n• Microphone drivers are properly installed');
        } else if (error.name === 'NotAllowedError') {
          console.log('Microphone permission denied by user');
          alert('Microphone permission was denied. Please allow microphone access in your browser settings.');
        } else if (error.name === 'NotReadableError') {
          console.log('Microphone is being used by another application');
          alert('Microphone is currently being used by another application. Please close other applications that might be using the microphone.');
        } else {
          console.log('Unknown microphone error:', error);
          alert(`Microphone error: ${error.message || 'Unknown error occurred'}`);
        }
        
        // Recheck permissions even on error to update the UI
        await checkMediaPermissions();
      }
    };

    const requestCameraPermission = async () => {
      console.log('Requesting camera permission...');
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('getUserMedia is not supported in this browser');
        }
        
        // First, check if camera devices are available
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        if (videoDevices.length === 0) {
          throw new Error('No camera devices found. Please check if a camera is connected.');
        }
        
        console.log('Found video devices:', videoDevices.length);
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 640 },
            height: { ideal: 480 }
          } 
        });
        console.log('Camera permission granted, stream received:', stream);
        
        // Stop the stream immediately as we just needed to trigger the permission
        stream.getTracks().forEach(track => {
          track.stop();
          console.log('Stopped track:', track.kind);
        });
        
        // Recheck permissions after request
        await checkMediaPermissions();
        console.log('Permissions rechecked after camera request');
      } catch (error) {
        console.error('Camera permission error:', error);
        console.log('Error name:', error.name);
        console.log('Error message:', error.message);
        
        // Provide specific error messages based on error type
        if (error.name === 'NotFoundError' || error.message.includes('object can not be found')) {
          console.log('Camera device not found - may be in use by another application');
          alert('Camera not found. Please check if:\n• A camera is connected\n• No other application is using the camera\n• Camera drivers are properly installed');
        } else if (error.name === 'NotAllowedError') {
          console.log('Camera permission denied by user');
          alert('Camera permission was denied. Please allow camera access in your browser settings.');
        } else if (error.name === 'NotReadableError') {
          console.log('Camera is being used by another application');
          alert('Camera is currently being used by another application. Please close other applications that might be using the camera.');
        } else if (error.name === 'OverconstrainedError') {
          console.log('Camera constraints cannot be satisfied');
          alert('Camera does not support the requested settings. Trying with basic settings...');
          // Try again with basic constraints
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(track => track.stop());
            await checkMediaPermissions();
            return;
          } catch (retryError) {
            console.error('Retry with basic constraints failed:', retryError);
          }
        } else {
          console.log('Unknown camera error:', error);
          alert(`Camera error: ${error.message || 'Unknown error occurred'}`);
        }
        
        // Recheck permissions even on error to update the UI
        await checkMediaPermissions();
      }
    };

    if (!showSettings) return null;
    
    return (
      <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-surface/90 backdrop-blur-md w-full h-full max-w-4xl max-h-[90vh] rounded-lg border border-outline flex flex-col">
          {/* Settings Header */}
          <div className="p-6 border-b border-outline">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-on-surface">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-hover rounded-lg transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-on-surface-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Settings Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-8">
              {/* User Profile Section */}
              <div>
                <h3 className="text-lg font-semibold text-on-surface mb-4">User Profile</h3>
                <div className="bg-surface-variant/50 rounded-lg p-4">
                  <div className="flex items-center gap-4">
                    {user.avatar_url ? (
                      <img 
                        src={resolveAvatarUrl(user.avatar_url)} 
                        alt={user.username} 
                        className="w-16 h-16 rounded-full"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
                        <span className="text-on-secondary text-xl font-medium">
                          {user.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <h4 className="text-on-surface font-medium text-lg">{user.username}</h4>
                      <p className="text-on-surface-variant">User ID: {user.id}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Voice & Video Settings */}
              <div>
                <h3 className="text-lg font-semibold text-on-surface mb-4">Voice & Video</h3>
                <div className="bg-surface-variant/50 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface">Microphone</span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 ${getPermissionStatus(mediaPermissions.microphone).color} rounded-full`}></div>
                        <span className={`${getPermissionStatus(mediaPermissions.microphone).textColor} text-sm`}>
                          {getPermissionStatus(mediaPermissions.microphone).text}
                        </span>
                      </div>
                      {mediaPermissions.microphone !== 'granted' && (
                        <button
                          onClick={() => {
                            console.log('Microphone request button clicked');
                            requestMicrophonePermission();
                          }}
                          className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded transition-colors"
                        >
                          Request
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface">Camera</span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 ${getPermissionStatus(mediaPermissions.camera).color} rounded-full`}></div>
                        <span className={`${getPermissionStatus(mediaPermissions.camera).textColor} text-sm`}>
                          {getPermissionStatus(mediaPermissions.camera).text}
                        </span>
                      </div>
                      {mediaPermissions.camera !== 'granted' && (
                        <button
                          onClick={() => {
                            console.log('Camera request button clicked');
                            requestCameraPermission();
                          }}
                          className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded transition-colors"
                        >
                          Request
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface">Screen Share</span>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 ${getPermissionStatus(mediaPermissions.screenShare).color} rounded-full`}></div>
                      <span className={`${getPermissionStatus(mediaPermissions.screenShare).textColor} text-sm`}>
                        {getPermissionStatus(mediaPermissions.screenShare).text}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Appearance Settings */}
              <div>
                <h3 className="text-lg font-semibold text-on-surface mb-4">Appearance</h3>
                <div className="bg-surface-variant/50 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface">Theme</span>
                    <div className="flex items-center gap-2">
                      <select 
                        value={isCustomTheme ? 'custom' : currentTheme}
                        onChange={(e) => {
                          if (e.target.value === 'custom') {
                            setShowCustomThemeEditor(true);
                          } else {
                            switchTheme(e.target.value);
                          }
                        }}
                        className="bg-secondary text-on-secondary px-3 py-1 rounded"
                      >
                        {getAvailableThemes().map(theme => (
                          <option key={theme.key} value={theme.key}>
                            {theme.name}
                          </option>
                        ))}
                        <option value="custom">Custom</option>
                      </select>
                      {isCustomTheme && (
                        <button
                          onClick={() => setShowCustomThemeEditor(true)}
                          className="px-2 py-1 bg-primary hover:bg-primary-container text-on-primary text-xs rounded transition-colors"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface">Font Size</span>
                    <select className="bg-secondary text-on-secondary px-3 py-1 rounded">
                      <option>Small</option>
                      <option>Medium</option>
                      <option>Large</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Notifications Settings */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Notifications</h3>
                <div className="bg-gray-700/50 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Desktop Notifications</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Sound Notifications</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Advanced Settings */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Advanced</h3>
                <div className="bg-gray-700/50 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Developer Mode</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Hardware Acceleration</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Settings Footer */}
          <div className="p-6 border-t border-gray-700">
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Update status display component
  const renderUserStatus = (user) => {
    if (user.presence) {
      switch (user.presence.type) {
        case 'playing':
          return (
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-xs text-green-400">Playing {user.presence.name}</span>
            </div>
          );
        case 'listening':
          return (
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#1DB954]"></span>
              <span className="text-xs text-[#1DB954]">{user.presence.name}</span>
            </div>
          );
        default:
          return (
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-xs text-green-400">Online</span>
            </div>
          );
      }
    }
    return (
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-green-500"></span>
        <span className="text-xs text-green-400">Online</span>
      </div>
    );
  };

  return (
    <div className="p-4 text-on-background bg-background min-h-screen relative overflow-hidden">
      {/* User Profile & Status */}
      <div className="absolute top-4 right-4 flex items-center gap-4">
        <div className={`px-2 py-1 rounded text-sm ${
          isConnected ? 'bg-success text-on-background' : 'bg-error text-on-background'
        }`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
        <button
          onClick={logout}
          className="px-2 py-1 bg-error rounded hover:bg-hover text-on-background"
        >
          Logout
        </button>
      </div>

      <ProfileSettingsModal />
      <SettingsModal />
      {showCustomThemeEditor && (
        <CustomThemeEditor onClose={() => setShowCustomThemeEditor(false)} />
      )}

      <div className="flex flex-col flex-grow">
        <div>
          <h1 className="text-3xl font-bold mb-4 text-on-background">Jemcord</h1>
          
          
          {/* Tabs */}
          <div className="flex justify-center mb-4 border-b border-outline">
            <button
              className={`px-4 py-2 ${
                activeTab === 'servers'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => setActiveTab('servers')}
            >
              Servers
            </button>
            <button
              className={`px-4 py-2 ${
                activeTab === 'friends'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => setActiveTab('friends')}
            >
              Friends
            </button>
            <button
              className={`px-4 py-2 ${
                activeTab === 'nitro'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => setActiveTab('nitro')}
            >
              Nitro
            </button>
          </div>
        </div>

        <div className="flex h-[calc(100vh-140px)]">
          {/* Left sidebar - Servers and Channels */}
          <div className="flex flex-col h-[calc(100vh-140px)]">
            {/* Top section - Server List and Channels */}
            <div className="flex flex-1">
              {/* Server List */}
              {activeTab === 'servers' && (
                <ServerList
                  selectedServer={selectedServer}
                  onServerSelect={(server) => {
                    setSelectedServer(server);
                    setSelectedChannel(null);
                  }}
                  onServerCreate={(server) => {
                    setSelectedServer(server);
                  }}
                />
              )}

              {/* Server Channels */}
              {activeTab === 'servers' && selectedServer && (
                <ServerChannels
                  selectedServer={selectedServer}
                  selectedChannel={selectedChannel}
                  onChannelSelect={(channel) => {
                    setSelectedChannel(channel);
                    // Clear unread and mentions when selecting channel
                    setUnreadMessages(prev => {
                      const newMap = new Map(prev);
                      newMap.delete(channel.id);
                      return newMap;
                    });
                    setMentions(prev => {
                      const newMap = new Map(prev);
                      newMap.delete(channel.id);
                      return newMap;
                    });
                  }}
                  onChannelCreate={(channel) => {
                    setSelectedChannel(channel);
                  }}
                />
              )}
            </div>

            {/* Bottom section - UserBar expanding to the left */}
            <div className="flex">
              {/* UserBar - Starts from server list area and expands leftward */}
              <div className="flex-1">
                <UserBar user={user} onSettingsOpen={() => setShowSettings(true)} />
              </div>
            </div>
          </div>

          {/* Main content - Chat */}
          <div className={`flex-1 h-[calc(100vh-140px)] transition-all duration-300 bg-surface mx-2`}>
            {selectedChannel && (
              <ChatRoom 
                channelId={selectedChannel.id} 
                userId={user.id} 
                type={selectedChannel.type}
                username={user.username}
                avatar={user.avatar_url}
                serverId={selectedServer?.id}
                voiceChat={voiceChat}
                isPreview={isVoicePreview}
              />
            )}
            {!selectedChannel && activeTab === 'servers' && (
              <div className="h-full flex items-center justify-center bg-surface">
                <div className="text-on-surface-variant text-center">
                  <div className="text-4xl mb-4">💬</div>
                  <div className="text-xl font-medium">Select a channel to start chatting</div>
                  <div className="text-sm mt-2">Choose from the channels on the left</div>
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar - Server Members only */}
          {activeTab === 'servers' && selectedServer && (
            <div className={`h-[calc(100vh-140px)] bg-surface-variant transition-all duration-300 ease-in-out overflow-hidden border-l border-outline ${
              isUserListCollapsed ? 'w-0' : 'w-64'
            }`}>
              <ServerMembers 
                selectedServer={selectedServer}
                onlineUsers={onlineUsers}
              />
            </div>
          )}

          {/* Toggle button (only when showing server members) */}
          {activeTab === 'servers' && selectedServer && (
            <button 
              onClick={() => setIsUserListCollapsed(!isUserListCollapsed)}
              className="fixed right-4 top-32 p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              title={isUserListCollapsed ? "Show Users" : "Hide Users"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Main App component with ThemeProvider
export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
