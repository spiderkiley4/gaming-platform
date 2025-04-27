import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Slot, Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { View, KeyboardAvoidingView, Platform, AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

SplashScreen.preventAutoHideAsync();

function useProtectedRoute(user: any) {
  const segments = useSegments();
  const router = useRouter();
  const initialRender = useRef(true);

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/auth');
    } else if (user && inAuthGroup) {
      router.replace('/');
    }
  }, [user, segments]);
}

function RootLayoutNav() {
  const colorScheme = useColorScheme() ?? 'light';
  const { user, loading } = useAuth();
  
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useProtectedRoute(user);

  if (!loaded || loading) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={{
          flex: 1,
          backgroundColor: '#1F2937'
        }}>
          <View
            style={{
              width: '100%',
              height: 20,
              backgroundColor: '#1F2937',
            }}
          />
          <StatusBar style="auto" />
          <Slot />
        </View>
      </KeyboardAvoidingView>
    </ThemeProvider>
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
    <AuthProvider>
      <SocketManager />
      <RootLayoutNav />
    </AuthProvider>
  );
}
