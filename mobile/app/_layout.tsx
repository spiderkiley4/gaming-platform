import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Slot, Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { StatusBar } from 'expo-status-bar';
import { View, KeyboardAvoidingView, Platform, AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

SplashScreen.preventAutoHideAsync();

function useProtectedRoute(user: any, loading: boolean) {
  const segments = useSegments();
  const router = useRouter();
  const initialRender = useRef(true);

  useEffect(() => {
    console.log('[ProtectedRoute] Route check:', {
      user: !!user,
      loading,
      segments: segments,
      initialRender: initialRender.current
    });

    // Don't navigate while loading
    if (loading) {
      console.log('[ProtectedRoute] Still loading, skipping navigation');
      return;
    }

    // Skip navigation on initial render, but handle it after a short delay
    if (initialRender.current) {
      initialRender.current = false;
      console.log('[ProtectedRoute] Initial render, will check navigation after delay');
      
      // Check navigation after a short delay to ensure layout is ready
      setTimeout(() => {
        const inAuthGroup = segments[0] === '(auth)';
        
        if (!user && !inAuthGroup) {
          console.log('[ProtectedRoute] Initial check - No user and not in auth group - navigating to auth');
          router.replace('/(auth)/auth');
        } else if (user && inAuthGroup) {
          console.log('[ProtectedRoute] Initial check - User exists and in auth group - navigating to main app');
          router.replace('/(tabs)');
        } else if (user && segments.length <= 1) {
          console.log('[ProtectedRoute] Initial check - User exists and at root - navigating to tabs');
          router.replace('/(tabs)');
        }
      }, 200);
      
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      console.log('[ProtectedRoute] No user and not in auth group - navigating to auth');
      setTimeout(() => router.replace('/(auth)/auth'), 50);
    } else if (user && inAuthGroup) {
      console.log('[ProtectedRoute] User exists and in auth group - navigating to main app');
      setTimeout(() => router.replace('/(tabs)'), 50);
    } else if (user && segments.length <= 1) {
      console.log('[ProtectedRoute] User exists and at root - navigating to tabs');
      setTimeout(() => router.replace('/(tabs)'), 50);
    } else {
      console.log('[ProtectedRoute] No navigation needed:', {
        hasUser: !!user,
        inAuthGroup,
        currentPath: segments.join('/')
      });
    }
  }, [user, loading, segments]);
}

function RootLayoutNav() {
  const colorScheme = useColorScheme() ?? 'light';
  const backgroundColor = useThemeColor({}, 'background');
  const { user, loading } = useAuth();
  
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    console.log('[RootLayoutNav] State check:', {
      user: !!user,
      loading,
      loaded,
      shouldRender: !loaded || loading
    });
  }, [user, loading, loaded]);

  useProtectedRoute(user, loading);

  if (!loaded || loading) {
    console.log('[RootLayoutNav] Not rendering - loaded:', loaded, 'loading:', loading);
    return null;
  }

  return (
    <NavigationThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={{
          flex: 1,
          backgroundColor: backgroundColor
        }}>
          <View
            style={{
              width: '100%',
              height: 20,
              backgroundColor: backgroundColor,
            }}
          />
          <StatusBar style="auto" />
          <Slot />
        </View>
      </KeyboardAvoidingView>
    </NavigationThemeProvider>
  );
}

function SocketManager() {
  const { socket, user } = useAuth();
  const startTime = useRef(Date.now());
  const disconnectTimeout = useRef<NodeJS.Timeout>();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!socket) {
      console.log('[SocketManager] No socket instance available, user state:', !!user);
      setIsInitialized(false);
      return;
    }

    if (!isInitialized) {
      console.log('[SocketManager] Initializing socket manager');
      setIsInitialized(true);
    }

    console.log('[SocketManager] Initial socket state:', {
      id: socket.id,
      connected: socket.connected,
      disconnected: socket.disconnected,
      transport: socket.io?.engine?.transport?.name,
      readyState: socket.io?.engine?.readyState,
      uptime: (Date.now() - startTime.current) / 1000
    });

    const logSocketStatus = (event: string, details?: any) => {
      console.log(`[SocketManager] ${event}:`, {
        timestamp: new Date().toISOString(),
        uptime: (Date.now() - startTime.current) / 1000,
        socketId: socket.id,
        connected: socket.connected,
        disconnected: socket.disconnected,
        readyState: socket.io?.engine?.readyState,
        transport: socket.io?.engine?.transport?.name,
        ...details
      });
    };

    // Handle network state changes
    const unsubscribe = NetInfo.addEventListener(state => {
      logSocketStatus('Network state changed', {
        type: state.type,
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        details: state.details
      });

      if (state.isConnected && socket.disconnected) {
        logSocketStatus('Network connected, attempting socket reconnect');
        socket.connect();
      }
    });

    // Handle app state changes with delayed disconnect
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      logSocketStatus('App state changed', { nextAppState });
      
      // Clear any pending disconnect timeout
      if (disconnectTimeout.current) {
        clearTimeout(disconnectTimeout.current);
        disconnectTimeout.current = undefined;
      }
      
      if (nextAppState === 'active') {
        if (socket.disconnected) {
          logSocketStatus('App active, checking connection');
          NetInfo.fetch().then(state => {
            logSocketStatus('Network status check', {
              isConnected: state.isConnected,
              type: state.type
            });
            if (state.isConnected) {
              logSocketStatus('Network available, attempting socket reconnect');
              socket.connect();
            }
          });
        }
      } else if (nextAppState === 'background') {
        logSocketStatus('App entering background');
        // Set a timeout to disconnect after 5 minutes in background
        disconnectTimeout.current = setTimeout(() => {
          logSocketStatus('Disconnecting socket after background timeout');
          socket.disconnect();
        }, 5 * 60 * 1000); // 5 minutes
      }
    });

    // Socket event logging
    socket.on('connect', () => {
      logSocketStatus('Socket connected');
    });

    socket.on('disconnect', (reason) => {
      logSocketStatus('Socket disconnected', { reason });
    });

    socket.on('connect_error', (error) => {
      logSocketStatus('Connection error', { 
        error: error.message
      });
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      logSocketStatus('Socket reconnection attempt', { attempt });
    });

    // Cleanup function
    return () => {
      if (disconnectTimeout.current) {
        clearTimeout(disconnectTimeout.current);
      }
      unsubscribe();
      subscription.remove();
      if (isInitialized) {
        logSocketStatus('Cleaning up socket manager');
      }
    };
  }, [socket, user, isInitialized]);

  return null;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketManager />
        <RootLayoutNav />
      </AuthProvider>
    </ThemeProvider>
  );
}
