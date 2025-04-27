import { useEffect, useState, useCallback, useRef } from 'react';
import { View, TextInput, Button, FlatList, TouchableOpacity, Image, Platform, KeyboardAvoidingView, AppState, Keyboard, TouchableWithoutFeedback, ScrollView } from 'react-native';
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

interface UserPresence {
  type: 'playing' | 'listening';
  name: string;
}

interface OnlineUser {
  userId: string;
  username: string;
  avatar_url?: string;
  status: string;
  presence?: UserPresence;
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
  const { socket, onlineUsers } = useAuth();
  const { 
    isMuted, 
    isConnected, 
    peers, 
    startVoiceChat, 
    toggleMute, 
    disconnect 
  } = useVoiceChat(channelId, socket);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const hasLoadedMessages = useRef(false);
  const isCurrentChannel = useRef(true);
  const retryTimeout = useRef<NodeJS.Timeout>();
  const channelRef = useRef(channelId);

  // Update channel ref when it changes
  useEffect(() => {
    channelRef.current = channelId;
    isCurrentChannel.current = true;
    hasLoadedMessages.current = false;
    setMessages([]);
    return () => {
      isCurrentChannel.current = false;
    };
  }, [channelId]);

  // Handle message input and scrolling
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

    const startTime = Date.now();
    console.log(`[ChatRoom ${channelId}] Initializing`);

    const joinChannelAndFetchMessages = async () => {
      if (!isCurrentChannel.current || hasLoadedMessages.current) return;
      
      console.log(`[ChatRoom ${channelId}] Joining channel`);
      socket.emit('join_channel', channelId);
      
      try {
        const res = await getMessages(channelId);
        if (isCurrentChannel.current && channelRef.current === channelId) {
          console.log(`[ChatRoom ${channelId}] Fetched messages`);
          setMessages(res.data);
          hasLoadedMessages.current = true;
          requestAnimationFrame(() => {
            if (isCurrentChannel.current && flatListRef.current) {
              flatListRef.current.scrollToEnd({ animated: false });
            }
          });
        }
      } catch (err) {
        console.error(`[ChatRoom ${channelId}] Error fetching messages:`, err);
      }
    };

    const handleNewMessage = (msg: Message) => {
      if (isCurrentChannel.current && channelRef.current === channelId) {
        setMessages((prev) => [...prev, msg]);
        if (!userScrolled) {
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 50);
        }
      }
    };

    const handleConnect = () => {
      console.log(`[ChatRoom ${channelId}] Socket connected`);
      setIsSocketConnected(true);
      if (!hasLoadedMessages.current) {
        joinChannelAndFetchMessages();
      }
    };

    const handleDisconnect = (reason: string) => {
      console.log(`[ChatRoom ${channelId}] Socket disconnected:`, reason);
      setIsSocketConnected(false);
      
      if (retryTimeout.current) {
        clearTimeout(retryTimeout.current);
      }
      
      if (reason !== 'io client disconnect' && isCurrentChannel.current) {
        retryTimeout.current = setTimeout(() => {
          if (socket && !socket.connected && isCurrentChannel.current) {
            socket.connect();
          }
        }, 1000);
      }
    };

    // Initial setup
    if (socket.connected) {
      setIsSocketConnected(true);
      if (!hasLoadedMessages.current) {
        joinChannelAndFetchMessages();
      }
    }
    
    // Set up event listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('new_message', handleNewMessage);

    // Cleanup function
    return () => {
      if (retryTimeout.current) {
        clearTimeout(retryTimeout.current);
      }
      if (channelRef.current === channelId) {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.off('new_message', handleNewMessage);
      }
    };
  }, [socket, channelId, type, userScrolled]);

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && isCurrentChannel.current) {
        if (socket?.disconnected) {
          socket.connect();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [socket]);

  // Message sending handler
  const sendMessage = () => {
    if (messageInput.trim() && socket && isCurrentChannel.current) {
      socket.emit('send_message', {
        content: messageInput,
        channelId
      });
      setMessageInput('');
      Keyboard.dismiss();
    }
  };

  const isCloseToBottom = ({ layoutMeasurement, contentOffset, contentSize }: any) => {
    const paddingToBottom = 60; // Increased threshold to prevent edge cases
    return layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
  };

  const handleScroll = useCallback(({ nativeEvent }: any) => {
    const shouldAutoScroll = isCloseToBottom(nativeEvent);
    if (shouldAutoScroll !== !userScrolled) {
      setUserScrolled(!shouldAutoScroll);
    }
  }, [userScrolled]);

  const handleContentSizeChange = useCallback(() => {
    if (!userScrolled && flatListRef.current && isCurrentChannel.current) {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
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

  const renderUserPresence = (user: OnlineUser) => {
    if (user.presence) {
      switch (user.presence.type) {
        case 'playing':
          return (
            <ThemedText style={{ fontSize: 12, color: '#10B981' }}>
              Playing {user.presence.name}
            </ThemedText>
          );
        case 'listening':
          return (
            <ThemedText style={{ fontSize: 12, color: '#1DB954' }}>
              {user.presence.name}
            </ThemedText>
          );
        default:
          return (
            <ThemedText style={{ fontSize: 12, color: '#10B981' }}>
              Online
            </ThemedText>
          );
      }
    }
    return (
      <ThemedText style={{ fontSize: 12, color: '#10B981' }}>
        Online
      </ThemedText>
    );
  };

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
              <ScrollView>
                {/* Current user */}
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
                    {avatar ? (
                      <Image 
                        source={{ uri: avatar }}
                        style={{ width: 32, height: 32, borderRadius: 16 }}
                      />
                    ) : (
                      <View style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: '#6B7280',
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

                {/* Other participants */}
                {Array.from(peers.entries()).map(([peerId, peer]) => {
                  const user = Array.from(onlineUsers.values()).find((u: OnlineUser) => u.username === peer.username);
                  return (
                    <View key={peerId} style={{ 
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
                            backgroundColor: '#6B7280',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <ThemedText style={{ fontSize: 18 }}>
                              {peer.username?.charAt(0).toUpperCase() || 'U'}
                            </ThemedText>
                          </View>
                        )}
                        <View style={{
                          position: 'absolute',
                          bottom: -2,
                          right: -2,
                          width: 14,
                          height: 14,
                          borderRadius: 7,
                          backgroundColor: '#10B981',
                          borderWidth: 2,
                          borderColor: '#1F2937'
                        }} />
                      </View>
                      <View>
                        <ThemedText style={{ fontWeight: 'bold' }}>
                          {peer.username || `User ${peerId.slice(0, 4)}`}
                        </ThemedText>
                        {user ? renderUserPresence(user) : (
                          <ThemedText style={{ fontSize: 12, color: '#9CA3AF' }}>
                            Speaking
                          </ThemedText>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
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
          onScroll={handleScroll}
          onContentSizeChange={handleContentSizeChange}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          renderItem={renderMessage}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={10}
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
            autoscrollToTopThreshold: 10
          }}
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
