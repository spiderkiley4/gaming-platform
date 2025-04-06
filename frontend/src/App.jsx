import { useEffect, useState } from 'react';
import { getChannels, createChannel } from './api'; // Add the API call for creating channels
import ChatRoom from './ChatRoom';
import socket from './socket'; // Import the singleton socket instance

export default function App() {
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [showForm, setShowForm] = useState(false); // To control form visibility
  const [isConnected, setIsConnected] = useState(false); // Connection status

  // Fetch channels on initial load
  useEffect(() => {
    getChannels().then((res) => setChannels(res.data));
  }, []);

  // Set up WebSocket connections
  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    // Handle incoming new channel event
    socket.on('new_channel', (channel) => {
      setChannels((prev) => [...prev, channel]);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('new_channel');
    };
  }, []);

  // Handle creating a new channel
  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    try {
      // Create the new channel
      const channel = await createChannel(newChannelName.trim());
      // Emit the new channel to other clients via WebSocket
      socket.emit('new_channel', channel);
      setNewChannelName('');
      setShowForm(false); // Close the form after creating the channel
    } catch (err) {
      console.error('Error creating channel', err);
    }
  };

  return (
    <div className="p-4 text-white bg-gray-900 min-h-screen relative">
      {/* Connection Status Indicator */}
      <div
        className={`absolute top-4 right-4 px-4 py-2 rounded ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`}
      >
        {isConnected ? 'Connected' : 'Disconnected'}
      </div>

      <h1 className="text-3xl font-bold mb-4">Discord (real)</h1>
      <div className="flex">
        {/* Channel List */}
        <div className="w-1/4">
          <h2 className="text-xl font-semibold mb-2">Channels</h2>
          <ul className="space-y-2">
            {channels.map((ch) => (
              <li
                key={ch.id}
                className="cursor-pointer p-2 bg-gray-700 rounded hover:bg-gray-600"
                onClick={() => setSelectedChannel(ch.id)}
              >
                #{ch.name}
              </li>
            ))}
          </ul>

          {/* New Channel Button */}
          <button
            className="mt-4 p-2 bg-blue-500 rounded text-white hover:bg-blue-600"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : 'Create Channel'}
          </button>

          {/* Channel Creation Form */}
          {showForm && (
            <div className="mt-4">
              <input
                type="text"
                className="p-2 bg-gray-700 rounded w-full mb-2"
                placeholder="Enter channel name"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
              />
              <button
                onClick={handleCreateChannel}
                className="p-2 bg-green-500 rounded text-white hover:bg-green-600"
              >
                Create Channel
              </button>
            </div>
          )}
        </div>

        {/* Chat Room */}
        <div className="w-3/4 ml-4">
          {selectedChannel && (
            <ChatRoom channelId={selectedChannel} userId={1} />
          )}
        </div>
      </div>
    </div>
  );
}
