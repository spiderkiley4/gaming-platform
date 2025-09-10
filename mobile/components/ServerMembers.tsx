import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Image } from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { getServerMembers } from '@/api';
import { useAuth } from '../context/AuthContext';
import { resolveAvatarUrl } from '../utils/mediaUrl';

interface Member {
  id: number;
  user_id: number;
  username: string;
  nickname?: string;
  avatar_url?: string;
  roles?: string[];
}

interface Server {
  id: number;
  name: string;
  description?: string;
  icon_url?: string;
}

interface ServerMembersProps {
  selectedServer: Server | null;
}

export default function ServerMembers({ selectedServer }: ServerMembersProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [resolvedAvatars, setResolvedAvatars] = useState<Map<string, string>>(new Map());
  const { onlineUsers } = useAuth();
  
  // Function to resolve avatar URLs with authentication
  const resolveAvatar = useCallback(async (avatarUrl: string | undefined) => {
    if (!avatarUrl) return null;
    
    const cacheKey = avatarUrl;
    if (resolvedAvatars.has(cacheKey)) {
      return resolvedAvatars.get(cacheKey);
    }
    
    try {
      const resolvedUrl = await resolveAvatarUrl(avatarUrl);
      setResolvedAvatars(prev => new Map(prev).set(cacheKey, resolvedUrl));
      return resolvedUrl;
    } catch (error) {
      console.error('Error resolving avatar URL:', error);
      return avatarUrl; // Fallback to original URL
    }
  }, [resolvedAvatars]);
  
  // Avatar component that handles async URL resolution
  const Avatar = useCallback(({ avatarUrl, size = 40, username }: { avatarUrl?: string; size?: number; username: string }) => {
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
    
    useEffect(() => {
      if (avatarUrl) {
        resolveAvatar(avatarUrl).then(url => setResolvedUrl(url || null));
      }
    }, [avatarUrl, resolveAvatar]);
    
    if (resolvedUrl) {
      return (
        <Image 
          source={{ uri: resolvedUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      );
    }
    
    return (
      <View style={{ 
        width: size, 
        height: size, 
        borderRadius: size / 2, 
        backgroundColor: '#6B7280', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: size * 0.4 }}>
          {username.charAt(0).toUpperCase()}
        </Text>
      </View>
    );
  }, [resolveAvatar]);
  
  // Theme colors
  const onlineColor = useThemeColor({}, 'online');
  const offlineColor = useThemeColor({}, 'offline');
  const playingColor = useThemeColor({}, 'playing');
  const listeningColor = useThemeColor({}, 'listening');
  const primaryColor = useThemeColor({}, 'primary');
  const primaryTextColor = useThemeColor({}, 'primaryText');

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

  const getMemberStatus = (member: Member) => {
    const onlineUser = onlineUsers.get(member.user_id.toString());
    if (onlineUser) {
      return {
        status: 'online',
        color: onlineColor,
        text: 'Online'
      };
    }
    return {
      status: 'offline',
      color: offlineColor,
      text: 'Offline'
    };
  };

  const renderUserStatus = (member: Member) => {
    const onlineUser = onlineUsers.get(member.user_id.toString());
    if (onlineUser?.presence) {
      switch (onlineUser.presence.type) {
        case 'playing':
          return (
            <View style={styles.statusContainer}>
              <View style={[styles.statusDot, { backgroundColor: playingColor }]} />
              <ThemedText style={[styles.statusText, { color: playingColor }]}>
                Playing {onlineUser.presence.name}
              </ThemedText>
            </View>
          );
        case 'listening':
          return (
            <View style={styles.statusContainer}>
              <View style={[styles.statusDot, { backgroundColor: listeningColor }]} />
              <ThemedText style={[styles.statusText, { color: listeningColor }]}>
                {onlineUser.presence.name}
              </ThemedText>
            </View>
          );
        default:
          return (
            <View style={styles.statusContainer}>
              <View style={[styles.statusDot, { backgroundColor: onlineColor }]} />
              <ThemedText style={[styles.statusText, { color: onlineColor }]}>
                Online
              </ThemedText>
            </View>
          );
      }
    }
    return (
      <View style={styles.statusContainer}>
        <View style={[styles.statusDot, { backgroundColor: onlineColor }]} />
        <ThemedText style={[styles.statusText, { color: onlineColor }]}>
          Online
        </ThemedText>
      </View>
    );
  };

  const renderMember = ({ item }: { item: Member }) => {
    const isOnline = onlineUsers.has(item.user_id.toString());
    
    return (
      <View style={[styles.memberItem, !isOnline && styles.offlineMember]}>
        <View style={styles.avatarContainer}>
          <Avatar 
            avatarUrl={item.avatar_url} 
            size={40} 
            username={item.nickname || item.username} 
          />
        </View>
        
        <View style={styles.memberInfo}>
          <ThemedText style={[styles.memberName, !isOnline && styles.offlineText]}>
            {item.nickname || item.username}
          </ThemedText>
          <View style={styles.statusContainer}>
            {renderUserStatus(item)}
          </View>
          {item.roles && item.roles.length > 0 && (
            <View style={styles.rolesContainer}>
              {item.roles.map((role, index) => (
                <View key={index} style={styles.roleBadge}>
                  <Text style={[styles.roleText, { color: primaryTextColor }]}>{role}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  if (!selectedServer) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>👥</Text>
          <ThemedText style={styles.emptyText}>Select a server to view members</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primaryColor} />
          <ThemedText style={styles.loadingText}>Loading members...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  // Group members by online status
  const onlineMembers = members.filter(member => onlineUsers.has(member.user_id.toString()));
  const offlineMembers = members.filter(member => !onlineUsers.has(member.user_id.toString()));

  const renderSection = (title: string, data: Member[], isOnline: boolean) => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>
        {title} — {data.length}
      </ThemedText>
      {data.map((member) => (
        <View key={member.id}>
          {renderMember({ item: member })}
        </View>
      ))}
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText type="title" style={styles.title}>Members</ThemedText>
        <ThemedText style={styles.memberCount}>
          {members.length} member{members.length !== 1 ? 's' : ''}
        </ThemedText>
      </View>

      {/* Members List */}
      <FlatList
        data={[]} // Empty data, we'll render sections manually
        renderItem={() => null}
        keyExtractor={() => 'empty'}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={() => (
          <View>
            {onlineMembers.length > 0 && renderSection('Online', onlineMembers, true)}
            {offlineMembers.length > 0 && renderSection('Offline', offlineMembers, false)}
            
            {members.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>👥</Text>
                <ThemedText style={styles.emptyText}>No members found</ThemedText>
              </View>
            )}
          </View>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 12,
  },
  header: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  title: {
    marginBottom: 4,
    fontSize: 18,
  },
  memberCount: {
    fontSize: 13,
    opacity: 0.7,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.7,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 6,
    borderRadius: 8,
    backgroundColor: '#374151',
    minHeight: 56,
  },
  offlineMember: {
    backgroundColor: 'rgba(55, 65, 81, 0.5)',
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
  },
  avatarInitial: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  offlineText: {
    opacity: 0.7,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 13,
  },
  rolesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  roleBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    opacity: 0.7,
  },
});
