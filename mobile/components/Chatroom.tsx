import { useEffect, useState, useCallback, useRef } from 'react';
import { View, TextInput, Button, FlatList, TouchableOpacity, Image, Platform, KeyboardAvoidingView, AppState, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { getMessages, API_URL } from '../api';
import { ThemedText } from './ThemedText';
import { useVoiceChat } from '../hooks/useVoiceChat';
import { useAuth } from '@/context/AuthContext';

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
  const flatListRef = useRef<FlatList>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const { socket } = useAuth();
  const { 
    isMuted, 
    isConnected, 
    peers, 
    startVoiceChat, 
    toggleMute, 
    disconnect 
  } = useVoiceChat(channelId, socket);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  useEffect(() => {
    if (messageInput && !userScrolled) {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [messageInput, userScrolled]);

  useEffect(() => {
    if (!socket || type !== 'text') return;

    // Join channel and fetch messages
    socket.emit('join_channel', channelId);
    getMessages(channelId).then((res) => {
      setMessages(res.data);
      flatListRef.current?.scrollToEnd({ animated: false });
    });

    // Listen for new messages
    socket.on('new_message', (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
      if (!userScrolled) {
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        });
      }
    });

    return () => {
      socket.off('new_message');
    };
  }, [channelId, type, socket, userScrolled]);

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

    return () => {
      subscription.remove();
      socket?.disconnect();
      if (type === 'voice') {
        disconnect();
      }
    };
  }, [socket, type, disconnect]);

  useEffect(() => {
    if (!socket) return;
    
    const handleConnect = () => setIsSocketConnected(true);
    const handleDisconnect = () => setIsSocketConnected(false);
    
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket]);

  const sendMessage = () => {
    if (messageInput.trim() && socket) {
      socket.emit('send_message', {
        content: messageInput,
        channelId
      });
      setMessageInput('');
      Keyboard.dismiss();
    }
  };

  const isCloseToBottom = ({ layoutMeasurement, contentOffset, contentSize }: any) => {
    const paddingToBottom = 20;
    return layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
  };

  const scrollToBottom = useCallback((animated = true) => {
    if (!userScrolled) {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated });
      });
    }
  }, [userScrolled]);

  const renderMessage = useCallback(({ item }: { item: Message }) => (
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
  ), [userId]);

  if (type === 'voice') {
    return (
      <View style={{ flex: 1, padding: 20, backgroundColor: '#1F2937' }}>
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
    <View style={{ flex: 1, backgroundColor: '#1F2937' }}>
      <View style={{ flex: 1, backgroundColor: '#1F2937', paddingHorizontal: 8 }}>
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
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          renderItem={renderMessage}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={10}
        />
        <View style={{ 
          flexDirection: 'row', 
          gap: 8,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 0 : 8,
          borderTopWidth: 1,
          borderTopColor: '#4a5565',
          backgroundColor: '#1F2937'
        }}>
          <TextInput
            value={messageInput}
            style={{
              flex: 1,
              color: 'white',
              padding: 12,
              backgroundColor: '#374151',
              borderRadius: 8,
              maxHeight: 100,
            }}
            placeholderTextColor="#9CA3AF"
            onChangeText={setMessageInput}
            placeholder="Type a message"
            onSubmitEditing={sendMessage}
            multiline
            maxLength={1000}
            returnKeyType="send"
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
      </View>
    </View>
  );
}
