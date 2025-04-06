import { useEffect, useState } from 'react';
import { getChannels } from './api';
import ChatRoom from './ChatRoom';
import socket from './socket'; // Import the singleton socket instance

export default function App() {
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);

  useEffect(() => {
    getChannels().then((res) => setChannels(res.data));
  }, []);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    socket.on('new_channel', (channel) => {
      setChannels((prev) => [...prev, channel]);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('new_channel');
    };
  }, []);

  return (
    <div className="p-4 text-white bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-bold mb-4">Discord Clone</h1>
      <div className="flex">
        <div className="w-1/4">
          <h2 className="text-xl font-semibold mb-2">Channels</h2>
          <ul className="space-y-2">
            {channels.map((ch) => (
              <li
                key={ch.id}
                className="cursor-pointer p-2 bg-gray-100 rounded hover:bg-gray-200"
                onClick={() => setSelectedChannel(ch.id)}
              >
                #{ch.name}
              </li>
            ))}
          </ul>
        </div>
        <div className="w-3/4 ml-4">
          {selectedChannel && (
            <ChatRoom channelId={selectedChannel} userId={1} />
          )}
        </div>
      </div>
    </div>
  );
}
