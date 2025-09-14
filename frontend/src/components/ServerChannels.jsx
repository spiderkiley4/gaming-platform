import React, { useState, useEffect } from 'react';
import { getServerChannels, createServerChannel, createServerInvite, getServerInvites, deleteServerInvite } from '../api/index';
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
  const [invites, setInvites] = useState([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);

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

  const fetchInvites = async () => {
    if (!selectedServer) return;
    
    setIsLoadingInvites(true);
    try {
      const response = await getServerInvites(selectedServer.id);
      setInvites(response.data);
    } catch (error) {
      console.error('Error fetching invites:', error);
    } finally {
      setIsLoadingInvites(false);
    }
  };

  const handleDeleteInvite = async (inviteId) => {
    if (!selectedServer) return;
    
    try {
      await deleteServerInvite(selectedServer.id, inviteId);
      setInvites(prev => prev.filter(invite => invite.id !== inviteId));
    } catch (error) {
      console.error('Error deleting invite:', error);
      alert('Failed to delete invite');
    }
  };

  const handleCreateInvite = async () => {
    if (!selectedServer) return;
    
    try {
      const res = await createServerInvite(selectedServer.id, {
        max_uses: inviteOptions.max_uses ? parseInt(inviteOptions.max_uses) : undefined,
        expires_in: inviteOptions.expires_in ? parseInt(inviteOptions.expires_in) : undefined
      });
      setInvite(res.data);
      // Refresh the invites list
      fetchInvites();
    } catch (err) {
      alert('Failed to create invite');
      console.error(err);
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
      <div className="w-64 bg-surface h-full flex items-center justify-center">
        <div className="text-on-surface-variant text-center">
          <div className="text-2xl mb-2">🏠</div>
          <div>Select a server to view channels</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-surface h-full flex flex-col">
      {/* Server Header */}
      <div className="p-4 border-b border-outline-variant">
        <div className="flex items-center gap-3">
          {selectedServer.icon_url ? (
            <img
              src={selectedServer.icon_url}
              alt={selectedServer.name}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-avatar flex items-center justify-center text-avatarText font-semibold text-sm">
              {selectedServer.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-on-surface truncate">{selectedServer.name}</div>
            {selectedServer.description && (
              <div className="text-sm text-on-surface-variant truncate">{selectedServer.description}</div>
            )}
          </div>
          <button
            onClick={() => {
              setShowInviteModal(true);
              fetchInvites();
            }}
            className="px-2 py-1 text-xs bg-surface-variant hover:bg-surface-container text-on-surface-variant rounded"
            title="Manage Invites"
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
              <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                Text Channels
              </h3>
            </div>
            <ul className="space-y-1">
              {textChannels.map((channel) => (
                <li
                  key={channel.id}
                  className={`px-2 py-1 rounded cursor-pointer text-sm transition-colors ${
                    selectedChannel?.id === channel.id
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
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
              <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
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
                        ? 'bg-primary text-on-primary'
                        : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
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
                        <div className="ml-2 flex items-center gap-1 text-xs text-on-surface-variant">
                          <span className="px-1.5 py-0.5 rounded bg-surface-variant">
                            {activity.count}
                          </span>
                        </div>
                      )}
                    </div>
                    {users.length > 0 && (
                      <div className="mt-1 flex -space-x-2">
                        {users.slice(0, 5).map((u, index) => (
                          <div key={`${u.userId}-${index}`} className="w-5 h-5 rounded-full ring-2 ring-surface bg-surface-variant text-[10px] flex items-center justify-center overflow-hidden">
                            {u.avatar_url ? (
                              <img src={resolveAvatarUrl(u.avatar_url)} alt={u.username} className="w-full h-full object-cover" />
                            ) : (
                              <span>{u.username?.charAt(0)?.toUpperCase()}</span>
                            )}
                          </div>
                        ))}
                        {users.length > 5 && (
                          <div className="w-5 h-5 rounded-full ring-2 ring-surface bg-surface-container text-[10px] flex items-center justify-center">
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
              className="w-full p-1.5 bg-surface/50 hover:bg-surface-variant/50 text-on-surface-variant hover:text-on-surface rounded text-xs transition-colors"
            >
              + Create Channel
            </button>
          </div>
        )}

        {/* Empty State */}
        {textChannels.length === 0 && voiceChannels.length === 0 && (
          <div className="text-center text-on-surface-variant py-8">
            <div className="text-2xl mb-2">📝</div>
            <div className="text-sm">No channels yet</div>
            <div className="text-xs mt-1">Create a channel to get started</div>
          </div>
        )}
      </div>

      {/* Create Channel Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-surface/70 backdrop-blur-md p-6 rounded-lg w-96 border border-outline-variant">
            <h3 className="text-xl font-semibold text-on-surface mb-4">Create Channel</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-on-surface-variant mb-2">Channel Name</label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="Enter channel name"
                  className="w-full p-3 bg-surface-variant border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  maxLength={100}
                />
              </div>
              
              <div>
                <label className="block text-on-surface-variant mb-2">Channel Type</label>
                <select
                  value={newChannelType}
                  onChange={(e) => setNewChannelType(e.target.value)}
                  className="w-full p-3 bg-surface-variant border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="text">Text Channel</option>
                  <option value="voice">Voice Channel</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateForm(false)}
                className="flex-1 p-3 bg-secondary hover:bg-secondary-container text-on-secondary rounded-lg transition-colors"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateChannel}
                disabled={!newChannelName.trim() || isLoading}
                className="flex-1 p-3 bg-primary hover:bg-primary-container text-on-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Creating...' : 'Create Channel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Management Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-surface/70 backdrop-blur-md p-6 rounded-lg w-[500px] max-h-[80vh] border border-outline-variant flex flex-col">
            <h3 className="text-xl font-semibold text-on-surface mb-4">Manage Invites</h3>
            
            {/* Create New Invite Section */}
            <div className="mb-6 p-4 bg-surface-variant/50 rounded-lg">
              <h4 className="text-sm font-medium text-on-surface-variant mb-3">Create New Invite</h4>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-on-surface-variant mb-2 text-sm">Max Uses (optional)</label>
                  <input
                    type="number"
                    min="1"
                    value={inviteOptions.max_uses}
                    onChange={(e) => setInviteOptions(o => ({ ...o, max_uses: e.target.value }))}
                    className="w-full p-2 bg-surface-variant border border-outline-variant rounded text-on-surface text-sm"
                    placeholder="e.g. 5"
                  />
                </div>
                <div>
                  <label className="block text-on-surface-variant mb-2 text-sm">Expires In (sec)</label>
                  <input
                    type="number"
                    min="60"
                    step="60"
                    value={inviteOptions.expires_in}
                    onChange={(e) => setInviteOptions(o => ({ ...o, expires_in: e.target.value }))}
                    className="w-full p-2 bg-surface-variant border border-outline-variant rounded text-on-surface text-sm"
                    placeholder="e.g. 86400"
                  />
                </div>
              </div>
              {invite && (
                <div className="p-3 bg-secondary rounded text-on-secondary text-sm break-all mb-3">
                  <div className="mb-1 text-xs text-on-surface-variant">New Invite Code:</div>
                  <div className="font-mono text-lg">{invite.code}</div>
                </div>
              )}
              <button
                onClick={handleCreateInvite}
                className="w-full p-2 bg-primary hover:bg-primary-container text-on-primary rounded text-sm transition-colors"
              >
                Generate Invite
              </button>
            </div>

            {/* Existing Invites List */}
            <div className="flex-1">
              <h4 className="text-sm font-medium text-on-surface-variant mb-3">Existing Invites</h4>
              <div className="overflow-y-auto max-h-64 -mr-4 pr-4 scrollbar-thin scrollbar-thumb-surface-variant scrollbar-track-surface scrollbar-thumb-rounded-full scrollbar-track-rounded-full">
                {isLoadingInvites ? (
                  <div className="text-center text-on-surface-variant py-4">Loading invites...</div>
                ) : invites.length === 0 ? (
                  <div className="text-center text-on-surface-variant py-4">No invites created yet</div>
                ) : (
                  <div className="space-y-2">
                    {invites.map((inv) => {
                      const isExpired = inv.expires_at && new Date(inv.expires_at) < new Date();
                      const isExhausted = inv.max_uses && inv.uses >= inv.max_uses;
                      const status = isExpired ? 'expired' : isExhausted ? 'exhausted' : 'active';
                      
                      return (
                        <div key={inv.id} className="p-3 bg-surface-variant/50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="font-mono text-lg text-on-surface break-all">{inv.code}</div>
                              <div className="text-xs text-on-surface-variant mt-1">
                                Uses: {inv.uses || 0}{inv.max_uses ? `/${inv.max_uses}` : '/∞'}
                                {inv.expires_at && (
                                  <span className="ml-2">
                                    Expires: {new Date(inv.expires_at).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              <div className={`text-xs mt-1 ${
                                status === 'active' ? 'text-success' : 
                                status === 'expired' ? 'text-error' : 'text-warning'
                              }`}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteInvite(inv.id)}
                              className="ml-3 p-1.5 bg-error hover:bg-error/80 text-on-primary rounded text-xs transition-colors"
                              title="Delete invite"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { 
                  setShowInviteModal(false); 
                  setInvite(null); 
                  setInviteOptions({ max_uses: '', expires_in: '' });
                }}
                className="flex-1 p-3 bg-secondary hover:bg-secondary-container text-on-secondary rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 