import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, TextInput, Modal } from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { getServers, createServer, joinServerByInvite } from '@/api';

interface Server {
  id: number;
  name: string;
  description?: string;
  icon_url?: string;
}

interface ServerListProps {
  selectedServer: Server | null;
  onServerSelect: (server: Server) => void;
  onServerCreate?: (server: Server) => void;
}

export default function ServerList({ selectedServer, onServerSelect, onServerCreate }: ServerListProps) {
  const [servers, setServers] = useState<Server[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newServerDescription, setNewServerDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const primaryColor = useThemeColor({}, 'primary');
  const primaryTextColor = useThemeColor({}, 'primaryText');
  const successColor = useThemeColor({}, 'success');
  const successTextColor = useThemeColor({}, 'successText');
  const borderColor = useThemeColor({}, 'border');
  const cardColor = useThemeColor({}, 'card');
  const backgroundColor = useThemeColor({}, 'background');
  const mutedColor = useThemeColor({}, 'muted');
  const mutedTextColor = useThemeColor({}, 'mutedText');

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      const response = await getServers();
      setServers(response.data);
    } catch (error) {
      console.error('Error fetching servers:', error);
    }
  };

  const handleCreateServer = async () => {
    if (!newServerName.trim()) return;
    
    setIsLoading(true);
    try {
      const response = await createServer(newServerName.trim(), newServerDescription.trim() || undefined);
      const newServer = response.data;
      setServers(prev => [newServer, ...prev]);
      setNewServerName('');
      setNewServerDescription('');
      setShowCreateForm(false);
      onServerCreate?.(newServer);
    } catch (error) {
      console.error('Error creating server:', error);
      Alert.alert('Error', 'Failed to create server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinServer = async () => {
    if (!inviteCode.trim()) return;
    
    setIsLoading(true);
    try {
      const res = await joinServerByInvite(inviteCode.trim());
      const server = res.data;
      setShowJoinForm(false);
      setInviteCode('');
      setServers(prev => [server, ...prev.filter(s => s.id !== server.id)]);
      onServerSelect(server);
    } catch (err) {
      Alert.alert('Error', 'Failed to join server. Check the code and try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const renderServer = ({ item }: { item: Server }) => (
    <TouchableOpacity
      style={[
        styles.serverItem,
        { backgroundColor: cardColor },
        selectedServer?.id === item.id && { backgroundColor: primaryColor }
      ]}
      onPress={() => onServerSelect(item)}
    >
      {item.icon_url ? (
        <Text style={styles.serverIcon}>🖼️</Text>
      ) : (
        <View style={[styles.serverIconContainer, { backgroundColor: selectedServer?.id === item.id ? primaryTextColor : primaryColor }]}>
          <Text style={[styles.serverIconText, { color: selectedServer?.id === item.id ? primaryColor : primaryTextColor }]}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.serverInfo}>
        <ThemedText style={[styles.serverName, { color: primaryTextColor }]}>{item.name}</ThemedText>
        {item.description && (
          <ThemedText style={[styles.serverDescription, { color: primaryTextColor, opacity: 0.8 }]} numberOfLines={1}>
            {item.description}
          </ThemedText>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Servers</ThemedText>
      
      <FlatList
        data={servers}
        renderItem={renderServer}
        keyExtractor={(item) => item.id.toString()}
        style={styles.serverList}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: successColor }]}
          onPress={() => setShowCreateForm(true)}
        >
          <Text style={[styles.buttonText, { color: successTextColor }]}>+ Create Server</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: primaryColor }]}
          onPress={() => setShowJoinForm(true)}
        >
          <Text style={[styles.buttonText, { color: primaryTextColor }]}>+ Join Server</Text>
        </TouchableOpacity>
      </View>

      {/* Create Server Modal */}
      <Modal
        visible={showCreateForm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardColor }]}>
            <ThemedText type="title" style={styles.modalTitle}>Create Server</ThemedText>
            
            <TextInput
              style={[styles.input, { backgroundColor: backgroundColor, borderColor: borderColor }]}
              placeholder="Server Name"
              placeholderTextColor={mutedColor}
              value={newServerName}
              onChangeText={setNewServerName}
              maxLength={100}
            />
            
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: backgroundColor, borderColor: borderColor }]}
              placeholder="Description (Optional)"
              placeholderTextColor={mutedColor}
              value={newServerDescription}
              onChangeText={setNewServerDescription}
              multiline
              numberOfLines={3}
              maxLength={500}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: mutedColor }]}
                onPress={() => setShowCreateForm(false)}
                disabled={isLoading}
              >
                <Text style={[styles.cancelButtonText, { color: mutedTextColor }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: successColor }]}
                onPress={handleCreateServer}
                disabled={!newServerName.trim() || isLoading}
              >
                <Text style={[styles.createButtonText, { color: successTextColor }]}>
                  {isLoading ? 'Creating...' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Join Server Modal */}
      <Modal
        visible={showJoinForm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowJoinForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardColor }]}>
            <ThemedText type="title" style={styles.modalTitle}>Join Server</ThemedText>
            
            <TextInput
              style={[styles.input, { backgroundColor: backgroundColor, borderColor: borderColor }]}
              placeholder="Invite Code"
              placeholderTextColor={mutedColor}
              value={inviteCode}
              onChangeText={setInviteCode}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: mutedColor }]}
                onPress={() => setShowJoinForm(false)}
              >
                <Text style={[styles.cancelButtonText, { color: mutedTextColor }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: primaryColor }]}
                onPress={handleJoinServer}
                disabled={!inviteCode.trim() || isLoading}
              >
                <Text style={[styles.createButtonText, { color: primaryTextColor }]}>
                  {isLoading ? 'Joining...' : 'Join'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
  },
  serverList: {
    flex: 1,
  },
  serverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    minHeight: 72,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  selectedServer: {
    elevation: 4,
    shadowOpacity: 0.2,
  },
  serverIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  serverIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  serverIconText: {
    fontWeight: 'bold',
    fontSize: 20,
  },
  serverInfo: {
    flex: 1,
  },
  serverName: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  serverDescription: {
    fontSize: 13,
    opacity: 0.7,
    lineHeight: 16,
  },
  buttonContainer: {
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#374151',
    padding: 12,
    borderRadius: 8,
    color: 'white',
    marginBottom: 12,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#6B7280',
  },
  createButton: {
    backgroundColor: '#3B82F6',
  },
  cancelButtonText: {
    fontWeight: '600',
  },
  createButtonText: {
    fontWeight: '600',
  },
});
