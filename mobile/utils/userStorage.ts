import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StoredUser {
  id: number;
  username: string;
  email: string;
  avatar_url?: string;
  lastLogin: string;
}

const PREVIOUS_USERS_KEY = 'previous_users';
const MAX_STORED_USERS = 5; // Limit to 5 previous users

export const savePreviousUser = async (user: Omit<StoredUser, 'lastLogin'>) => {
  try {
    const existingUsers = await getPreviousUsers();
    
    // Remove user if already exists to update their info
    const filteredUsers = existingUsers.filter(u => u.id !== user.id);
    
    // Add user with current timestamp
    const updatedUsers = [
      { ...user, lastLogin: new Date().toISOString() },
      ...filteredUsers
    ].slice(0, MAX_STORED_USERS); // Keep only the most recent users
    
    await AsyncStorage.setItem(PREVIOUS_USERS_KEY, JSON.stringify(updatedUsers));
  } catch (error) {
    console.error('Error saving previous user:', error);
  }
};

export const getPreviousUsers = async (): Promise<StoredUser[]> => {
  try {
    const usersJson = await AsyncStorage.getItem(PREVIOUS_USERS_KEY);
    if (usersJson) {
      return JSON.parse(usersJson);
    }
    return [];
  } catch (error) {
    console.error('Error getting previous users:', error);
    return [];
  }
};

export const removePreviousUser = async (userId: number) => {
  try {
    const existingUsers = await getPreviousUsers();
    const filteredUsers = existingUsers.filter(u => u.id !== userId);
    await AsyncStorage.setItem(PREVIOUS_USERS_KEY, JSON.stringify(filteredUsers));
  } catch (error) {
    console.error('Error removing previous user:', error);
  }
};

export const clearAllPreviousUsers = async () => {
  try {
    await AsyncStorage.removeItem(PREVIOUS_USERS_KEY);
  } catch (error) {
    console.error('Error clearing previous users:', error);
  }
};
