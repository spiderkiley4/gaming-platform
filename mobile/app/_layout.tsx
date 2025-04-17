import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Slot, Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { View, KeyboardAvoidingView, Platform } from 'react-native';

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

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
