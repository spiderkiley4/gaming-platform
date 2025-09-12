import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  Image,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolate,
  SharedValue,
} from 'react-native-reanimated';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { resolveAvatarUrl } from '@/utils/mediaUrl';
import ThemeToggle from './ThemeToggle';
import { useState } from 'react';

const { width: screenWidth } = Dimensions.get('window');
const SWIPE_VIEW_WIDTH = screenWidth * 0.8; // 80% of screen width
const SWIPE_THRESHOLD = 80; // Minimum swipe distance to trigger open/close

interface SwipeViewProps {
  isOpen: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  swipePosition?: SharedValue<number>;
  enableInternalGesture?: boolean;
}

export default function SwipeView({ isOpen, onClose, children, swipePosition, enableInternalGesture = true }: SwipeViewProps) {
  const translateX = useSharedValue(-SWIPE_VIEW_WIDTH);
  const backdropOpacity = useSharedValue(0);
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | null>(null);
  
  const { user, logout } = useAuth();
  const { isDark } = useTheme();
  const backgroundColor = useThemeColor({}, 'background');
  const cardColor = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');
  const textColor = useThemeColor({}, 'text');
  const primaryColor = useThemeColor({}, 'primary');
  const primaryTextColor = useThemeColor({}, 'primaryText');
  const mutedColor = useThemeColor({}, 'muted');
  const errorColor = useThemeColor({}, 'error');
  const errorTextColor = useThemeColor({}, 'errorText');

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

  // Update animation when isOpen changes
  useEffect(() => {
    if (isOpen) {
      translateX.value = withSpring(0, {
        damping: 20,
        stiffness: 300,
        mass: 1,
      });
      backdropOpacity.value = withTiming(0.5, { duration: 300 });
    } else {
      translateX.value = withSpring(-SWIPE_VIEW_WIDTH, {
        damping: 20,
        stiffness: 300,
        mass: 1,
      });
      backdropOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [isOpen]);

  const gesture = Gesture.Pan()
    .onStart(() => {
      // Store the starting position
    })
    .onUpdate((event) => {
      // Add resistance to make dragging feel more controlled
      const resistance = 0.7;
      const newTranslateX = translateX.value + (event.translationX * resistance);
      
      // Allow swiping in both directions with proper bounds
      // When closed (translateX = -SWIPE_VIEW_WIDTH), allow swiping right to open
      // When open (translateX = 0), allow swiping left to close
      translateX.value = Math.max(-SWIPE_VIEW_WIDTH, Math.min(0, newTranslateX));
      
      // Update backdrop opacity based on translateX
      const progress = Math.abs(translateX.value) / SWIPE_VIEW_WIDTH;
      backdropOpacity.value = progress * 0.5;
    })
    .onEnd((event) => {
      const currentPosition = translateX.value;
      const isCurrentlyOpen = currentPosition > -SWIPE_VIEW_WIDTH / 2;
      
      // Determine gesture direction and threshold
      const shouldOpen = event.translationX > SWIPE_THRESHOLD && !isCurrentlyOpen;
      const shouldClose = event.translationX < -SWIPE_THRESHOLD && isCurrentlyOpen;
      
      if (shouldOpen) {
        // Opening gesture
        translateX.value = withSpring(0, {
          damping: 20,
          stiffness: 300,
          mass: 1,
        });
        backdropOpacity.value = withTiming(0.5, { duration: 300 });
        runOnJS(onClose)(); // This will be called to update the parent state
      } else if (shouldClose) {
        // Closing gesture
        translateX.value = withSpring(-SWIPE_VIEW_WIDTH, {
          damping: 20,
          stiffness: 300,
          mass: 1,
        });
        backdropOpacity.value = withTiming(0, { duration: 300 });
        runOnJS(onClose)(); // This will be called to update the parent state
      } else {
        // Snap back to current state based on position
        if (currentPosition > -SWIPE_VIEW_WIDTH / 2) {
          // Snap to open
          translateX.value = withSpring(0, {
            damping: 20,
            stiffness: 300,
            mass: 1,
          });
          backdropOpacity.value = withTiming(0.5, { duration: 300 });
        } else {
          // Snap to closed
          translateX.value = withSpring(-SWIPE_VIEW_WIDTH, {
            damping: 20,
            stiffness: 300,
            mass: 1,
          });
          backdropOpacity.value = withTiming(0, { duration: 300 });
        }
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    // Use swipe position for visual feedback when swiping, otherwise use normal translateX
    if (swipePosition && swipePosition.value >= 0) {
      // During swipe gesture, show visual feedback
      // swipePosition.value represents how far the panel should be visible (0 to SWIPE_VIEW_WIDTH)
      // We need to convert this to translateX (from -SWIPE_VIEW_WIDTH to 0)
      const currentTranslateX = -SWIPE_VIEW_WIDTH + swipePosition.value;
      return {
        transform: [{ translateX: currentTranslateX }],
      };
    } else {
      // Normal panel state
      return {
        transform: [{ translateX: translateX.value }],
      };
    }
  });

  const backdropStyle = useAnimatedStyle(() => {
    // Use swipe position for backdrop opacity when swiping, otherwise use normal backdropOpacity
    if (swipePosition && swipePosition.value >= 0) {
      // During swipe gesture, show visual feedback
      const currentOpacity = Math.min(0.5, (swipePosition.value / SWIPE_VIEW_WIDTH) * 0.5);
      return {
        opacity: currentOpacity,
      };
    } else {
      // Normal backdrop state
      return {
        opacity: backdropOpacity.value,
      };
    }
  });

  const handleBackdropPress = () => {
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <Animated.View
        style={[
          styles.backdrop,
          backdropStyle,
        ]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={handleBackdropPress}
          activeOpacity={1}
        />
      </Animated.View>

      {/* Swipe View */}
      <Animated.View
        style={[
          styles.swipeView,
          {
            backgroundColor: cardColor,
            borderRightColor: borderColor,
          },
          animatedStyle,
        ]}
      >
        {enableInternalGesture ? (
          <GestureDetector gesture={gesture}>
            <Animated.View style={styles.gestureContainer}>
              {/* Header */}
            <View style={[styles.header, { borderBottomColor: borderColor }]}>
              <View style={styles.userInfo}>
                {resolvedAvatarUrl ? (
                  <Image 
                    source={{ uri: resolvedAvatarUrl }}
                    style={styles.avatar}
                    onError={() => setResolvedAvatarUrl(null)}
                  />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: primaryColor }]}>
                    <ThemedText style={[styles.avatarText, { color: primaryTextColor }]}>
                      {user?.username?.charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                )}
                <View style={styles.userDetails}>
                  <ThemedText type="defaultSemiBold" style={styles.username}>
                    {user?.username}
                  </ThemedText>
                  <ThemedText style={[styles.userStatus, { color: mutedColor }]}>
                    Online
                  </ThemedText>
                </View>
              </View>
            </View>

            {/* Menu Items */}
            <View style={styles.menuContainer}>
              <TouchableOpacity style={[styles.menuButton, { backgroundColor: isDark ? '#3B82F620' : '#3B82F615', borderColor: borderColor }]}>
                <Text style={styles.menuIcon}>👤</Text>
                <ThemedText style={styles.menuButtonText}>Profile</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.menuButton, { backgroundColor: isDark ? '#8B5CF620' : '#8B5CF615', borderColor: borderColor }]}>
                <Text style={styles.menuIcon}>⚙️</Text>
                <ThemedText style={styles.menuButtonText}>Settings</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.menuButton, { backgroundColor: isDark ? '#F59E0B20' : '#F59E0B15', borderColor: borderColor }]}>
                <Text style={styles.menuIcon}>🔔</Text>
                <ThemedText style={styles.menuButtonText}>Notifications</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.menuButton, { backgroundColor: isDark ? '#10B98120' : '#10B98115', borderColor: borderColor }]}>
                <Text style={styles.menuIcon}>🎨</Text>
                <ThemedText style={styles.menuButtonText}>Appearance</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.menuButton, { backgroundColor: isDark ? '#EF444420' : '#EF444415', borderColor: borderColor }]}>
                <Text style={styles.menuIcon}>🔒</Text>
                <ThemedText style={styles.menuButtonText}>Privacy</ThemedText>
              </TouchableOpacity>

              <View style={[styles.separator, { backgroundColor: borderColor }]} />

              <ThemeToggle />

              <TouchableOpacity 
                style={[styles.menuButton, { backgroundColor: isDark ? '#DC262630' : '#DC262625', borderColor: borderColor }]}
                onPress={logout}
              >
                <Text style={styles.menuIcon}>🚪</Text>
                <ThemedText style={[styles.menuButtonText, { color: isDark ? '#FCA5A5' : '#DC2626' }]}>
                  Logout
                </ThemedText>
              </TouchableOpacity>
            </View>

            {/* Custom Content */}
            {children && (
              <View style={styles.customContent}>
                {children}
              </View>
            )}
            </Animated.View>
          </GestureDetector>
        ) : (
          <Animated.View style={styles.gestureContainer}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: borderColor }]}>
              <View style={styles.userInfo}>
                {resolvedAvatarUrl ? (
                  <Image 
                    source={{ uri: resolvedAvatarUrl }}
                    style={styles.avatar}
                    onError={() => setResolvedAvatarUrl(null)}
                  />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: primaryColor }]}>
                    <ThemedText style={[styles.avatarText, { color: primaryTextColor }]}>
                      {user?.username?.charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                )}
                <View style={styles.userDetails}>
                  <ThemedText type="defaultSemiBold" style={styles.username}>
                    {user?.username}
                  </ThemedText>
                  <ThemedText style={[styles.userStatus, { color: mutedColor }]}>
                    Online
                  </ThemedText>
                </View>
              </View>
            </View>

            {/* Menu Items */}
            <View style={styles.menuContainer}>
              <TouchableOpacity style={[styles.menuButton, { backgroundColor: isDark ? '#3B82F620' : '#3B82F615', borderColor: borderColor }]}>
                <Text style={styles.menuIcon}>👤</Text>
                <ThemedText style={styles.menuButtonText}>Profile</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.menuButton, { backgroundColor: isDark ? '#8B5CF620' : '#8B5CF615', borderColor: borderColor }]}>
                <Text style={styles.menuIcon}>⚙️</Text>
                <ThemedText style={styles.menuButtonText}>Settings</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.menuButton, { backgroundColor: isDark ? '#F59E0B20' : '#F59E0B15', borderColor: borderColor }]}>
                <Text style={styles.menuIcon}>🔔</Text>
                <ThemedText style={styles.menuButtonText}>Notifications</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.menuButton, { backgroundColor: isDark ? '#10B98120' : '#10B98115', borderColor: borderColor }]}>
                <Text style={styles.menuIcon}>🎨</Text>
                <ThemedText style={styles.menuButtonText}>Appearance</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.menuButton, { backgroundColor: isDark ? '#EF444420' : '#EF444415', borderColor: borderColor }]}>
                <Text style={styles.menuIcon}>🔒</Text>
                <ThemedText style={styles.menuButtonText}>Privacy</ThemedText>
              </TouchableOpacity>

              <View style={[styles.separator, { backgroundColor: borderColor }]} />

              <ThemeToggle />

              <TouchableOpacity 
                style={[styles.menuButton, { backgroundColor: isDark ? '#DC262630' : '#DC262625', borderColor: borderColor }]}
                onPress={logout}
              >
                <Text style={styles.menuIcon}>🚪</Text>
                <ThemedText style={[styles.menuButtonText, { color: isDark ? '#FCA5A5' : '#DC2626' }]}>
                  Logout
                </ThemedText>
              </TouchableOpacity>
            </View>

            {/* Custom Content */}
            {children && (
              <View style={styles.customContent}>
                {children}
              </View>
            )}
          </Animated.View>
        )}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'black',
    zIndex: 998,
  },
  swipeView: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: SWIPE_VIEW_WIDTH,
    borderRightWidth: 1,
    zIndex: 999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  gestureContainer: {
    flex: 1,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    paddingTop: 60, // Account for status bar
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  userDetails: {
    flex: 1,
  },
  username: {
    fontSize: 18,
    marginBottom: 4,
  },
  userStatus: {
    fontSize: 14,
  },
  menuContainer: {
    flex: 1,
    paddingTop: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  menuIcon: {
    fontSize: 20,
    marginRight: 16,
    width: 24,
    textAlign: 'center',
  },
  menuText: {
    fontSize: 16,
    flex: 1,
  },
  menuButtonText: {
    fontSize: 16,
    flex: 1,
    fontWeight: '600',
  },
  logoutItem: {
    marginTop: 10,
  },
  separator: {
    height: 1,
    marginHorizontal: 20,
    marginVertical: 10,
  },
  customContent: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
});
