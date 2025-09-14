import React, { useState, useEffect } from 'react';
import { getServerMembers } from '../api/index';
import { resolveAvatarUrl } from '../utils/mediaUrl';

export default function ServerMembers({ selectedServer, onlineUsers }) {
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (selectedServer) {
      fetchMembers();
    }
  }, [selectedServer]);

  const fetchMembers = async () => {
    if (!selectedServer) return;
    
    setIsLoading(true);
    try {
      const response = await getServerMembers(selectedServer.id);
      setMembers(response.data);
    } catch (error) {
      console.error('Error fetching server members:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getMemberStatus = (member) => {
    const onlineUser = onlineUsers.get(member.user_id);
    if (onlineUser) {
      return {
        status: 'online',
        color: 'bg-success',
        text: 'Online'
      };
    }
    return {
      status: 'offline',
      color: 'bg-surface-container',
      text: 'Offline'
    };
  };

  const renderUserStatus = (member) => {
    const onlineUser = onlineUsers.get(member.user_id);
    if (onlineUser?.presence) {
      switch (onlineUser.presence.type) {
        case 'playing':
          return (
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-success"></span>
              <span className="text-xs text-success">Playing {onlineUser.presence.name}</span>
            </div>
          );
        case 'listening':
          return (
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#1DB954]"></span>
              <span className="text-xs text-[#1DB954]">{onlineUser.presence.name}</span>
            </div>
          );
        default:
          return (
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-success"></span>
              <span className="text-xs text-success">Online</span>
            </div>
          );
      }
    }
    return (
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-success"></span>
        <span className="text-xs text-success">Online</span>
      </div>
    );
  };

  if (!selectedServer) {
    return (
      <div className="w-64 bg-surface h-full flex items-center justify-center">
        <div className="text-on-surface-variant text-center">
          <div className="text-2xl mb-2">👥</div>
          <div>Select a server to view members</div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-64 bg-surface h-full flex items-center justify-center">
        <div className="text-on-surface-variant">Loading members...</div>
      </div>
    );
  }

  // Group members by online status
  const onlineMembers = members.filter(member => onlineUsers.has(member.user_id));
  const offlineMembers = members.filter(member => !onlineUsers.has(member.user_id));

  return (
    <div className="w-64 bg-surface h-full flex flex-col border-l border-outline-variant">
      {/* Header */}
      <div className="p-4 border-b border-outline-variant">
        <h2 className="text-lg font-semibold text-on-surface">Members</h2>
        <div className="text-sm text-on-surface-variant">{members.length} member{members.length !== 1 ? 's' : ''}</div>
      </div>

      {/* Members List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* Online Members */}
        {onlineMembers.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              Online — {onlineMembers.length}
            </h3>
            <div className="space-y-2">
              {onlineMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-2 p-2 rounded bg-surface-variant hover:bg-surface-container transition-colors duration-200">
                  {member.avatar_url ? (
                    <img 
                      src={resolveAvatarUrl(member.avatar_url)} 
                      alt={member.username} 
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center">
                      {member.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-on-surface truncate">
                      {member.nickname || member.username}
                    </div>
                    <div className="text-xs text-on-surface-variant">
                      {renderUserStatus(member)}
                    </div>
                    {member.roles && member.roles.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {member.roles.map((role, index) => (
                          <span 
                            key={index}
                            className="px-1.5 py-0.5 bg-avatar text-xs rounded text-on-surface"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Offline Members */}
        {offlineMembers.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              Offline — {offlineMembers.length}
            </h3>
            <div className="space-y-2">
              {offlineMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-2 p-2 rounded bg-surface-variant/50 hover:bg-surface-container/50 transition-colors duration-200">
                  {member.avatar_url ? (
                    <img 
                      src={resolveAvatarUrl(member.avatar_url)} 
                      alt={member.username} 
                      className="w-8 h-8 rounded-full opacity-75"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-surface-container/75 flex items-center justify-center">
                      {member.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-on-surface-variant truncate">
                      {member.nickname || member.username}
                    </div>
                    <div className="text-xs text-on-surface-variant">Offline</div>
                    {member.roles && member.roles.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {member.roles.map((role, index) => (
                          <span 
                            key={index}
                            className="px-1.5 py-0.5 bg-avatar/75 text-xs rounded text-on-surface"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {members.length === 0 && (
          <div className="text-center text-on-surface-variant py-8">
            <div className="text-2xl mb-2">👥</div>
            <div className="text-sm">No members found</div>
          </div>
        )}
      </div>
    </div>
  );
} 