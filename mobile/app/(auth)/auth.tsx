import { useState, useRef } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';
import { PreviousUsersList } from '@/components/PreviousUsersList';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { loginUser, registerUser } = useAuth();
  const passwordInputRef = useRef<TextInput>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      if (isLogin) {
        await loginUser(formData.username, formData.password);
      } else {
        await registerUser(formData.username, formData.email, formData.password);
      }
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

  const handleRemoveUser = (userId: number) => {
    // User was removed from the list, no additional action needed
    console.log('User removed from previous users list:', userId);
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentContainer}>
          {isLogin && (
            <PreviousUsersList 
              onRemoveUser={handleRemoveUser}
            />
          )}
          
          <ThemedView style={styles.form}>
            <ThemedText type="title" style={styles.title}>
              {isLogin ? 'Login' : 'Register'}
            </ThemedText>

          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor="#666"
            value={formData.username}
            onChangeText={(text) => setFormData(prev => ({ ...prev, username: text }))}
            autoCapitalize="none"
            returnKeyType="next"
          />

          {!isLogin && (
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#666"
              value={formData.email}
              onChangeText={(text) => setFormData(prev => ({ ...prev, email: text }))}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
            />
          )}

          <TextInput
            ref={passwordInputRef}
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#666"
            value={formData.password}
            onChangeText={(text) => setFormData(prev => ({ ...prev, password: text }))}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
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
                {isLogin ? 'Login' : 'Register'}
              </ThemedText>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => setIsLogin(!isLogin)}
            style={styles.switchButton}
          >
            <ThemedText style={styles.switchText}>
              {isLogin ? "Don't have an account? Register" : "Already have an account? Login"}
            </ThemedText>
          </TouchableOpacity>

          </ThemedView>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  contentContainer: {
    alignItems: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 400,
    padding: 20,
    borderRadius: 10,
    backgroundColor: '#1F2937',
  },
  title: {
    textAlign: 'center',
    marginBottom: 20,
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
  switchButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchText: {
    color: '#60A5FA',
  },
});