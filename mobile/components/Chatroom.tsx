import { useEffect, useState, useCallback, useRef } from 'react';
import { View, TextInput, Button, FlatList, Text, KeyboardAvoidingView, Platform, AppState } from 'react-native';
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
  const flatListRef = useRef<FlatList>(null);
  const [userScrolled, setUserScrolled] = useState(false);

  const setupSocket = useCallback(() => {
    if (socket?.connected) {
      return socket;
    }

    if (socket) {
      socket.connect();
      return socket;
    }

    const newSocket = io(API_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket'],
      forceNew: false
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      newSocket.emit('join_channel', channelId);
      getMessages(channelId).then((res) => setMessages(res.data));
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    newSocket.on('new_message', (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
      if (!userScrolled) {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    });

    setSocket(newSocket);
    return newSocket;
  }, [channelId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && socket?.disconnected) {
        console.log('App active, reconnecting socket');
        socket.connect();
      } else if (nextAppState === 'background') {
        console.log('App in background, disconnecting socket');
        socket?.disconnect();
      }
    });

    if (!socket) {
      setupSocket();
    }

    return () => {
      subscription.remove();
      socket?.disconnect();
    };
  }, [setupSocket, socket]);

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

  const isCloseToBottom = ({ layoutMeasurement, contentOffset, contentSize }: any) => {
    const paddingToBottom = 20;
    return layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id.toString()}
        style={{ flex: 1 }}
        onScroll={({ nativeEvent }) => {
          setUserScrolled(!isCloseToBottom(nativeEvent));
        }}
        onContentSizeChange={() => {
          if (!userScrolled) {
            flatListRef.current?.scrollToEnd({ animated: true });
          }
        }}
        renderItem={({ item }) => (
          <View style={{
            borderWidth: 1,
            borderColor: '#4a5565',
            padding: 8,
            marginBottom: 10,
            backgroundColor: '#364153',
            borderRadius: 5,
          }}>
            <View style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between',
              marginBottom: 4,
            }}>
              <Text style={{ color: '#9ca3af', fontSize: 12 }}>
                User #{item.user_id}
              </Text>
              <Text style={{ color: '#9ca3af', fontSize: 12 }}>
                {new Date(item.created_at).toLocaleTimeString()}
              </Text>
            </View>
            <Text style={{ color: 'white' }}>{item.content}</Text>
          </View>
        )}
      />
      <TextInput
        value={messageInput}
        style={{
          color: 'white',
          borderWidth: 1,
          borderColor: '#ccc',
          padding: 8,
          marginBottom: 10,
          backgroundColor: '#333',
          borderRadius: 5,
        }}
        placeholderTextColor="#ccc"
        onChangeText={setMessageInput}
        placeholder="Type a message"
        onSubmitEditing={sendMessage}
      />
      <Button title="Send" onPress={sendMessage} />
    </KeyboardAvoidingView>
  );
}
