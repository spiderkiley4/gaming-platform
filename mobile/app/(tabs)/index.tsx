import { View, TextInput, TouchableOpacity, Alert, Image } from 'react-native';
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

export default function TabOneScreen() {
  const { user, logout, socket } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');

  useEffect(() => {
    getChannels().then((res) => setChannels(res.data));

    if (socket) {
      socket.on('new_channel', (channel: Channel) => {
        setChannels(prev => [...prev, channel]);
        Alert.alert('New Channel', `#${channel.name} has been created`);
      });

      return () => {
        socket.off('new_channel');
      };
    }
  }, [socket]);

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
    <ThemedView style={{ flex: 1, padding: 20 }}>
      {/* User Profile Header */}
      <ThemedView style={{ 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 20,
        padding: 10,
        backgroundColor: '#1F2937',
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
              backgroundColor: '#374151',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ThemedText style={{ fontSize: 18, fontWeight: 'bold' }}>
                {user?.username.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
          )}
          <ThemedText type="defaultSemiBold">{user?.username}</ThemedText>
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

      <ThemedView style={{ flex: 1 }}>
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
                  alignItems: 'center'
                }}
                onPress={() => setSelectedChannel(channel)}
              >
                <ThemedText style={{ marginLeft: 8 }}>
                  {channel.type === 'voice' ? '🔊 ' : '# '}{channel.name}
                </ThemedText>
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
