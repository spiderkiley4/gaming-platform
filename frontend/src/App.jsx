import { useEffect, useState } from 'react';
import { getChannels, createChannel } from './api';
import ChatRoom from './ChatRoom';
import { initSocket, getSocket } from './socket';
import AuthForms from './components/AuthForms';
import { useAuth } from './context/AuthContext';

export default function App() {
  const { user, logout } = useAuth();
  const [textChannels, setTextChannels] = useState([]);
  const [voiceChannels, setVoiceChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newChannelType, setNewChannelType] = useState('text');
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('friends');

  // If not authenticated, show auth forms
  if (!user) {
    return <AuthForms />;
  }

  // Fetch channels on initial load
  useEffect(() => {
    Promise.all([
      getChannels('text'),
      getChannels('voice')
    ]).then(([textRes, voiceRes]) => {
      setTextChannels(textRes.data);
      setVoiceChannels(voiceRes.data);
    });
  }, []);

  // Set up WebSocket connections
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    socket.on('new_channel', (channel) => {
      if (channel.type === 'text') {
        setTextChannels(prev => [...prev, channel]);
      } else if (channel.type === 'voice') {
        setVoiceChannels(prev => [...prev, channel]);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('new_channel');
    };
  }, []);

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

  return (
    <div className="p-4 text-white bg-gray-900 min-h-screen relative overflow-hidden">
      {/* User Profile & Status */}
      <div className="absolute top-4 right-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          {user.avatar_url ? (
            <img 
              src={user.avatar_url} 
              alt={user.username} 
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
              {user.username.charAt(0).toUpperCase()}
            </div>
          )}
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
          <div className="w-1/6 h-[calc(100vh-140px)]">
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
                    onClick={() => setSelectedChannel({ ...ch, type: 'voice' })}
                  >
                    🔊 {ch.name}
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

          <div className="w-5/6 h-[calc(100vh-140px)] ml-4">
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
        </div>
      </div>
    </div>
  );
}
