import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';

export default function IndexScreen() {
  // This screen should never be reached due to protected routes
  // But if it is, just show a loading screen
  return (
    <ThemedView style={{ 
      flex: 1, 
      justifyContent: 'center', 
      alignItems: 'center',
      backgroundColor: '#1F2937'
    }}>
      <ThemedText style={{ fontSize: 18, marginBottom: 16 }}>Loading...</ThemedText>
      <ThemedText style={{ fontSize: 14, opacity: 0.7 }}>Initializing app</ThemedText>
    </ThemedView>
  );
}