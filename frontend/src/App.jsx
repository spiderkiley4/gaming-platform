import { useEffect, useState } from 'react';
import { getChannels, createChannel } from './api';
import { API_URL } from './api';  // Add API_URL import
import ChatRoom from './ChatRoom';
import { initSocket, getSocket } from './socket';
import AuthForms from './components/AuthForms';
import { useAuth } from './context/AuthContext';
import VersionDisplay from './components/VersionDisplay';
import { useVoiceChat } from './hooks/useVoiceChat';

export default function App() {
  const { user, logout, setUser } = useAuth();
  const [textChannels, setTextChannels] = useState([]);
  const [voiceChannels, setVoiceChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newChannelType, setNewChannelType] = useState('text');
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('friends');
  const [onlineUsers, setOnlineUsers] = useState(new Map());
  const [offlineUsers, setOfflineUsers] = useState(new Map());
  const [isUserListCollapsed, setIsUserListCollapsed] = useState(false);
  
  const socket = getSocket();
  const { peers, isMuted, isConnected: isVoiceConnected } = useVoiceChat(selectedChannel?.id || 0, socket);

  // Fetch channels on initial load
  useEffect(() => {
    if (user) {
      Promise.all([
        getChannels('text'),
        getChannels('voice')
      ]).then(([textRes, voiceRes]) => {
        setTextChannels(textRes.data);
        setVoiceChannels(voiceRes.data);
      });
    }
  }, [user]);

  // Set up WebSocket connections
  useEffect(() => {
    if (!user) return;

    const socket = getSocket();
    if (!socket) {
      console.log('No socket connection available');
      return;
    }

    // Ensure socket is connected before setting up listeners
    const setupSocketListeners = () => {
      console.log('Setting up socket listeners');
      setIsConnected(true);

      socket.emit('get_online_users'); // Request current online users

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

      socket.on('new_channel', (channel) => {
        if (channel.type === 'text') {
          setTextChannels(prev => [...prev, channel]);
        } else if (channel.type === 'voice') {
          setVoiceChannels(prev => [...prev, channel]);
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
      socket.off('new_channel');
    };
  }, [user]);

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    try {
      await createChannel(newChannelName.trim(), newChannelType);
      setNewChannelName('');
      setShowForm(false);
    } catch (err) {
      console.error('Error creating channel', err);
    }
  };

  if (!user) {
    return <AuthForms />;
  }

  return (
    <div className="p-4 text-white bg-gray-900 min-h-screen relative overflow-hidden">
      {/* User Profile & Status */}
      <div className="absolute top-4 right-4 flex items-center gap-4">
        <div className="flex items-center gap-2 relative group">
          <label className="cursor-pointer">
            {user.avatar_url ? (
              <img 
                src={user.avatar_url} 
                alt={user.username} 
                className="w-8 h-8 rounded-full group-hover:opacity-80 transition-opacity"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center group-hover:bg-gray-500 transition-colors">
                {user.username.charAt(0).toUpperCase()}
              </div>
            )}
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
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </label>
          <span className="text-gray-300">{user.username}</span>
        </div>
        <div className={`px-2 py-1 rounded text-sm ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
        <button
          onClick={logout}
          className="px-2 py-1 bg-red-500 rounded hover:bg-red-600"
        >
          Logout
        </button>
      </div>

      <div className="flex flex-col flex-grow">
        <div>
          <h1 className="text-3xl font-bold mb-4">Jemcord</h1>
          
          
          {/* Tabs */}
          <div className="flex justify-center mb-4 border-b border-gray-700">
            <button
              className={`px-4 py-2 ${
                activeTab === 'friends'
                  ? 'border-b-2 border-blue-500 text-blue-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              onClick={() => setActiveTab('friends')}
            >
              Friends
            </button>
            <button
              className={`px-4 py-2 ${
                activeTab === 'nitro'
                  ? 'border-b-2 border-blue-500 text-blue-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              onClick={() => setActiveTab('nitro')}
            >
              Nitro
            </button>
          </div>
        </div>

        <div className="flex h-[calc(100vh-140px)]">
          {/* Left sidebar - Channels */}
          <div className="w-64 flex-shrink-0 h-[calc(100vh-140px)]">
            {/* Text Channels */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Text Channels</h2>
              <ul className="space-y-2">
                {textChannels.map((ch) => (
                  <li
                    key={ch.id}
                    className={`cursor-pointer p-2 rounded hover:bg-gray-600 ${
                      selectedChannel?.id === ch.id ? 'bg-gray-600' : 'bg-gray-700'
                    }`}
                    onClick={() => setSelectedChannel({ ...ch, type: 'text' })}
                  >
                    # {ch.name}
                  </li>
                ))}
              </ul>
            </div>

            {/* Voice Channels */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Voice Channels</h2>
              <ul className="space-y-2">
                {voiceChannels.map((ch) => (
                  <li
                    key={ch.id}
                    className={`cursor-pointer p-2 rounded hover:bg-gray-600 ${
                      selectedChannel?.id === ch.id ? 'bg-gray-600' : 'bg-gray-700'
                    }`}
                  >
                    <div onClick={() => setSelectedChannel({ ...ch, type: 'voice' })}>
                      🔊 {ch.name}
                    </div>
                    {selectedChannel?.id === ch.id && selectedChannel?.type === 'voice' && (
                      <div className="mt-2 pl-4 text-sm text-gray-400">
                        {/* Show current user if connected */}
                        {isVoiceConnected && (
                          <div className="flex items-center gap-2 py-1">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            {user.username} (You){isMuted && ' [Muted]'}
                          </div>
                        )}
                        {/* Show other participants */}
                        {Array.from(peers.values()).map((peer, index) => (
                          <div key={peer.userId} className="flex items-center gap-2 py-1">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            {peer.username}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Channel Creation */}
            <button
              className="mt-4 p-2 bg-blue-500 rounded text-white hover:bg-blue-600 w-full"
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? 'Cancel' : 'Create Channel'}
            </button>

            {showForm && (
              <div className="mt-4 space-y-2">
                <input
                  type="text"
                  className="p-2 bg-gray-700 rounded w-full"
                  placeholder="Enter channel name"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                />
                <select
                  className="p-2 bg-gray-700 rounded w-full"
                  value={newChannelType}
                  onChange={(e) => setNewChannelType(e.target.value)}
                >
                  <option value="text">Text Channel</option>
                  <option value="voice">Voice Channel</option>
                </select>
                <button
                  onClick={handleCreateChannel}
                  className="p-2 bg-green-500 rounded text-white hover:bg-green-600 w-full"
                >
                  Create Channel
                </button>
              </div>
            )}
          </div>

          {/* Main content - Chat */}
          <div className={`flex-1 h-[calc(100vh-140px)] ml-4 transition-all duration-300 ${isUserListCollapsed ? 'mr-0' : 'mr-64'}`}>
            {selectedChannel && (
              <ChatRoom 
                channelId={selectedChannel.id} 
                userId={user.id} 
                type={selectedChannel.type}
                username={user.username}
                avatar={user.avatar_url} 
              />
            )}
          </div>

          {/* Right sidebar - Users List */}
          <div className={`fixed right-0 top-28 w-64 h-screen bg-gray-800 transform transition-transform duration-300 ease-in-out ${
            isUserListCollapsed ? 'translate-x-full' : 'translate-x-0'
          } pt-4 px-4`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Users</h2>
            </div>
            <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-160px)]">
              {/* Online Users */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Online — {onlineUsers.size}</h3>
                <div className="space-y-2">
                  {Array.from(onlineUsers.values()).map(u => (
                    <div key={u.userId} className="flex items-center gap-2 p-2 rounded bg-gray-700">
                      {u.avatar_url ? (
                        <img 
                          src={u.avatar_url} 
                          alt={u.username} 
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium">{u.username}</div>
                        <div className="text-xs text-green-400">Online</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Offline Users */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Offline — {offlineUsers.size}</h3>
                <div className="space-y-2">
                  {Array.from(offlineUsers.values()).map(u => (
                    <div key={u.userId} className="flex items-center gap-2 p-2 rounded bg-gray-700/50">
                      {u.avatar_url ? (
                        <img 
                          src={u.avatar_url} 
                          alt={u.username} 
                          className="w-8 h-8 rounded-full opacity-75"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-600/75 flex items-center justify-center">
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-300">{u.username}</div>
                        <div className="text-xs text-gray-400">Offline</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Toggle button */}
          <button 
            onClick={() => setIsUserListCollapsed(!isUserListCollapsed)}
            className="fixed right-4 top-14 p-2 bg-gray-700 hover:bg-gray-600 rounded"
            title={isUserListCollapsed ? "Show Users" : "Hide Users"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
          </button>
        </div>
      </div>
      
      <VersionDisplay />
    </div>
  );
}
