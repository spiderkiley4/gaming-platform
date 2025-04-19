import { View, TextInput, TouchableOpacity, Alert, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { getChannels, createChannel } from '@/api';
import ChatRoom from '@/components/Chatroom';
import { useAuth } from '@/context/AuthContext';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

interface Channel {
  id: number;
  name: string;
  type: 'text' | 'voice';
}

export default function IndexScreen() {
  const { user, logout, socket } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [unreadMessages, setUnreadMessages] = useState<Map<number, number>>(new Map());
  const [mentions, setMentions] = useState<Map<number, number>>(new Map());
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      console.log('Socket connected');
      setIsConnected(true);
      // Refresh channels on reconnect
      getChannels().then((res) => setChannels(res.data));
    };

    const handleDisconnect = () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    };

    const handleNewChannel = (channel: Channel) => {
      console.log('New channel:', channel);
      setChannels(prev => [...prev, channel]);
      Alert.alert('New Channel', `${channel.type === 'voice' ? '🔊' : '#'} ${channel.name} has been created`);
    };

    const handleMessage = (message: any) => {
      if (message.channel_id !== selectedChannel?.id) {
        // Update unread count
        setUnreadMessages(prev => {
          const newMap = new Map(prev);
          const currentCount = newMap.get(message.channel_id) || 0;
          newMap.set(message.channel_id, currentCount + 1);
          return newMap;
        });

        // Check for mentions
        const mentionRegex = new RegExp(`@${user?.username}\\b`, 'i');
        if (mentionRegex.test(message.content)) {
          setMentions(prev => {
            const newMap = new Map(prev);
            const currentCount = newMap.get(message.channel_id) || 0;
            newMap.set(message.channel_id, currentCount + 1);
            return newMap;
          });

          // Show notification
          Alert.alert(
            `${message.username} mentioned you in ${message.channel_name}`,
            message.content,
            [{ text: 'View', onPress: () => setSelectedChannel({ id: message.channel_id, name: message.channel_name, type: 'text' }) }]
          );
        }
      }
    };

    // Set up event listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('new_channel', handleNewChannel);
    socket.on('new_message', handleMessage);

    // Initial channel fetch
    getChannels().then((res) => setChannels(res.data));

    // Initial connection state
    setIsConnected(socket.connected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('new_channel', handleNewChannel);
      socket.off('new_message', handleMessage);
    };
  }, [socket, selectedChannel?.id, user?.username]);

  useEffect(() => {
    if (!socket || !selectedChannel) return;
    
    // Join the selected channel
    if (selectedChannel.type === 'text') {
      socket.emit('join_channel', selectedChannel.id);
    }
  }, [socket, selectedChannel]);

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    try {
      await createChannel(newChannelName.trim(), newChannelType);
      setNewChannelName('');
      setShowForm(false);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Could not create channel');
    }
  };

  return (
    <ThemedView style={{ flex: 1, padding: 20, backgroundColor: '#1F2937' }}>
      {/* User Profile Header */}
      <ThemedView style={{ 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 20,
        padding: 10,
        backgroundColor: '#374151',
        borderRadius: 10
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {user?.avatar_url ? (
            <Image 
              source={{ uri: user.avatar_url }}
              style={{ width: 40, height: 40, borderRadius: 20 }}
            />
          ) : (
            <View style={{ 
              width: 40, 
              height: 40, 
              borderRadius: 20,
              backgroundColor: '#5c6676',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ThemedText style={{ fontSize: 18, fontWeight: 'bold' }}>
                {user?.username.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
          )}
          <View>
            <ThemedText style={{ fontWeight: 'bold' }}>{user?.username}</ThemedText>
            <ThemedText style={{ fontSize: 12, color: isConnected ? '#10B981' : '#EF4444' }}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </ThemedText>
          </View>
        </View>
        
        <TouchableOpacity
          onPress={logout}
          style={{
            backgroundColor: '#DC2626',
            padding: 8,
            borderRadius: 8,
          }}
        >
          <ThemedText style={{ color: 'white' }}>Logout</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <ThemedView style={{ flex: 1, backgroundColor: '#1F2937' }}>
        {/* Channel List */}
        {!selectedChannel ? (
          <>
            <ThemedText type="title" style={{ marginBottom: 20 }}>Channels</ThemedText>
            
            {channels.map((channel) => (
              <TouchableOpacity
                key={channel.id}
                style={{
                  backgroundColor: '#374151',
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
                onPress={() => {
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
              >
                <ThemedText style={{ marginLeft: 8 }}>
                  {channel.type === 'voice' ? '🔊 ' : '# '}{channel.name}
                </ThemedText>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(mentions.get(channel.id) ?? 0) > 0 && (
                    <View style={{ backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12 }}>
                      <ThemedText style={{ color: 'white', fontSize: 12 }}>
                        @{mentions.get(channel.id)}
                      </ThemedText>
                    </View>
                  )}
                  {!(mentions.get(channel.id) ?? 0) && (unreadMessages.get(channel.id) ?? 0) > 0 && (
                    <View style={{ backgroundColor: '#3B82F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12 }}>
                      <ThemedText style={{ color: 'white', fontSize: 12 }}>
                        {unreadMessages.get(channel.id)}
                      </ThemedText>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}

            {/* Channel Creation Form */}
            <TouchableOpacity
              style={{
                backgroundColor: '#3B82F6',
                padding: 12,
                borderRadius: 8,
                alignItems: 'center',
                marginTop: 12
              }}
              onPress={() => setShowForm(!showForm)}
            >
              <ThemedText style={{ color: 'white' }}>
                {showForm ? 'Cancel' : 'Create Channel'}
              </ThemedText>
            </TouchableOpacity>

            {showForm && (
              <ThemedView style={{ marginTop: 12, gap: 8 }}>
                <TextInput
                  style={{
                    backgroundColor: '#374151',
                    padding: 12,
                    borderRadius: 8,
                    color: 'white'
                  }}
                  placeholder="Channel name"
                  placeholderTextColor="#9CA3AF"
                  value={newChannelName}
                  onChangeText={setNewChannelName}
                />
                
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 8,
                      alignItems: 'center',
                      backgroundColor: newChannelType === 'text' ? '#3B82F6' : '#374151'
                    }}
                    onPress={() => setNewChannelType('text')}
                  >
                    <ThemedText style={{ color: 'white' }}>Text</ThemedText>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 8,
                      alignItems: 'center',
                      backgroundColor: newChannelType === 'voice' ? '#3B82F6' : '#374151'
                    }}
                    onPress={() => setNewChannelType('voice')}
                  >
                    <ThemedText style={{ color: 'white' }}>Voice</ThemedText>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={{
                    backgroundColor: '#059669',
                    padding: 12,
                    borderRadius: 8,
                    alignItems: 'center'
                  }}
                  onPress={handleCreateChannel}
                >
                  <ThemedText style={{ color: 'white' }}>Create</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            )}
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
              <TouchableOpacity
                onPress={() => setSelectedChannel(null)}
                style={{ marginRight: 12 }}
              >
                <ThemedText style={{ color: '#3B82F6' }}>← Back</ThemedText>
              </TouchableOpacity>
              <ThemedText type="title">
                {selectedChannel.type === 'voice' ? '🔊 ' : '# '}{selectedChannel.name}
              </ThemedText>
            </View>
            
            <ChatRoom
              channelId={selectedChannel.id}
              userId={user?.id || 0}
              type={selectedChannel.type}
              username={user?.username || ''}
              avatar={user?.avatar_url}
            />
          </>
        )}
      </ThemedView>
    </ThemedView>
  );
}