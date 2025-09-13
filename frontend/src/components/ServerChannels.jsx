import React, { useState, useEffect } from 'react';
import { getServerChannels, createServerChannel, createServerInvite } from '../api/index';
import { getSocket } from '../socket';
import { resolveAvatarUrl } from '../utils/mediaUrl';

export default function ServerChannels({ 
  selectedServer, 
  selectedChannel, 
  onChannelSelect, 
  onChannelCreate
}) {
  const [textChannels, setTextChannels] = useState([]);
  const [voiceChannels, setVoiceChannels] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState('text');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceActivity, setVoiceActivity] = useState({}); // { [channelId]: { count, users: [{ userId, username, avatar_url }] } }
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invite, setInvite] = useState(null);
  const [inviteOptions, setInviteOptions] = useState({ max_uses: '', expires_in: '' });

  useEffect(() => {
    if (selectedServer) {
      fetchChannels();
    }
  }, [selectedServer]);

  // Subscribe to voice activity events
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !selectedServer) return;

    const handleCounts = ({ serverId, counts, members }) => {
      if (!serverId || serverId !== selectedServer.id) return;
      const next = {};
      Object.keys(counts || {}).forEach((channelId) => {
        next[channelId] = {
          count: counts[channelId] || 0,
          users: (members && members[channelId]) || []
        };
      });
      setVoiceActivity(next);
    };

    const handleCount = ({ channelId, count, users }) => {
      setVoiceActivity(prev => ({
        ...prev,
        [channelId]: { count: count || 0, users: users || [] }
      }));
    };

    socket.on('voice_channel_counts', handleCounts);
    socket.on('voice_channel_count', handleCount);

    // Request initial counts when channels are loaded
    socket.emit('get_voice_channel_counts', { serverId: selectedServer.id });

    return () => {
      socket.off('voice_channel_counts', handleCounts);
      socket.off('voice_channel_count', handleCount);
    };
  }, [selectedServer]);

  const fetchChannels = async () => {
    if (!selectedServer) return;
    
    try {
      const [textResponse, voiceResponse] = await Promise.all([
        getServerChannels(selectedServer.id, 'text'),
        getServerChannels(selectedServer.id, 'voice')
      ]);
      
      setTextChannels(textResponse.data);
      setVoiceChannels(voiceResponse.data);
      // After channels load, request fresh voice counts
      const socket = getSocket();
      if (socket) {
        socket.emit('get_voice_channel_counts', { serverId: selectedServer.id });
      }
    } catch (error) {
      console.error('Error fetching server channels:', error);
    }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !selectedServer) return;
    
    setIsLoading(true);
    try {
      const response = await createServerChannel(
        selectedServer.id, 
        newChannelName.trim(), 
        newChannelType
      );
      const newChannel = response.data;
      
      if (newChannelType === 'text') {
        setTextChannels(prev => [...prev, newChannel]);
      } else {
        setVoiceChannels(prev => [...prev, newChannel]);
      }
      
      setNewChannelName('');
      setNewChannelType('text');
      setShowCreateForm(false);
      onChannelCreate?.(newChannel);
    } catch (error) {
      console.error('Error creating channel:', error);
      alert('Failed to create channel. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!selectedServer) {
    return (
      <div className="w-64 bg-gray-800 h-full flex items-center justify-center">
        <div className="text-gray-400 text-center">
          <div className="text-2xl mb-2">🏠</div>
          <div>Select a server to view channels</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-gray-800 h-full flex flex-col">
      {/* Server Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          {selectedServer.icon_url ? (
            <img
              src={selectedServer.icon_url}
              alt={selectedServer.name}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm">
              {selectedServer.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white truncate">{selectedServer.name}</div>
            {selectedServer.description && (
              <div className="text-sm text-gray-400 truncate">{selectedServer.description}</div>
            )}
          </div>
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
            title="Create Invite"
          >
            Invite
          </button>
        </div>
      </div>

      {/* Channels */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Text Channels */}
        {textChannels.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Text Channels
              </h3>
            </div>
            <ul className="space-y-1">
              {textChannels.map((channel) => (
                <li
                  key={channel.id}
                  className={`px-2 py-1 rounded cursor-pointer text-sm transition-colors ${
                    selectedChannel?.id === channel.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                  onClick={() => onChannelSelect({ ...channel, type: 'text' })}
                >
                  # {channel.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Voice Channels */}
        {voiceChannels.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Voice Channels
              </h3>
            </div>
            <ul className="space-y-1">
              {voiceChannels.map((channel) => {
                const activity = voiceActivity[channel.id] || { count: 0, users: [] };
                const users = activity.users || [];
                return (
                  <li
                    key={channel.id}
                    className={`px-2 py-1 rounded cursor-pointer text-sm transition-colors ${
                      selectedChannel?.id === channel.id
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                    onClick={() => onChannelSelect({ ...channel, type: 'voice' })}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onChannelSelect({ ...channel, type: 'voice', preview: true });
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="truncate">
                        🔊 {channel.name}
                      </div>
                      {activity.count > 0 && (
                        <div className="ml-2 flex items-center gap-1 text-xs text-gray-300">
                          <span className="px-1.5 py-0.5 rounded bg-gray-700">
                            {activity.count}
                          </span>
                        </div>
                      )}
                    </div>
                    {users.length > 0 && (
                      <div className="mt-1 flex -space-x-2">
                        {users.slice(0, 5).map((u, index) => (
                          <div key={`${u.userId}-${index}`} className="w-5 h-5 rounded-full ring-2 ring-gray-800 bg-gray-600 text-[10px] flex items-center justify-center overflow-hidden">
                            {u.avatar_url ? (
                              <img src={resolveAvatarUrl(u.avatar_url)} alt={u.username} className="w-full h-full object-cover" />
                            ) : (
                              <span>{u.username?.charAt(0)?.toUpperCase()}</span>
                            )}
                          </div>
                        ))}
                        {users.length > 5 && (
                          <div className="w-5 h-5 rounded-full ring-2 ring-gray-800 bg-gray-700 text-[10px] flex items-center justify-center">
                            +{users.length - 5}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Create Channel Button - Right below voice channels */}
        {voiceChannels.length > 0 && (
          <div className="px-2 py-1">
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full p-1.5 bg-gray-800/50 hover:bg-gray-700/50 text-gray-400 hover:text-gray-300 rounded text-xs transition-colors"
            >
              + Create Channel
            </button>
          </div>
        )}

        {/* Empty State */}
        {textChannels.length === 0 && voiceChannels.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <div className="text-2xl mb-2">📝</div>
            <div className="text-sm">No channels yet</div>
            <div className="text-xs mt-1">Create a channel to get started</div>
          </div>
        )}
      </div>

      {/* Create Channel Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800/70 backdrop-blur-md p-6 rounded-lg w-96 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Create Channel</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 mb-2">Channel Name</label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="Enter channel name"
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  maxLength={100}
                />
              </div>
              
              <div>
                <label className="block text-gray-300 mb-2">Channel Type</label>
                <select
                  value={newChannelType}
                  onChange={(e) => setNewChannelType(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="text">Text Channel</option>
                  <option value="voice">Voice Channel</option>
                </select>
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
                onClick={handleCreateChannel}
                disabled={!newChannelName.trim() || isLoading}
                className="flex-1 p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Creating...' : 'Create Channel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800/70 backdrop-blur-md p-6 rounded-lg w-96 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Create Invite</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 mb-2 text-sm">Max Uses (optional)</label>
                  <input
                    type="number"
                    min="1"
                    value={inviteOptions.max_uses}
                    onChange={(e) => setInviteOptions(o => ({ ...o, max_uses: e.target.value }))}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                    placeholder="e.g. 5"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 mb-2 text-sm">Expires In (sec)</label>
                  <input
                    type="number"
                    min="60"
                    step="60"
                    value={inviteOptions.expires_in}
                    onChange={(e) => setInviteOptions(o => ({ ...o, expires_in: e.target.value }))}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                    placeholder="e.g. 86400"
                  />
                </div>
              </div>
              {invite && (
                <div className="p-2 bg-gray-700 rounded text-gray-200 text-sm break-all">
                  <div className="mb-1">Invite Code:</div>
                  <div className="font-mono text-lg">{invite.code}</div>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowInviteModal(false); setInvite(null); }}
                className="flex-1 p-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={async () => {
                  try {
                    const res = await createServerInvite(selectedServer.id, {
                      max_uses: inviteOptions.max_uses ? parseInt(inviteOptions.max_uses) : undefined,
                      expires_in: inviteOptions.expires_in ? parseInt(inviteOptions.expires_in) : undefined
                    });
                    setInvite(res.data);
                  } catch (err) {
                    alert('Failed to create invite');
                    console.error(err);
                  }
                }}
                className="flex-1 p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 