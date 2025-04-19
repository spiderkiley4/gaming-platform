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

  // Socket and channel connection management
  useEffect(() => {
    if (!socket || type !== 'text') return;

    let isCurrentChannel = true;
    let retryTimeout: NodeJS.Timeout;
    const startTime = Date.now();

    console.log(`[ChatRoom ${channelId}] Initializing at ${new Date().toISOString()}`);
    console.log(`[ChatRoom ${channelId}] Initial socket state:`, {
      connected: socket.connected,
      disconnected: socket.disconnected,
      id: socket.id
    });

    // Join channel and fetch messages
    const joinChannel = () => {
      if (!isCurrentChannel) return;
      console.log(`[ChatRoom ${channelId}] Joining channel, socket state:`, {
        connected: socket.connected,
        id: socket.id,
        uptime: (Date.now() - startTime) / 1000
      });
      socket.emit('join_channel', channelId);
      
      // Fetch messages after joining
      getMessages(channelId).then((res) => {
        if (isCurrentChannel) {
          console.log(`[ChatRoom ${channelId}] Fetched ${res.data.length} messages`);
          setMessages(res.data);
          setTimeout(() => {
            if (isCurrentChannel) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }, 100);
        }
      }).catch(err => {
        console.error(`[ChatRoom ${channelId}] Error fetching messages:`, err);
      });
    };

    // Handle socket events
    const handleConnect = () => {
      console.log(`[ChatRoom ${channelId}] Socket connected. Details:`, {
        socketId: socket.id,
        uptime: (Date.now() - startTime) / 1000,
        transport: socket.io?.engine?.transport?.name
      });
      setIsSocketConnected(true);
      joinChannel();
    };

    const handleDisconnect = (reason: string) => {
      console.log(`[ChatRoom ${channelId}] Socket disconnected. Details:`, {
        reason,
        lastSocketId: socket.id,
        uptime: (Date.now() - startTime) / 1000,
        wasConnected: socket.connected,
        engineState: socket.io?.engine?.readyState
      });
      setIsSocketConnected(false);
      
      // Clear any existing retry
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      
      // Attempt to reconnect if not an intentional disconnect
      if (reason !== 'io client disconnect' && isCurrentChannel) {
        console.log(`[ChatRoom ${channelId}] Scheduling reconnection attempt...`);
        retryTimeout = setTimeout(() => {
          if (socket && !socket.connected && isCurrentChannel) {
            console.log(`[ChatRoom ${channelId}] Attempting reconnection...`);
            socket.connect();
          }
        }, 1000);
      }
    };

    // Handle new messages
    const handleNewMessage = (msg: Message) => {
      if (isCurrentChannel) {
        console.log(`[ChatRoom ${channelId}] New message received:`, {
          messageId: msg.id,
          userId: msg.user_id,
          timestamp: new Date(msg.created_at).toISOString()
        });
        setMessages((prev) => [...prev, msg]);
        if (!userScrolled) {
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 50);
        }
      }
    };

    // Set up event listeners
    if (socket.connected) {
      console.log(`[ChatRoom ${channelId}] Socket already connected, joining immediately`);
      joinChannel();
    }
    
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('new_message', handleNewMessage);
    socket.on('error', (error) => {
      console.error(`[ChatRoom ${channelId}] Socket error:`, error);
    });

    // Log periodic connection status
    const statusInterval = setInterval(() => {
      if (isCurrentChannel) {
        console.log(`[ChatRoom ${channelId}] Connection status:`, {
          connected: socket.connected,
          disconnected: socket.disconnected,
          id: socket.id,
          uptime: (Date.now() - startTime) / 1000,
          transport: socket.io?.engine?.transport?.name
        });
      }
    }, 10000);

    // Cleanup function
    return () => {
      console.log(`[ChatRoom ${channelId}] Cleaning up. Final state:`, {
        connected: socket.connected,
        disconnected: socket.disconnected,
        id: socket.id,
        uptime: (Date.now() - startTime) / 1000
      });
      isCurrentChannel = false;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      clearInterval(statusInterval);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('new_message', handleNewMessage);
      socket.off('error');
    };
  }, [channelId, type, socket, userScrolled]);

  // Remove the AppState effect that's causing disconnections
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      console.log(`[ChatRoom ${channelId}] App state changed to:`, nextAppState);
      if (nextAppState === 'active') {
        if (socket?.disconnected) {
          console.log(`[ChatRoom ${channelId}] App active, reconnecting socket`);
          socket.connect();
        }
      }
      // Don't disconnect when going to background - let socket manager handle this
    });

    return () => {
      subscription.remove();
      // Don't disconnect socket here - let socket manager handle this
      if (type === 'voice') {
        disconnect();
      }
    };
  }, [socket, type, disconnect, channelId]);

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

  const formatMessageContent = (content: string) => {
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <ThemedText
            key={index}
            style={{
              color: '#60A5FA', // text-blue-400
              backgroundColor: 'rgba(59, 130, 246, 0.2)', // bg-blue-500/20
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
              fontWeight: '500',
            }}
          >
            {part}
          </ThemedText>
        );
      }
      return <ThemedText key={index}>{part}</ThemedText>;
    });
  };

  // Update the message rendering to use the formatted content
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
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {formatMessageContent(item.content)}
      </View>
    </View>
  ), [userId]);

  if (type === 'voice') {
    return (
      <View style={{ flex: 1, padding: 20, backgroundColor: '#1F2937' }}>
        {/* Header with user info and controls */}
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center', 
          gap: 16, 
          marginBottom: 20,
          padding: 16,
          backgroundColor: '#374151',
          borderRadius: 8
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <View style={{ position: 'relative' }}>
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
                  backgroundColor: '#4B5563',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <ThemedText style={{ fontSize: 18 }}>
                    {username.charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
              )}
              {isConnected && (
                <View style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: isMuted ? '#EF4444' : '#10B981',
                  borderWidth: 2,
                  borderColor: '#1F2937'
                }} />
              )}
            </View>
            <View>
              <ThemedText style={{ fontWeight: 'bold' }}>{username} (You)</ThemedText>
              <ThemedText style={{ fontSize: 12, color: '#9CA3AF' }}>
                {isConnected ? (isMuted ? 'Muted' : 'Speaking') : 'Not Connected'}
              </ThemedText>
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={isConnected ? disconnect : startVoiceChat}
              style={{
                backgroundColor: isConnected ? '#DC2626' : '#059669',
                padding: 8,
                borderRadius: 8,
                minWidth: 100,
                alignItems: 'center'
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
                  minWidth: 80,
                  alignItems: 'center'
                }}
              >
                <ThemedText style={{ color: 'white' }}>
                  {isMuted ? 'Unmute' : 'Mute'}
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Participants list */}
        <View style={{ flex: 1, backgroundColor: '#374151', borderRadius: 8, padding: 16 }}>
          <ThemedText style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>
            Voice Channel Participants
          </ThemedText>
          
          <View style={{ flex: 1 }}>
            {isConnected && peers.size === 0 ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ThemedText style={{ color: '#9CA3AF' }}>
                  No other participants in this channel
                </ThemedText>
              </View>
            ) : !isConnected ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ThemedText style={{ color: '#9CA3AF' }}>
                  Join voice to see other participants
                </ThemedText>
              </View>
            ) : (
              <FlatList
                data={Array.from(peers.entries())}
                keyExtractor={([peerId]) => peerId}
                renderItem={({ item: [peerId, peer] }) => (
                  <View style={{ 
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 12,
                    backgroundColor: '#4B5563',
                    borderRadius: 8,
                    marginBottom: 8
                  }}>
                    <View style={{ position: 'relative' }}>
                      {peer.avatar ? (
                        <Image 
                          source={{ uri: peer.avatar }}
                          style={{ width: 32, height: 32, borderRadius: 16 }}
                        />
                      ) : (
                        <View style={{ 
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: '#374151',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <ThemedText style={{ fontSize: 14 }}>
                            {(peer.username || 'U').charAt(0).toUpperCase()}
                          </ThemedText>
                        </View>
                      )}
                      <View style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: '#10B981',
                        borderWidth: 2,
                        borderColor: '#4B5563'
                      }} />
                    </View>
                    <View>
                      <ThemedText style={{ fontWeight: '500' }}>
                        {peer.username || `User ${peerId.slice(0, 4)}`}
                      </ThemedText>
                      <ThemedText style={{ fontSize: 12, color: '#9CA3AF' }}>
                        Speaking
                      </ThemedText>
                    </View>
                  </View>
                )}
              />
            )}
          </View>
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
