import { useEffect, useState, useCallback, useRef } from 'react';
import { View, TextInput, Button, FlatList, TouchableOpacity, Image, Platform, KeyboardAvoidingView, AppState } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { getMessages, API_URL } from '../api';
import { ThemedText } from './ThemedText';
import { useVoiceChat } from '../hooks/useVoiceChat';

interface Message {
  id: number;
  content: string;
  user_id: number;
  channel_id: number;
  created_at: string;
  username?: string;
  avatar_url?: string;
}

interface Props {
  channelId: number;
  userId: number;
  type: 'text' | 'voice';
  username: string;
  avatar?: string;
}

export default function ChatRoom({ channelId, userId, type, username, avatar }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const { 
    isMuted, 
    isConnected, 
    peers, 
    startVoiceChat, 
    toggleMute, 
    disconnect 
  } = useVoiceChat(channelId, socket);

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
      if (type === 'text') {
        getMessages(channelId).then((res) => setMessages(res.data));
      }
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
  }, [channelId, type]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && socket?.disconnected) {
        console.log('App active, reconnecting socket');
        socket.connect();
      } else if (nextAppState === 'background') {
        console.log('App in background, disconnecting socket');
        socket?.disconnect();
        if (type === 'voice') {
          disconnect();
        }
      }
    });

    if (!socket) {
      setupSocket();
    }

    return () => {
      subscription.remove();
      socket?.disconnect();
      if (type === 'voice') {
        disconnect();
      }
    };
  }, [setupSocket, socket, type, disconnect]);

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

  if (type === 'voice') {
    return (
      <View style={{ flex: 1, padding: 20, backgroundColor: '#1F2937', borderRadius: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          {avatar ? (
            <Image 
              source={{ uri: avatar }}
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
                {username.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
          )}
          <ThemedText>{username}</ThemedText>
          <TouchableOpacity
            onPress={isConnected ? disconnect : startVoiceChat}
            style={{
              backgroundColor: isConnected ? '#DC2626' : '#059669',
              padding: 8,
              borderRadius: 8,
            }}
          >
            <ThemedText style={{ color: 'white' }}>
              {isConnected ? 'Disconnect' : 'Join Voice'}
            </ThemedText>
          </TouchableOpacity>
          {isConnected && (
            <TouchableOpacity
              onPress={toggleMute}
              style={{
                backgroundColor: isMuted ? '#DC2626' : '#3B82F6',
                padding: 8,
                borderRadius: 8,
              }}
            >
              <ThemedText style={{ color: 'white' }}>
                {isMuted ? 'Unmute' : 'Mute'}
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ThemedText style={{ fontSize: 16, color: '#9CA3AF' }}>
            {isConnected 
              ? `${peers.size + 1} user${peers.size + 1 !== 1 ? 's' : ''} in voice`
              : 'Click "Join Voice" to start chatting'}
          </ThemedText>
        </View>
      </View>
    );
  }

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
            backgroundColor: item.user_id === userId ? '#3B82F6' : '#364153',
            borderRadius: 8,
            maxWidth: '80%',
            alignSelf: item.user_id === userId ? 'flex-end' : 'flex-start',
          }}>
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center',
              gap: 8,
              marginBottom: 4,
            }}>
              {item.avatar_url ? (
                <Image 
                  source={{ uri: item.avatar_url }}
                  style={{ width: 24, height: 24, borderRadius: 12 }}
                />
              ) : (
                <View style={{ 
                  width: 24, 
                  height: 24, 
                  borderRadius: 12,
                  backgroundColor: '#374151',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <ThemedText style={{ fontSize: 12 }}>
                    {(item.username || `U${item.user_id}`).charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
              )}
              <ThemedText style={{ fontSize: 12, color: '#9ca3af' }}>
                {item.username || `User #${item.user_id}`}
              </ThemedText>
              <ThemedText style={{ fontSize: 12, color: '#9ca3af' }}>
                {new Date(item.created_at).toLocaleTimeString()}
              </ThemedText>
            </View>
            <ThemedText>{item.content}</ThemedText>
          </View>
        )}
      />
      <View style={{ 
        flexDirection: 'row', 
        gap: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#4a5565'
      }}>
        <TextInput
          value={messageInput}
          style={{
            flex: 1,
            color: 'white',
            padding: 12,
            backgroundColor: '#374151',
            borderRadius: 8,
          }}
          placeholderTextColor="#9CA3AF"
          onChangeText={setMessageInput}
          placeholder="Type a message"
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity
          onPress={sendMessage}
          style={{
            backgroundColor: '#3B82F6',
            padding: 12,
            borderRadius: 8,
            justifyContent: 'center'
          }}
        >
          <ThemedText style={{ color: 'white' }}>Send</ThemedText>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
