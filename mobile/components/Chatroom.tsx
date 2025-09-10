import { useEffect, useState, useCallback, useRef } from 'react';
import { View, TextInput, Button, FlatList, TouchableOpacity, Image, Platform, KeyboardAvoidingView, AppState, Keyboard, TouchableWithoutFeedback, ScrollView } from 'react-native';
import { getMessages, API_URL } from '@/api';
import { ThemedText } from './ThemedText';
import { useVoiceChat } from '../hooks/useVoiceChat';
import { useAuth } from '@/context/AuthContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { resolveAvatarUrl } from '../utils/mediaUrl';
import FileViewer from './FileViewer';

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
  const [resolvedAvatars, setResolvedAvatars] = useState<Map<string, string>>(new Map());
  const { socket, onlineUsers } = useAuth();
  
  // Function to resolve avatar URLs with authentication
  const resolveAvatar = useCallback(async (avatarUrl: string | undefined) => {
    if (!avatarUrl) return null;
    
    const cacheKey = avatarUrl;
    if (resolvedAvatars.has(cacheKey)) {
      return resolvedAvatars.get(cacheKey);
    }
    
    try {
      const resolvedUrl = await resolveAvatarUrl(avatarUrl);
      setResolvedAvatars(prev => new Map(prev).set(cacheKey, resolvedUrl));
      return resolvedUrl;
    } catch (error) {
      console.error('Error resolving avatar URL:', error);
      return avatarUrl; // Fallback to original URL
    }
  }, [resolvedAvatars]);
  
  // Function to detect media files in message content
  const detectMediaInMessage = useCallback((content: string) => {
    const mediaExtensions = /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|mkv|webm)(\?.*)?$/i;
    
    // Match both full URLs and relative paths
    const urlRegex = /(https?:\/\/[^\s]+|\/[^\s]*\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|mkv|webm)(\?.*)?)/gi;
    const urls = content.match(urlRegex) || [];
    
    return urls.filter(url => mediaExtensions.test(url));
  }, []);
  
  // Function to get media type from URL
  const getMediaType = useCallback((url: string): 'image' | 'video' => {
    const videoExtensions = /\.(mp4|mov|avi|mkv|webm)(\?.*)?$/i;
    return videoExtensions.test(url) ? 'video' : 'image';
  }, []);
  
  // Avatar component that handles async URL resolution
  const Avatar = useCallback(({ avatarUrl, size = 32, style }: { avatarUrl?: string; size?: number; style?: any }) => {
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
    
    useEffect(() => {
      if (avatarUrl) {
        resolveAvatar(avatarUrl).then(url => setResolvedUrl(url || null));
      }
    }, [avatarUrl, resolveAvatar]);
    
    if (resolvedUrl) {
      return (
        <Image 
          source={{ uri: resolvedUrl }}
          style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
        />
      );
    }
    
    return (
      <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#6B7280', alignItems: 'center', justifyContent: 'center' }, style]}>
        <ThemedText style={{ color: 'white', fontWeight: 'bold', fontSize: size * 0.4 }}>
          {username?.charAt(0).toUpperCase() || '?'}
        </ThemedText>
      </View>
    );
  }, [resolveAvatar, username]);
  
  // Theme colors - ensure they update when theme changes
  const textMutedColor = useThemeColor({}, 'textMuted');
  const playingColor = useThemeColor({}, 'playing');
  const listeningColor = useThemeColor({}, 'listening');
  const onlineColor = useThemeColor({}, 'online');
  const voiceConnectedColor = useThemeColor({}, 'voiceConnected');
  const voiceMutedColor = useThemeColor({}, 'voiceMuted');
  const voiceSpeakingColor = useThemeColor({}, 'voiceSpeaking');
  const primaryColor = useThemeColor({}, 'primary');
  const primaryTextColor = useThemeColor({}, 'primaryText');
  const backgroundColor = useThemeColor({}, 'background');
  const backgroundSecondary = useThemeColor({}, 'backgroundSecondary');
  const cardColor = useThemeColor({}, 'card');
  const cardSecondary = useThemeColor({}, 'cardSecondary');
  const borderColor = useThemeColor({}, 'border');
  const borderSecondary = useThemeColor({}, 'borderSecondary');
  const textColor = useThemeColor({}, 'text');
  const successColor = useThemeColor({}, 'success');
  const errorColor = useThemeColor({}, 'error');
  const mutedColor = useThemeColor({}, 'muted');
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

  const formatMessageContent = useCallback((content: string) => {
    const mediaUrls = detectMediaInMessage(content);
    const parts = content.split(/(@\w+)/g);
    
    // Remove media URLs from text content to avoid duplication
    let textContent = content;
    mediaUrls.forEach(url => {
      textContent = textContent.replace(url, '').trim();
    });
    
    return (
      <View>
        {/* Render text content only if there's actual text */}
        {textContent && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {parts.map((part, index) => {
              if (part.startsWith('@')) {
                return (
                  <ThemedText
                    key={index}
                    style={{
                      color: primaryTextColor,
                      backgroundColor: primaryColor,
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
            })}
          </View>
        )}
        
        {/* Render media files */}
        {mediaUrls.map((url, index) => (
          <FileViewer
            key={`media-${index}`}
            url={url}
            type={getMediaType(url)}
            style={{ marginTop: textContent ? 8 : 0 }}
          />
        ))}
      </View>
    );
  }, [primaryTextColor, primaryColor, detectMediaInMessage, getMediaType]);

  // Update the message rendering to use the formatted content
  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isCurrentUser = item.user_id === userId;
    return (
      <View style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: isCurrentUser ? backgroundSecondary : cardColor,
        borderBottomWidth: 1,
        borderBottomColor: borderColor,
        borderLeftWidth: isCurrentUser ? 3 : 0,
        borderLeftColor: isCurrentUser ? primaryColor : 'transparent',
      }}>
      {/* Avatar */}
      <View style={{ marginTop: 4 }}>
        <Avatar avatarUrl={item.avatar_url} size={32} />
      </View>

      {/* Message Content */}
      <View style={{ flex: 1 }}>
        {/* User info and timestamp */}
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
        }}>
          <ThemedText style={{ 
            fontSize: 14, 
            color: isCurrentUser ? primaryColor : textColor, 
            fontWeight: '600' 
          }}>
            {item.username || `User #${item.user_id}`}
            {isCurrentUser && ' (You)'}
          </ThemedText>
          <ThemedText style={{ fontSize: 12, color: textMutedColor }}>
            {new Date(item.created_at).toLocaleTimeString()}
          </ThemedText>
        </View>
        
        {/* Message text and media */}
        {formatMessageContent(item.content)}
      </View>
    </View>
    );
  }, [userId, backgroundSecondary, cardColor, borderColor, primaryColor, primaryTextColor, textColor, textMutedColor, formatMessageContent]);

  const renderUserPresence = useCallback((user: OnlineUser) => {
    if (user.presence) {
      switch (user.presence.type) {
        case 'playing':
          return (
            <ThemedText style={{ fontSize: 12, color: playingColor }}>
              Playing {user.presence.name}
            </ThemedText>
          );
        case 'listening':
          return (
            <ThemedText style={{ fontSize: 12, color: listeningColor }}>
              {user.presence.name}
            </ThemedText>
          );
        default:
          return (
            <ThemedText style={{ fontSize: 12, color: onlineColor }}>
              Online
            </ThemedText>
          );
      }
    }
    return (
      <ThemedText style={{ fontSize: 12, color: onlineColor }}>
        Online
      </ThemedText>
    );
  }, [playingColor, listeningColor, onlineColor]);

  if (type === 'voice') {
    return (
      <View style={{ flex: 1, padding: 20, backgroundColor: backgroundColor }}>
        {/* Header with user info and controls */}
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center', 
          gap: 16, 
          marginBottom: 20,
          padding: 16,
          backgroundColor: cardColor,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: borderColor
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <View style={{ position: 'relative' }}>
              <Avatar avatarUrl={avatar} size={40} />
              {isConnected && (
                <View style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: isMuted ? errorColor : successColor,
                  borderWidth: 2,
                  borderColor: backgroundColor
                }} />
              )}
            </View>
            <View>
              <ThemedText style={{ fontWeight: 'bold' }}>{username} (You)</ThemedText>
              <ThemedText style={{ fontSize: 12, color: textMutedColor }}>
                {isConnected ? (isMuted ? 'Muted' : 'Speaking') : 'Not Connected'}
              </ThemedText>
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={isConnected ? disconnect : startVoiceChat}
              style={{
                backgroundColor: isConnected ? errorColor : successColor,
                padding: 8,
                borderRadius: 8,
                minWidth: 100,
                alignItems: 'center'
              }}
            >
              <ThemedText style={{ color: primaryTextColor }}>
                {isConnected ? 'Disconnect' : 'Join Voice'}
              </ThemedText>
            </TouchableOpacity>
            {isConnected && (
              <TouchableOpacity
                onPress={toggleMute}
                style={{
                  backgroundColor: isMuted ? errorColor : primaryColor,
                  padding: 8,
                  borderRadius: 8,
                  minWidth: 80,
                  alignItems: 'center'
                }}
              >
                <ThemedText style={{ color: primaryTextColor }}>
                  {isMuted ? 'Unmute' : 'Mute'}
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Participants list */}
        <View style={{ flex: 1, backgroundColor: cardColor, borderRadius: 8, padding: 16, borderWidth: 1, borderColor: borderColor }}>
          <ThemedText style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>
            Voice Channel Participants
          </ThemedText>
          
          <View style={{ flex: 1 }}>
            {isConnected && peers.size === 0 ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ThemedText style={{ color: textMutedColor }}>
                  No other participants in this channel
                </ThemedText>
              </View>
            ) : !isConnected ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ThemedText style={{ color: textMutedColor }}>
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
                  backgroundColor: cardSecondary,
                  borderRadius: 8,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: borderSecondary
                }}>
                  <View style={{ position: 'relative' }}>
                    <Avatar avatarUrl={avatar} size={32} />
                    {isConnected && (
                      <View style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: isMuted ? errorColor : successColor,
                        borderWidth: 2,
                        borderColor: backgroundColor
                      }} />
                    )}
                  </View>
                  <View>
                    <ThemedText style={{ fontWeight: 'bold' }}>{username} (You)</ThemedText>
                    <ThemedText style={{ fontSize: 12, color: textMutedColor }}>
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
                      backgroundColor: cardSecondary,
                      borderRadius: 8,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: borderSecondary
                    }}>
                      <View style={{ position: 'relative' }}>
                        <Avatar avatarUrl={peer.avatar} size={32} />
                        <View style={{
                          position: 'absolute',
                          bottom: -2,
                          right: -2,
                          width: 14,
                          height: 14,
                          borderRadius: 7,
                          backgroundColor: successColor,
                          borderWidth: 2,
                          borderColor: backgroundColor
                        }} />
                      </View>
                      <View>
                        <ThemedText style={{ fontWeight: 'bold' }}>
                          {peer.username || `User ${peerId.slice(0, 4)}`}
                        </ThemedText>
                        {user ? renderUserPresence(user) : (
                          <ThemedText style={{ fontSize: 12, color: textMutedColor }}>
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
    <View style={{ flex: 1, backgroundColor: backgroundColor }}>
      <View style={{ flex: 1, backgroundColor: backgroundColor }}>
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
          showsVerticalScrollIndicator={false}
        />
        <View style={{ 
          flexDirection: 'row', 
          gap: 8,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: Platform.OS === 'ios' ? 8 : 12,
          borderTopWidth: 1,
          borderTopColor: borderColor,
          backgroundColor: backgroundColor
        }}>
          <TextInput
            value={messageInput}
            style={{
              flex: 1,
              color: textColor,
              padding: 12,
              backgroundColor: cardColor,
              borderRadius: 8,
              maxHeight: 100,
              borderWidth: 1,
              borderColor: borderColor,
            }}
            placeholderTextColor={textMutedColor}
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
              backgroundColor: primaryColor,
              padding: 12,
              borderRadius: 8,
              justifyContent: 'center'
            }}
          >
            <ThemedText style={{ color: primaryTextColor }}>Send</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
