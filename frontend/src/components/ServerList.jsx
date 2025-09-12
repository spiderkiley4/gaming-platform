import React, { useState, useEffect } from 'react';
import VersionDisplay from './VersionDisplay';
import { getServers, createServer, joinServerByInvite } from '../api/index';

export default function ServerList({ selectedServer, onServerSelect, onServerCreate }) {
  const [servers, setServers] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newServerDescription, setNewServerDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      const response = await getServers();
      setServers(response.data);
    } catch (error) {
      console.error('Error fetching servers:', error);
    }
  };

  const handleCreateServer = async () => {
    if (!newServerName.trim()) return;
    
    setIsLoading(true);
    try {
      const response = await createServer(newServerName.trim(), newServerDescription.trim() || undefined);
      const newServer = response.data;
      setServers(prev => [newServer, ...prev]);
      setNewServerName('');
      setNewServerDescription('');
      setShowCreateForm(false);
      onServerCreate?.(newServer);
    } catch (error) {
      console.error('Error creating server:', error);
      alert('Failed to create server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-16 bg-gray-800 h-full flex flex-col items-center py-4 border-r border-gray-700">
      {/* Server List */}
              <div className="flex-1 flex flex-col items-center space-y-3">
        {servers.map((server) => (
          <div
            key={server.id}
            className={`relative group w-12 h-12 rounded-full cursor-pointer transition-all duration-200 flex items-center justify-center ${
              selectedServer?.id === server.id
                ? 'bg-blue-600 text-white ring-2 ring-blue-400 shadow-lg'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-200 hover:scale-110 hover:shadow-lg hover:ring-2 hover:ring-gray-500'
            }`}
            onClick={() => onServerSelect(server)}
          >
            {/* Selection indicator */}
            {selectedServer?.id === server.id && (
              <div className="absolute -left-1 top-1/2 transform -translate-y-1/2 w-1 h-8 bg-white rounded-r-full animate-pulse"></div>
            )}
            {server.icon_url ? (
              <img
                src={server.icon_url}
                alt={server.name}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm">
                {server.name.charAt(0).toUpperCase()}
              </div>
            )}
            
            {/* Tooltip */}
            <div className="absolute left-16 top-1/2 transform -translate-y-1/2 bg-gray-900 text-white px-3 py-2 rounded-lg text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 shadow-xl">
              <div className="font-medium">{server.name}</div>
              {server.description && (
                <div className="text-xs text-gray-300 mt-1 max-w-48 truncate">
                  {server.description}
                </div>
              )}
              {/* Arrow */}
              <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-l-0 border-r-4 border-t-4 border-b-4 border-transparent border-r-gray-900"></div>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Join Buttons */}
      <div className="mt-4">
        <button
          onClick={() => setShowCreateForm(true)}
          className="w-12 h-12 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 hover:shadow-lg group"
          title="Create Server"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          
          {/* Tooltip */}
          <div className="absolute left-16 top-1/2 transform -translate-y-1/2 bg-gray-900 text-white px-3 py-2 rounded-lg text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 shadow-xl">
            Create Server
            <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-l-0 border-r-4 border-t-4 border-b-4 border-transparent border-r-gray-900"></div>
          </div>
        </button>
        <div className="mt-3">
          <button
            onClick={() => setShowJoinForm(true)}
            className="w-12 h-12 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 hover:shadow-lg group"
            title="Join Server"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
            <div className="absolute left-16 top-1/2 transform -translate-y-1/2 bg-gray-900 text-white px-3 py-2 rounded-lg text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 shadow-xl">
              Join Server
              <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-l-0 border-r-4 border-t-4 border-b-4 border-transparent border-r-gray-900"></div>
            </div>
          </button>
        </div>
      </div>

      {/* Version */}
      <div className="mt-4 text-xs text-gray-500 text-center opacity-75 hover:opacity-100 transition-opacity duration-200">
        v<VersionDisplay />
      </div>

      {/* Create Server Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800/70 backdrop-blur-md p-6 rounded-lg w-96 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Create Server</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 mb-2">Server Name</label>
                <input
                  type="text"
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  placeholder="Enter server name"
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  maxLength={100}
                />
              </div>
              
              <div>
                <label className="block text-gray-300 mb-2">Description (Optional)</label>
                <textarea
                  value={newServerDescription}
                  onChange={(e) => setNewServerDescription(e.target.value)}
                  placeholder="Enter server description"
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 resize-none"
                  rows={3}
                  maxLength={500}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateForm(false)}
                className="flex-1 p-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateServer}
                disabled={!newServerName.trim() || isLoading}
                className="flex-1 p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Creating...' : 'Create Server'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Server Modal */}
      {showJoinForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800/70 backdrop-blur-md p-6 rounded-lg w-96 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Join Server</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 mb-2">Invite Code</label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Enter invite code"
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowJoinForm(false)}
                className="flex-1 p-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    const res = await joinServerByInvite(inviteCode.trim());
                    const server = res.data;
                    setShowJoinForm(false);
                    setInviteCode('');
                    setServers(prev => [server, ...prev.filter(s => s.id !== server.id)]);
                    onServerSelect(server);
                  } catch (err) {
                    const errorMessage = err.response?.data?.error || 'Failed to join server. Check the code and try again.';
                    alert(errorMessage);
                    console.error('Join server error:', err);
                  }
                }}
                disabled={!inviteCode.trim()}
                className="flex-1 p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Join
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 