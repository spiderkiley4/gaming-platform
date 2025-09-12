import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import { StoredUser, getPreviousUsers, removePreviousUser } from '@/utils/userStorage';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { router } from 'expo-router';

interface PreviousUsersListProps {
  onRemoveUser: (userId: number) => void;
}

export const PreviousUsersList: React.FC<PreviousUsersListProps> = ({ 
  onRemoveUser 
}) => {
  const [previousUsers, setPreviousUsers] = useState<StoredUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPreviousUsers();
  }, []);

  const loadPreviousUsers = async () => {
    try {
      const users = await getPreviousUsers();
      setPreviousUsers(users);
    } catch (error) {
      console.error('Error loading previous users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserPress = (user: StoredUser) => {
    router.push({
      pathname: '/(auth)/password',
      params: { username: user.username }
    });
  };

  const handleRemoveUser = (user: StoredUser) => {
    Alert.alert(
      'Remove User',
      `Are you sure you want to remove ${user.username} from the list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removePreviousUser(user.id);
              setPreviousUsers(prev => prev.filter(u => u.id !== user.id));
              onRemoveUser(user.id);
            } catch (error) {
              console.error('Error removing user:', error);
              Alert.alert('Error', 'Failed to remove user');
            }
          }
        }
      ]
    );
  };

  const formatLastLogin = (lastLogin: string) => {
    const date = new Date(lastLogin);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}d ago`;
    }
  };

  if (loading) {
    return null;
  }

  if (previousUsers.length === 0) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Previous Users</ThemedText>
      {previousUsers.map((user) => (
        <View key={user.id} style={styles.userItem}>
          <TouchableOpacity
            style={styles.userButton}
            onPress={() => handleUserPress(user)}
            activeOpacity={0.7}
          >
            <View style={styles.userInfo}>
              {user.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <ThemedText style={styles.avatarText}>
                    {user.username.charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
              )}
              <View style={styles.userDetails}>
                <ThemedText style={styles.username}>{user.username}</ThemedText>
                <ThemedText style={styles.lastLogin}>
                  Last login: {formatLastLogin(user.lastLogin)}
                </ThemedText>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => handleRemoveUser(user)}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.removeButtonText}>×</ThemedText>
          </TouchableOpacity>
        </View>
      ))}
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 400,
    marginBottom: 20,
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#1F2937',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#F9FAFB',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#374151',
    borderRadius: 8,
    padding: 12,
  },
  userButton: {
    flex: 1,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  userDetails: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '500',
    color: '#F9FAFB',
    marginBottom: 2,
  },
  lastLogin: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  removeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  removeButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
