import { useState, useRef, useEffect } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/context/AuthContext';
import { router, useLocalSearchParams } from 'expo-router';

export default function PasswordScreen() {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { loginUser } = useAuth();
  const passwordInputRef = useRef<TextInput>(null);
  const { username } = useLocalSearchParams<{ username: string }>();

  useEffect(() => {
    // Focus on password input when screen loads
    setTimeout(() => {
      passwordInputRef.current?.focus();
    }, 100);
  }, []);

  const handleSubmit = async () => {
    if (!username) {
      Alert.alert('Error', 'Username not found');
      return;
    }

    setIsLoading(true);
    try {
      await loginUser(username, password);
      // Small delay to ensure state is properly set before navigation
      setTimeout(() => {
        router.push('/(tabs)');
      }, 100);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={styles.contentContainer}>
        <ThemedView style={styles.form}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <ThemedText style={styles.backButtonText}>← Back</ThemedText>
          </TouchableOpacity>

          <ThemedText type="title" style={styles.title}>
            Enter Password
          </ThemedText>

          <ThemedText style={styles.subtitle}>
            Welcome back, {username}
          </ThemedText>

          <TextInput
            ref={passwordInputRef}
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            autoFocus
          />

          <TouchableOpacity 
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <ThemedText style={styles.buttonText}>
                Login
              </ThemedText>
            )}
          </TouchableOpacity>
        </ThemedView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  form: {
    width: '100%',
    maxWidth: 400,
    padding: 20,
    borderRadius: 10,
    backgroundColor: '#1F2937',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  backButtonText: {
    color: '#60A5FA',
    fontSize: 16,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 20,
    color: '#9CA3AF',
  },
  input: {
    backgroundColor: '#374151',
    padding: 12,
    borderRadius: 8,
    color: 'white',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#3B82F6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
});
