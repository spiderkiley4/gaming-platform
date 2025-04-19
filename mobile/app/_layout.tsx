import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Slot, Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { View, KeyboardAvoidingView, Platform, AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

SplashScreen.preventAutoHideAsync();

function useProtectedRoute(user: any) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';

    const timeout = setTimeout(() => {
      if (!user && !inAuthGroup) {
        router.replace('/(auth)/auth');
      } else if (user && inAuthGroup) {
        router.replace('/');
      }
    }, 0); // Wait until after first render

    return () => clearTimeout(timeout);
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
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          </Stack>
        </View>
      </KeyboardAvoidingView>
    </ThemeProvider>
  );
}

function SocketManager() {
  const { socket } = useAuth();
  const startTime = useRef(Date.now());
  const disconnectTimeout = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!socket) return;

    const logSocketStatus = (event: string, details?: any) => {
      console.log(`[SocketManager] ${event}:`, {
        timestamp: new Date().toISOString(),
        uptime: (Date.now() - startTime.current) / 1000,
        socketId: socket.id,
        connected: socket.connected,
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
    };
  }, [socket]);

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
