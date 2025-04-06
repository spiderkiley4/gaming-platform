import { View, Text, TextInput, Button, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useEffect, useState } from 'react';
import { getChannels, createChannel, API_URL } from '@/api';
import { io } from 'socket.io-client';
import ChatRoom from '@/components/Chatroom';

interface Channel {
  id: number;
  name: string;
}

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<number | null>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [socket, setSocket] = useState<any>(null);

  useEffect(() => {
    const newSocket = io(API_URL);
    setSocket(newSocket);

    getChannels().then((res) => setChannels(res.data));

    newSocket.on('new_channel', (channel: Channel) => {
      setChannels((prev) => [...prev, channel]);
      Alert.alert('New Channel Created', `#${channel.name}`);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    try {
      await createChannel(newChannelName.trim());
      setNewChannelName('');
    } catch (err) {
      Alert.alert('Error', 'Could not create channel');
    }
  };

  return (
    <View style={{ padding: 20, marginTop: 20, backgroundColor: 'rgb(17 24 39)', flex: 1 }}>
      {selectedChannel !== null ? (
        <ChatRoom channelId={selectedChannel} userId={1} />
      ) : (
        <>
          <TextInput
            value={newChannelName}
            onChangeText={setNewChannelName}
            placeholder="New channel name"
            style={{
              color: 'white',
              borderWidth: 1,
              borderColor: '#ccc',
              padding: 8,
              marginBottom: 10,
            }}
          />
          <Button title="Create Channel" onPress={handleCreateChannel} />

          <FlatList
            data={channels}
            style={{}}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => setSelectedChannel(item.id)}>
                <Text style={{ fontSize: 18, paddingTop: 10, color: 'white' }}>
                  #{item.name}
                </Text>
              </TouchableOpacity>
            )}
          />
        </>
      )}
    </View>
  );
}
