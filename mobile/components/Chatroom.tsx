import { useEffect, useState } from 'react';
import { View, TextInput, Button, FlatList, Text } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { getMessages, API_URL } from '../api';

interface Message {
  id: number;
  content: string;
  user_id: number;
  channel_id: number;
  created_at: string;
}

interface Props {
  channelId: number;
  userId: number;
}

export default function ChatRoom({ channelId, userId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io(API_URL);
    setSocket(newSocket);

    newSocket.emit('join_channel', channelId);

    getMessages(channelId).then((res) => setMessages(res.data));

    newSocket.on('new_message', (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [channelId]);

  const sendMessage = () => {
    if (messageInput.trim() && socket) {
      socket.emit('send_message', {
        content: messageInput,
        userId,
        channelId
      });
      setMessageInput('');
    }
  };

  return (
    <View>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <Text>{item.content}</Text>}
      />
      <TextInput
        value={messageInput}
        onChangeText={setMessageInput}
        placeholder="Type a message"
        onSubmitEditing={sendMessage}
      />
      <Button title="Send" onPress={sendMessage} />
    </View>
  );
}
