import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  Modal,
  Dimensions,
  StyleSheet,
  ActivityIndicator,
  Text,
  StatusBar,
} from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  withSequence,
  interpolate,
  Easing 
} from 'react-native-reanimated';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ThemedText } from './ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { resolveMediaUrl } from '../utils/mediaUrl';

interface FileViewerProps {
  url: string;
  type: 'image' | 'video';
  style?: any;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const maxWidth = screenWidth - 32; // Account for padding
const maxHeight = 300; // Mobile-friendly max height

export default function FileViewer({ url, type, style }: FileViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(true);
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Animation values for loading circle
  const rotationValue = useSharedValue(0);
  const scaleValue = useSharedValue(1);
  const opacityValue = useSharedValue(0.7);
  
  // Create separate video players for inline and fullscreen views
  const inlinePlayer = useVideoPlayer(resolvedUrl || '', (player) => {
    player.loop = false;
    player.muted = false;
  });

  const fullscreenPlayer = useVideoPlayer(resolvedUrl || '', (player) => {
    player.loop = false;
    player.muted = false;
  });

  // Update player sources when resolvedUrl changes
  useEffect(() => {
    if (resolvedUrl && type === 'video') {
      // Use replaceAsync to prevent UI freezes on iOS
      inlinePlayer.replaceAsync(resolvedUrl).catch(error => {
        console.error('Error replacing inline player source:', error);
        handleError();
      });
      fullscreenPlayer.replaceAsync(resolvedUrl).catch(error => {
        console.error('Error replacing fullscreen player source:', error);
        handleError();
      });
    }
  }, [resolvedUrl, type, inlinePlayer, fullscreenPlayer]);

  // Handle inline player events (only when not in fullscreen)
  useEffect(() => {
    if (type === 'video' && !isFullscreen) {
      const statusSubscription = inlinePlayer.addListener('statusChange', (payload) => {
        if (payload.error) {
          console.error('Inline video player error:', payload.error);
          handleError();
        }
      });

      const playingSubscription = inlinePlayer.addListener('playingChange', (payload) => {
        setIsPlaying(payload.isPlaying);
        setShowPlayButton(!payload.isPlaying);
      });

      const mutedSubscription = inlinePlayer.addListener('mutedChange', (payload) => {
        setIsMuted(payload.muted);
      });

      const timeUpdateSubscription = inlinePlayer.addListener('timeUpdate', (payload) => {
        setCurrentTime(payload.currentTime);
      });

      const statusChangeSubscription = inlinePlayer.addListener('statusChange', (payload) => {
        if (payload.status === 'readyToPlay' && inlinePlayer.duration > 0) {
          setDuration(inlinePlayer.duration);
        }
      });

      return () => {
        statusSubscription?.remove();
        playingSubscription?.remove();
        mutedSubscription?.remove();
        timeUpdateSubscription?.remove();
        statusChangeSubscription?.remove();
      };
    }
  }, [inlinePlayer, type, isFullscreen]);

  // Handle fullscreen player events (only when in fullscreen)
  useEffect(() => {
    if (type === 'video' && isFullscreen) {
      const statusSubscription = fullscreenPlayer.addListener('statusChange', (payload) => {
        if (payload.error) {
          console.error('Fullscreen video player error:', payload.error);
          handleError();
        }
      });

      const playingSubscription = fullscreenPlayer.addListener('playingChange', (payload) => {
        // Update UI state when fullscreen player changes
        setIsPlaying(payload.isPlaying);
        setShowPlayButton(!payload.isPlaying);
      });

      const mutedSubscription = fullscreenPlayer.addListener('mutedChange', (payload) => {
        setIsMuted(payload.muted);
      });

      const timeUpdateSubscription = fullscreenPlayer.addListener('timeUpdate', (payload) => {
        setCurrentTime(payload.currentTime);
      });

      return () => {
        statusSubscription?.remove();
        playingSubscription?.remove();
        mutedSubscription?.remove();
        timeUpdateSubscription?.remove();
      };
    }
  }, [fullscreenPlayer, type, isFullscreen]);

  // Handle fullscreen state changes
  const handleFullscreenToggle = () => {
    if (!hasError && resolvedUrl) {
      if (!isFullscreen) {
        // Store current time and state before going fullscreen
        const currentTime = inlinePlayer.currentTime;
        const isCurrentlyPlaying = inlinePlayer.playing;
        const isCurrentlyMuted = inlinePlayer.muted;
        
        // Pause the inline player first
        inlinePlayer.pause();
        
        // Sync fullscreen player with inline player state
        setTimeout(() => {
          fullscreenPlayer.currentTime = currentTime;
          fullscreenPlayer.muted = isCurrentlyMuted;
          if (isCurrentlyPlaying) {
            fullscreenPlayer.play();
          }
        }, 100);
      } else {
        // When exiting fullscreen, sync inline player with fullscreen player state
        const currentTime = fullscreenPlayer.currentTime;
        const isCurrentlyPlaying = fullscreenPlayer.playing;
        const isCurrentlyMuted = fullscreenPlayer.muted;
        
        // Pause the fullscreen player first
        fullscreenPlayer.pause();
        
        // Sync inline player with fullscreen player state
        setTimeout(() => {
          inlinePlayer.currentTime = currentTime;
          inlinePlayer.muted = isCurrentlyMuted;
          if (isCurrentlyPlaying) {
            inlinePlayer.play();
          } else {
            inlinePlayer.pause();
          }
        }, 100);
      }
      setIsFullscreen(!isFullscreen);
    }
  };

  // Handle fullscreen mode changes
  useEffect(() => {
    if (isFullscreen) {
      // Hide status bar in fullscreen
      StatusBar.setHidden(true);
    } else {
      // Show status bar when exiting fullscreen
      StatusBar.setHidden(false);
    }

    // Cleanup on unmount
    return () => {
      StatusBar.setHidden(false);
    };
  }, [isFullscreen]);

  // Cleanup timeouts and players on unmount
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      // Clean up players
      if (type === 'video') {
        inlinePlayer.release();
        fullscreenPlayer.release();
      }
    };
  }, [type, inlinePlayer, fullscreenPlayer]);

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardColor = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');
  const primaryColor = useThemeColor({}, 'primary');
  const primaryTextColor = useThemeColor({}, 'primaryText');
  const textMutedColor = useThemeColor({}, 'textMuted');

  // Start loading animations when loading begins
  useEffect(() => {
    if (isLoading) {
      // Start rotation animation
      rotationValue.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false
      );
      
      // Start pulsing scale animation
      scaleValue.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      
      // Start opacity animation
      opacityValue.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.7, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      // Stop animations when loading is complete
      rotationValue.value = withTiming(0, { duration: 200 });
      scaleValue.value = withTiming(1, { duration: 200 });
      opacityValue.value = withTiming(0, { duration: 200 });
    }
  }, [isLoading]);

  // Resolve media URL with authentication
  React.useEffect(() => {
    const resolveUrl = async () => {
      if (!url || url.trim() === '') {
        setHasError(true);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setHasError(false);
        const resolved = await resolveMediaUrl(url);
        setResolvedUrl(resolved);
      } catch (error) {
        console.error('Error resolving media URL:', error);
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    };

    resolveUrl();
  }, [url]);

  const handlePress = () => {
    if (type === 'video') {
      // Single tap toggles play/pause
      handlePlayPause();
    } else {
      // For images, go directly to fullscreen
      handleFullscreenToggle();
    }
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      inlinePlayer.pause();
    } else {
      inlinePlayer.play();
    }
  };

  const handleMuteToggle = () => {
    const newMuted = !isMuted;
    inlinePlayer.muted = newMuted;
    setIsMuted(newMuted);
  };


  const handleError = () => {
    setHasError(true);
    setIsLoading(false);
    console.error(`Failed to load ${type}:`, url);
  };

  const calculateImageDimensions = (naturalWidth: number, naturalHeight: number) => {
    const aspectRatio = naturalWidth / naturalHeight;
    let width = naturalWidth;
    let height = naturalHeight;

    // If image is wider than max width, scale it down
    if (width > maxWidth) {
      width = maxWidth;
      height = width / aspectRatio;
    }

    // If image is taller than max height, scale it down
    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }

    return { width, height };
  };

  const handleImageLoad = (event: any) => {
    setIsLoading(false);
    if (type === 'image') {
      const { width, height } = event.nativeEvent.source;
      const dimensions = calculateImageDimensions(width, height);
      setImageDimensions(dimensions);
    }
  };

  // Animated loading circle component
  const AnimatedLoadingCircle = () => {
    const animatedStyle = useAnimatedStyle(() => {
      return {
        transform: [
          { rotate: `${rotationValue.value}deg` },
          { scale: scaleValue.value }
        ],
        opacity: opacityValue.value,
      };
    });

    const innerAnimatedStyle = useAnimatedStyle(() => {
      return {
        transform: [
          { rotate: `${-rotationValue.value * 0.5}deg` },
          { scale: interpolate(scaleValue.value, [1, 1.1], [1, 0.9]) }
        ],
        opacity: interpolate(opacityValue.value, [0.7, 1], [0.5, 0.8]),
      };
    });

    return (
      <View style={[styles.loadingContainer, { backgroundColor: cardColor }]}>
        <Animated.View style={[styles.loadingCircle, animatedStyle]}>
          <View style={[styles.loadingCircleOuter, { borderColor: primaryColor }]} />
          <Animated.View style={[styles.loadingCircleInner, innerAnimatedStyle]}>
            <View style={[styles.loadingCircleInnerBorder, { borderColor: primaryColor }]} />
          </Animated.View>
        </Animated.View>
        <ThemedText style={[styles.loadingText, { color: textMutedColor }]}>
          Loading {type}...
        </ThemedText>
      </View>
    );
  };

  const renderMedia = () => {
    if (isLoading) {
      return <AnimatedLoadingCircle />;
    }

    if (hasError || !resolvedUrl) {
      return (
        <View style={[styles.errorContainer, { backgroundColor: cardColor, borderColor }]}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <ThemedText style={[styles.errorText, { color: textMutedColor }]}>
            Failed to load {type}
          </ThemedText>
        </View>
      );
    }

    if (type === 'image') {
      return (
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.8}
          style={styles.media}
        >
          <Image
            source={{ uri: resolvedUrl }}
            style={[
              styles.media,
              imageDimensions && {
                width: imageDimensions.width,
                height: imageDimensions.height,
              }
            ]}
            resizeMode="contain"
            onLoad={handleImageLoad}
            onError={handleError}
          />
        </TouchableOpacity>
      );
    } else {
      return (
        <View style={styles.media}>
          {!isFullscreen && (
            <TouchableOpacity
              style={styles.videoTouchArea}
              onPress={handlePress}
              onLongPress={handleFullscreenToggle}
              activeOpacity={1}
            >
              <VideoView
                player={inlinePlayer}
                style={styles.media}
                allowsPictureInPicture={false}
                onFirstFrameRender={() => setIsLoading(false)}
                nativeControls={false}
                contentFit="contain"
              />
            </TouchableOpacity>
          )}
          
          {/* Play Button - only show when not playing */}
          {showPlayButton && (
            <TouchableOpacity
              style={styles.playButton}
              onPress={handlePlayPause}
              activeOpacity={0.8}
            >
              <ThemedText style={[styles.playButtonText, { color: primaryTextColor }]}>
                ▶️
              </ThemedText>
            </TouchableOpacity>
          )}
          
          {/* Mute Button - always visible */}
          <TouchableOpacity
            style={styles.muteButton}
            onPress={handleMuteToggle}
            activeOpacity={0.8}
          >
            <ThemedText style={[styles.muteButtonText, { color: primaryTextColor }]}>
              {isMuted ? '🔇' : '🔊'}
            </ThemedText>
          </TouchableOpacity>
          
          {/* Fullscreen Button */}
          <TouchableOpacity
            style={styles.fullscreenButton}
            onPress={handleFullscreenToggle}
            activeOpacity={0.8}
          >
            <ThemedText style={[styles.fullscreenButtonText, { color: primaryTextColor }]}>
              ⛶
            </ThemedText>
          </TouchableOpacity>
        </View>
      );
    }
  };

  const renderFullscreenModal = () => (
    <Modal
      visible={isFullscreen}
      transparent={false}
      animationType="fade"
      onRequestClose={handleFullscreenToggle}
      statusBarTranslucent={true}
    >
      <View style={[styles.fullscreenContainer, { backgroundColor: 'black' }]}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleFullscreenToggle}
          activeOpacity={0.8}
        >
          <ThemedText style={[styles.closeButtonText, { color: 'white' }]}>
            ✕
          </ThemedText>
        </TouchableOpacity>
        
        <View style={styles.fullscreenContent}>
          {type === 'image' ? (
            <TouchableOpacity
              style={styles.fullscreenImageContainer}
              onPress={handleFullscreenToggle}
              activeOpacity={1}
            >
              <Image
                source={{ uri: resolvedUrl || '' }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.fullscreenVideoContainer}>
              <VideoView
                key="fullscreen"
                player={fullscreenPlayer}
                style={styles.fullscreenVideo}
                allowsPictureInPicture={false}
                nativeControls={true}
                contentFit="contain"
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.mediaContainer,
          { backgroundColor: cardColor, borderColor },
          hasError && styles.errorContainer
        ]}
      >
        {renderMedia()}
      </View>
      
      {renderFullscreenModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  mediaContainer: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    maxWidth: maxWidth,
    maxHeight: maxHeight,
  },
  media: {
    width: '100%',
    height: '100%',
    minHeight: 150,
    maxHeight: maxHeight,
    maxWidth: maxWidth,
  },
  videoTouchArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -30,
    marginLeft: -30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  playButtonText: {
    fontSize: 24,
  },
  muteButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  muteButtonText: {
    fontSize: 14,
  },
  fullscreenButton: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  fullscreenButtonText: {
    fontSize: 16,
  },
  loadingContainer: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  loadingCircle: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  loadingCircleOuter: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 3,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  loadingCircleInner: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCircleInnerBorder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderTopColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  errorContainer: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  errorIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  fullscreenContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImageContainer: {
    flex: 1,
    width: screenWidth,
    height: screenHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: screenWidth,
    height: screenHeight,
  },
  fullscreenVideoContainer: {
    flex: 1,
    width: screenWidth,
    height: screenHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenVideo: {
    width: screenWidth,
    height: screenHeight,
  },
});
