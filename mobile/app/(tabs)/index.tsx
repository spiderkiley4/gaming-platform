import { View, TextInput, TouchableOpacity, Alert, Image, ScrollView, Dimensions, Text, KeyboardAvoidingView, Platform } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { getServers } from '@/api';
import ChatRoom from '@/components/Chatroom';
import ServerList from '@/components/ServerList';
import ServerChannels from '@/components/ServerChannels';
import ServerMembers from '@/components/ServerMembers';
import SwipeView from '@/components/SwipeView';
import { useAuth } from '@/context/AuthContext';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useTheme } from '@/context/ThemeContext';
import { resolveAvatarUrl } from '@/utils/mediaUrl';

const { width: screenWidth } = Dimensions.get('window');

interface Channel {
  id: number;
  name: string;
  type: 'text' | 'voice';
}

interface Server {
  id: number;
  name: string;
  description?: string;
  icon_url?: string;
}

export default function TabOneScreen() {
  const { user, logout, socket } = useAuth();
  const { isDark } = useTheme();
  const primaryColor = useThemeColor({}, 'primary');
  const primaryTextColor = useThemeColor({}, 'primaryText');
  const textColor = useThemeColor({}, 'text');
  const errorColor = useThemeColor({}, 'error');
  const errorTextColor = useThemeColor({}, 'errorText');
  const borderColor = useThemeColor({}, 'border');
  const cardColor = useThemeColor({}, 'card');
  const backgroundColor = useThemeColor({}, 'background');
  const mutedColor = useThemeColor({}, 'muted');
  const iconColor = useThemeColor({}, 'icon');
  
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | null>(null);
  
  // Debug user state
  useEffect(() => {
    console.log('[TabOneScreen] User state changed:', {
      hasUser: !!user,
      username: user?.username,
      userId: user?.id
    });
  }, [user]);

  // Resolve avatar URL when user changes
  useEffect(() => {
    if (user?.avatar_url) {
      resolveAvatarUrl(user.avatar_url).then(url => {
        setResolvedAvatarUrl(url);
      }).catch(error => {
        console.error('Error resolving avatar URL:', error);
        setResolvedAvatarUrl(null);
      });
    } else {
      setResolvedAvatarUrl(null);
    }
  }, [user?.avatar_url]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [activeTab, setActiveTab] = useState<'servers' | 'friends' | 'nitro'>('servers');
  const [currentView, setCurrentView] = useState<'servers' | 'channels' | 'chat' | 'members'>('servers');
  const [isSwipeViewOpen, setIsSwipeViewOpen] = useState(false);
  const [isTabSwitching, setIsTabSwitching] = useState(false);
  
  // Debounced tab switching to prevent crashes
  const handleTabSwitch = useCallback((newView: 'servers' | 'channels' | 'chat' | 'members') => {
    if (isTabSwitching) return; // Prevent rapid switching
    
    setIsTabSwitching(true);
    setCurrentView(newView);
    
    // Reset the switching flag after a short delay
    setTimeout(() => {
      setIsTabSwitching(false);
    }, 100);
  }, [isTabSwitching]);
  
  // Reset swipe position when panel state changes
  useEffect(() => {
    // Only reset if we're not in the middle of a gesture
    // The gesture handler will manage the position during swipes
    if (isSwipeViewOpen) {
      swipeStartX.value = screenWidth * 0.8;
    } else {
      swipeStartX.value = 0;
    }
  }, [isSwipeViewOpen]);
  
  // Swipe gesture handling
  const swipeStartX = useSharedValue(0);
  const SWIPE_THRESHOLD = 60;

  const swipeGesture = Gesture.Pan()
    .onStart(() => {
      // Don't reset here - let it accumulate during the gesture
    })
    .onUpdate((event) => {
      // Check if it's primarily a horizontal swipe (not vertical)
      const isHorizontalSwipe = Math.abs(event.translationX) > Math.abs(event.translationY);
      
      if (isHorizontalSwipe) {
        if (event.translationX > 0 && !isSwipeViewOpen) {
          // Opening: Make it feel like you're directly dragging the panel
          const resistance = 0.8; // Slight resistance to make it feel natural
          const panelPosition = Math.min(event.translationX * resistance, screenWidth * 0.8);
          swipeStartX.value = panelPosition;
        } else if (event.translationX < 0 && isSwipeViewOpen) {
          // Closing: Panel is open, allow left swipe to close
          const resistance = 0.8;
          // Start from full open position and subtract the left swipe distance
          const panelPosition = Math.max(screenWidth * 0.8 + (event.translationX * resistance), 0);
          swipeStartX.value = panelPosition;
        } else if (event.translationX > 0 && isSwipeViewOpen) {
          // Panel is open but swiping right - keep it at full open
          swipeStartX.value = screenWidth * 0.8;
        }
      } else {
        // Reset if not horizontal swipe
        swipeStartX.value = isSwipeViewOpen ? screenWidth * 0.8 : 0;
      }
    })
    .onEnd((event) => {
      // Check if it's primarily a horizontal swipe and meets threshold
      const isHorizontalSwipe = Math.abs(event.translationX) > Math.abs(event.translationY);
      
      if (isHorizontalSwipe) {
        if (event.translationX > SWIPE_THRESHOLD && !isSwipeViewOpen) {
          // Opening threshold met
          runOnJS(setIsSwipeViewOpen)(true);
        } else if (event.translationX < -SWIPE_THRESHOLD && isSwipeViewOpen) {
          // Closing threshold met
          runOnJS(setIsSwipeViewOpen)(false);
        } else {
          // Threshold not met, snap back to current state
          swipeStartX.value = withSpring(isSwipeViewOpen ? screenWidth * 0.8 : 0, {
            damping: 20,
            stiffness: 300,
            mass: 1,
          });
        }
      } else {
        // Not a horizontal swipe, snap back to current state
        swipeStartX.value = withSpring(isSwipeViewOpen ? screenWidth * 0.8 : 0, {
          damping: 20,
          stiffness: 300,
          mass: 1,
        });
      }
    })
    .activeOffsetX([-10, 10])
    .failOffsetY([-20, 20]);

  // Show loading or redirect if no user
  if (!user) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ThemedText style={{ fontSize: 18, marginBottom: 16 }}>Not logged in</ThemedText>
        <ThemedText style={{ fontSize: 14, opacity: 0.7 }}>Redirecting to login...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: backgroundColor }}>
      <ThemedView style={{ flex: 1 }}>
        {/* Swipe View */}
        <SwipeView 
          isOpen={isSwipeViewOpen} 
          onClose={() => setIsSwipeViewOpen(false)}
          swipePosition={swipeStartX}
          enableInternalGesture={false}
        />
        
        {/* Main Content with Gesture Handler */}
        <GestureDetector gesture={swipeGesture}>
          <Animated.View style={{ flex: 1 }}>
        {/* User Profile Header */}
      <ThemedView style={{ 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: borderColor,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            onPress={() => setIsSwipeViewOpen(true)}
            style={{ padding: 4 }}
          >
            <View style={{ width: 20, height: 16, justifyContent: 'space-between' }}>
              <View style={{ 
                height: 2, 
                backgroundColor: iconColor, 
                borderRadius: 1 
              }} />
              <View style={{ 
                height: 2, 
                backgroundColor: iconColor, 
                borderRadius: 1 
              }} />
              <View style={{ 
                height: 2, 
                backgroundColor: iconColor, 
                borderRadius: 1 
              }} />
            </View>
          </TouchableOpacity>
          <ThemedText type="defaultSemiBold" style={{ fontSize: 16 }}>{user?.username}</ThemedText>
        </View>
        
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {resolvedAvatarUrl ? (
            <Image 
              source={{ uri: resolvedAvatarUrl }}
              style={{ width: 36, height: 36, borderRadius: 18 }}
              onError={(error) => {
                console.log('Avatar load error:', error);
                setResolvedAvatarUrl(null);
              }}
            />
          ) : (
            <View style={{ 
              width: 36, 
              height: 36, 
              borderRadius: 18,
              backgroundColor: primaryColor,
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ThemedText style={{ fontSize: 16, fontWeight: 'bold', color: primaryTextColor }}>
                {user?.username.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
          )}
        </View>
      </ThemedView>

      {/* Tabs */}
      <ThemedView style={{ 
        flexDirection: 'row', 
        marginHorizontal: 16,
        marginTop: 16,
        marginBottom: 16,
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: borderColor,
      }}>
        <TouchableOpacity
          style={{
            flex: 1,
            paddingVertical: 14,
            alignItems: 'center',
            backgroundColor: activeTab === 'servers' ? primaryColor : 'transparent',
          }}
          onPress={() => setActiveTab('servers')}
        >
          <ThemedText style={{ 
            color: activeTab === 'servers' ? primaryTextColor : textColor,
            fontWeight: '600',
            fontSize: 14,
          }}>
            Servers
          </ThemedText>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={{
            flex: 1,
            paddingVertical: 14,
            alignItems: 'center',
            backgroundColor: activeTab === 'friends' ? primaryColor : 'transparent',
          }}
          onPress={() => setActiveTab('friends')}
        >
          <ThemedText style={{ 
            color: activeTab === 'friends' ? primaryTextColor : textColor,
            fontWeight: '600',
            fontSize: 14,
          }}>
            Friends
          </ThemedText>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={{
            flex: 1,
            paddingVertical: 14,
            alignItems: 'center',
            backgroundColor: activeTab === 'nitro' ? primaryColor : 'transparent',
          }}
          onPress={() => setActiveTab('nitro')}
        >
          <ThemedText style={{ 
            color: activeTab === 'nitro' ? primaryTextColor : textColor,
            fontWeight: '600',
            fontSize: 14,
          }}>
            Nitro
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>

      {/* Mobile Navigation Breadcrumb */}
      {activeTab === 'servers' && (
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center', 
          paddingHorizontal: 16, 
          paddingVertical: 8,
          backgroundColor: cardColor,
          borderBottomWidth: 1,
          borderBottomColor: borderColor
        }}>
          <TouchableOpacity
            onPress={() => handleTabSwitch('servers')}
            style={{ marginRight: 8 }}
            disabled={isTabSwitching}
          >
            <ThemedText style={{ color: '#3B82F6', fontSize: 14 }}>
              {currentView === 'servers' ? 'Servers' : '← Servers'}
            </ThemedText>
          </TouchableOpacity>
          
          {selectedServer && (
            <>
              <ThemedText style={{ color: mutedColor, marginHorizontal: 4 }}>›</ThemedText>
              <TouchableOpacity
                onPress={() => handleTabSwitch('channels')}
                style={{ marginRight: 8 }}
                disabled={isTabSwitching}
              >
                <ThemedText style={{ 
                  color: currentView === 'channels' ? primaryColor : mutedColor, 
                  fontSize: 14 
                }}>
                  {currentView === 'channels' ? selectedServer.name : selectedServer.name}
                </ThemedText>
              </TouchableOpacity>
            </>
          )}
          
          {selectedChannel && (
            <>
              <ThemedText style={{ color: mutedColor, marginHorizontal: 4 }}>›</ThemedText>
              <TouchableOpacity
                onPress={() => handleTabSwitch('chat')}
                style={{ marginRight: 8 }}
                disabled={isTabSwitching}
              >
                <ThemedText style={{ 
                  color: currentView === 'chat' ? primaryColor : mutedColor, 
                  fontSize: 14 
                }}>
                  {currentView === 'chat' ? `#${selectedChannel.name}` : `#${selectedChannel.name}`}
                </ThemedText>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Main Content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'servers' ? (
          <>
            {currentView === 'servers' && (
              <ServerList
                selectedServer={selectedServer}
                onServerSelect={(server) => {
                  setSelectedServer(server);
                  setSelectedChannel(null);
                  setCurrentView('channels');
                }}
                onServerCreate={(server) => {
                  setSelectedServer(server);
                  setCurrentView('channels');
                }}
              />
            )}

            {currentView === 'channels' && selectedServer && (
              <ServerChannels
                selectedServer={selectedServer}
                selectedChannel={selectedChannel}
                onChannelSelect={(channel) => {
                  setSelectedChannel(channel);
                  setCurrentView('chat');
                }}
                onChannelCreate={(channel) => {
                  setSelectedChannel(channel);
                  setCurrentView('chat');
                }}
                onBack={() => setCurrentView('servers')}
              />
            )}

            {currentView === 'chat' && selectedChannel ? (
              <KeyboardAvoidingView 
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
              >
                <ChatRoom
                  channelId={selectedChannel.id}
                  userId={user?.id || 0}
                  type={selectedChannel.type}
                  username={user?.username || ''}
                  avatar={user?.avatar_url}
                />
              </KeyboardAvoidingView>
            ) : currentView === 'chat' ? (
              <View style={{ 
                flex: 1, 
                justifyContent: 'center', 
                alignItems: 'center',
                backgroundColor: backgroundColor
              }}>
                <Text style={{ fontSize: 32, marginBottom: 16 }}>💬</Text>
                <ThemedText style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
                  Select a channel to start chatting
                </ThemedText>
                <ThemedText style={{ fontSize: 14, opacity: 0.7 }}>
                  Choose from the channels
                </ThemedText>
              </View>
            ) : null}

            {currentView === 'members' && selectedServer && (
              <ServerMembers selectedServer={selectedServer} />
            )}
          </>
        ) : activeTab === 'friends' ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 32, marginBottom: 16 }}>👥</Text>
            <ThemedText style={{ fontSize: 18, fontWeight: '600' }}>Friends</ThemedText>
            <ThemedText style={{ fontSize: 14, opacity: 0.7, marginTop: 8 }}>
              Friends feature coming soon
            </ThemedText>
          </View>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 32, marginBottom: 16 }}>💎</Text>
            <ThemedText style={{ fontSize: 18, fontWeight: '600' }}>Nitro</ThemedText>
            <ThemedText style={{ fontSize: 14, opacity: 0.7, marginTop: 8 }}>
              Nitro features coming soon
            </ThemedText>
          </View>
        )}
      </View>

      {/* Mobile Bottom Navigation */}
      {activeTab === 'servers' && selectedServer && (
        <View style={{
          flexDirection: 'row',
          backgroundColor: cardColor,
          borderTopWidth: 1,
          borderTopColor: borderColor,
          paddingVertical: 8,
        }}>
          <TouchableOpacity
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 8,
              backgroundColor: currentView === 'channels' ? primaryColor : 'transparent',
              marginHorizontal: 4,
              borderRadius: 8,
            }}
            onPress={() => handleTabSwitch('channels')}
            disabled={isTabSwitching}
          >
            <Text style={{ fontSize: 20, marginBottom: 4 }}>📝</Text>
            <ThemedText style={{ fontSize: 12, color: currentView === 'channels' ? 'white' : mutedColor }}>
              Channels
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 8,
              backgroundColor: currentView === 'chat' ? primaryColor : 'transparent',
              marginHorizontal: 4,
              borderRadius: 8,
            }}
            onPress={() => handleTabSwitch('chat')}
            disabled={isTabSwitching}
          >
            <Text style={{ fontSize: 20, marginBottom: 4 }}>💬</Text>
            <ThemedText style={{ fontSize: 12, color: currentView === 'chat' ? 'white' : mutedColor }}>
              Chat
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 8,
              backgroundColor: currentView === 'members' ? primaryColor : 'transparent',
              marginHorizontal: 4,
              borderRadius: 8,
            }}
            onPress={() => handleTabSwitch('members')}
            disabled={isTabSwitching}
          >
            <Text style={{ fontSize: 20, marginBottom: 4 }}>👥</Text>
            <ThemedText style={{ fontSize: 12, color: currentView === 'members' ? 'white' : mutedColor }}>
              Members
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}
          </Animated.View>
        </GestureDetector>
      </ThemedView>
    </SafeAreaView>
  );
}
