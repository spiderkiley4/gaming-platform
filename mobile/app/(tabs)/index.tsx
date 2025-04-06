import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { getChannels } from '@/api';
import ChatRoom from '@/components/Chatroom';

interface Channel {
  id: number;
  name: string;
}

export default function HomeScreen() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<number | null>(null);

  useEffect(() => {
    getChannels().then((res) => setChannels(res.data));
  }, []);

  return (
    <View style={{ padding: 20 }}>
      {selectedChannel !== null ? (
        <ChatRoom channelId={selectedChannel} userId={1} />
      ) : (
        <FlatList
          data={channels}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => setSelectedChannel(item.id)}>
              <Text style={{ fontSize: 20 }}>#{item.name}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
