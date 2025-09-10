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
  Alert,
} from 'react-native';
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
  const [currentTime, setCurrentTime] = useState(0);
  const [showThumbnailControls, setShowThumbnailControls] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(true);
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Create separate video players for thumbnail and fullscreen views
  const thumbnailPlayer = useVideoPlayer(resolvedUrl || '', (player) => {
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
      thumbnailPlayer.replace(resolvedUrl);
      fullscreenPlayer.replace(resolvedUrl);
    }
  }, [resolvedUrl, type, thumbnailPlayer, fullscreenPlayer]);

  // Handle player events for thumbnail player
  useEffect(() => {
    if (type === 'video') {
      const statusSubscription = thumbnailPlayer.addListener('statusChange', (payload) => {
        if (payload.error) {
          console.error('Video player error:', payload.error);
          handleError();
        }
      });

      const playingSubscription = thumbnailPlayer.addListener('playingChange', (payload) => {
        setIsPlaying(payload.isPlaying);
        // Show play button when paused, hide when playing
        setShowPlayButton(!payload.isPlaying);
      });

      const mutedSubscription = thumbnailPlayer.addListener('mutedChange', (payload) => {
        setIsMuted(payload.muted);
      });

      return () => {
        statusSubscription?.remove();
        playingSubscription?.remove();
        mutedSubscription?.remove();
      };
    }
  }, [thumbnailPlayer, type]);

  // Handle player events for fullscreen player
  useEffect(() => {
    if (type === 'video') {
      const subscription = fullscreenPlayer.addListener('statusChange', (payload) => {
        if (payload.error) {
          console.error('Fullscreen video player error:', payload.error);
          handleError();
        }
      });

      return () => {
        subscription?.remove();
      };
    }
  }, [fullscreenPlayer, type]);

  // Handle fullscreen state changes
  const handleFullscreenToggle = () => {
    if (!hasError && resolvedUrl) {
      if (!isFullscreen) {
        // Store current time before going fullscreen
        setCurrentTime(thumbnailPlayer.currentTime);
        // Don't pause the thumbnail player - let it continue playing
      }
      setIsFullscreen(!isFullscreen);
    }
  };

  // Sync fullscreen player when entering fullscreen
  useEffect(() => {
    if (isFullscreen && type === 'video') {
      // Small delay to ensure the fullscreen player is ready
      const timer = setTimeout(() => {
        fullscreenPlayer.currentTime = currentTime;
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isFullscreen, currentTime, fullscreenPlayer, type]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardColor = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, 'border');
  const primaryColor = useThemeColor({}, 'primary');
  const primaryTextColor = useThemeColor({}, 'primaryText');
  const textMutedColor = useThemeColor({}, 'textMuted');

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
      // Toggle controls visibility for video
      const newShowControls = !showThumbnailControls;
      setShowThumbnailControls(newShowControls);
      
      // Auto-hide controls after 3 seconds
      if (newShowControls) {
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
        }
        controlsTimeoutRef.current = setTimeout(() => {
          setShowThumbnailControls(false);
        }, 3000);
      } else {
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
        }
      }
    } else {
      // For images, go directly to fullscreen
      handleFullscreenToggle();
    }
  };

  const handleVideoDoubleTap = () => {
    // Double tap on video goes to fullscreen
    handleFullscreenToggle();
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      thumbnailPlayer.pause();
      setIsPlaying(false);
      setShowPlayButton(true);
    } else {
      thumbnailPlayer.play();
      setIsPlaying(true);
      setShowPlayButton(false);
    }
  };

  const handleMuteToggle = () => {
    const newMuted = !isMuted;
    thumbnailPlayer.muted = newMuted;
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

  const renderMedia = () => {
    if (isLoading) {
      return (
        <View style={[styles.loadingContainer, { backgroundColor: cardColor }]}>
          <ActivityIndicator size="large" color={primaryColor} />
          <ThemedText style={[styles.loadingText, { color: textMutedColor }]}>
            Loading...
          </ThemedText>
        </View>
      );
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
          <VideoView
            player={thumbnailPlayer}
            style={styles.media}
            allowsFullscreen={false}
            allowsPictureInPicture={false}
            onFirstFrameRender={() => setIsLoading(false)}
            nativeControls={false}
            contentFit="cover"
          />
          
          {/* Fullscreen tap area */}
          <TouchableOpacity
            style={styles.fullscreenTapArea}
            onPress={handleFullscreenToggle}
            activeOpacity={1}
          />
          
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
        </View>
      );
    }
  };

  const renderFullscreenModal = () => (
    <Modal
      visible={isFullscreen}
      transparent={true}
      animationType="fade"
      onRequestClose={handleFullscreenToggle}
    >
      <View style={[styles.fullscreenContainer, { backgroundColor: 'rgba(0,0,0,0.9)' }]}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleFullscreenToggle}
        >
          <ThemedText style={[styles.closeButtonText, { color: primaryTextColor }]}>
            ✕
          </ThemedText>
        </TouchableOpacity>
        
        <View style={styles.fullscreenContent}>
          {type === 'image' ? (
            <Image
              source={{ uri: resolvedUrl || '' }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          ) : (
            <VideoView
              player={fullscreenPlayer}
              style={styles.fullscreenVideo}
              allowsFullscreen={false}
              allowsPictureInPicture={false}
              nativeControls={true}
              contentFit="contain"
            />
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
  videoControlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenTapArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
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
  loadingContainer: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  fullscreenContent: {
    width: screenWidth,
    height: screenHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: screenWidth,
    height: screenHeight,
  },
  fullscreenVideo: {
    width: screenWidth,
    height: screenHeight,
  },
});
