import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, TextInput, Modal } from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { getServerChannels, createServerChannel, createServerInvite, getServerInvites, deleteServerInvite } from '@/api';
import { useAuth } from '../context/AuthContext';

interface Channel {
  id: number;
  name: string;
  type: 'text' | 'voice';
}

interface Server {
  id: number;
  name: string;
  description?: string;
  icon_url?: string;
}

interface ServerChannelsProps {
  selectedServer: Server | null;
  selectedChannel: Channel | null;
  onChannelSelect: (channel: Channel) => void;
  onChannelCreate?: (channel: Channel) => void;
  onBack?: () => void;
}

export default function ServerChannels({ 
  selectedServer, 
  selectedChannel, 
  onChannelSelect, 
  onChannelCreate,
  onBack
}: ServerChannelsProps) {
  const [textChannels, setTextChannels] = useState<Channel[]>([]);
  const [voiceChannels, setVoiceChannels] = useState<Channel[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [isLoading, setIsLoading] = useState(false);
  const [invite, setInvite] = useState<{ code: string } | null>(null);
  const [inviteOptions, setInviteOptions] = useState({ max_uses: '', expires_in: '' });
  const [invites, setInvites] = useState<any[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const { socket } = useAuth();
  
  // Theme colors
  const primaryColor = useThemeColor({}, 'primary');
  const primaryTextColor = useThemeColor({}, 'primaryText');
  const successColor = useThemeColor({}, 'success');
  const successTextColor = useThemeColor({}, 'successText');
  const mutedColor = useThemeColor({}, 'muted');
  const mutedTextColor = useThemeColor({}, 'mutedText');
  const backgroundColor = useThemeColor({}, 'background');
  const backgroundSecondary = useThemeColor({}, 'backgroundSecondary');
  const cardColor = useThemeColor({}, 'card');
  const cardSecondary = useThemeColor({}, 'cardSecondary');
  const borderColor = useThemeColor({}, 'border');
  const borderSecondary = useThemeColor({}, 'borderSecondary');
  const textColor = useThemeColor({}, 'text');
  const textMuted = useThemeColor({}, 'textMuted');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const errorColor = useThemeColor({}, 'error');
  const errorTextColor = useThemeColor({}, 'errorText');

  useEffect(() => {
    if (selectedServer) {
      fetchChannels();
    }
  }, [selectedServer]);

  const fetchChannels = async () => {
    if (!selectedServer) return;
    
    try {
      const [textResponse, voiceResponse] = await Promise.all([
        getServerChannels(selectedServer.id, 'text'),
        getServerChannels(selectedServer.id, 'voice')
      ]);
      
      setTextChannels(textResponse.data);
      setVoiceChannels(voiceResponse.data);
    } catch (error) {
      console.error('Error fetching server channels:', error);
    }
  };

  const fetchInvites = async () => {
    if (!selectedServer) return;
    
    setIsLoadingInvites(true);
    try {
      const response = await getServerInvites(selectedServer.id);
      setInvites(response.data);
    } catch (error) {
      console.error('Error fetching invites:', error);
    } finally {
      setIsLoadingInvites(false);
    }
  };

  const handleDeleteInvite = async (inviteId: number) => {
    if (!selectedServer) return;
    
    try {
      await deleteServerInvite(selectedServer.id, inviteId);
      setInvites(prev => prev.filter(invite => invite.id !== inviteId));
    } catch (error) {
      console.error('Error deleting invite:', error);
      Alert.alert('Error', 'Failed to delete invite');
    }
  };

  const handleCreateInvite = async () => {
    if (!selectedServer) return;
    
    try {
      const res = await createServerInvite(selectedServer.id, {
        max_uses: inviteOptions.max_uses ? parseInt(inviteOptions.max_uses) : undefined,
        expires_in: inviteOptions.expires_in ? parseInt(inviteOptions.expires_in) : undefined
      });
      setInvite(res.data);
      // Refresh the invites list
      fetchInvites();
    } catch (err) {
      Alert.alert('Error', 'Failed to create invite');
      console.error(err);
    }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !selectedServer) return;
    
    setIsLoading(true);
    try {
      const response = await createServerChannel(
        selectedServer.id, 
        newChannelName.trim(), 
        newChannelType
      );
      const newChannel = response.data;
      
      if (newChannelType === 'text') {
        setTextChannels(prev => [...prev, newChannel]);
      } else {
        setVoiceChannels(prev => [...prev, newChannel]);
      }
      
      setNewChannelName('');
      setNewChannelType('text');
      setShowCreateForm(false);
      onChannelCreate?.(newChannel);
    } catch (error) {
      console.error('Error creating channel:', error);
      Alert.alert('Error', 'Failed to create channel. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };


  const renderChannel = (channel: Channel) => (
    <TouchableOpacity
      key={channel.id}
      style={[
        styles.channelItem,
        { backgroundColor: cardColor },
        selectedChannel?.id === channel.id && { backgroundColor: primaryColor }
      ]}
      onPress={() => onChannelSelect(channel)}
    >
      <Text style={[
        styles.channelIcon, 
        { color: selectedChannel?.id === channel.id ? primaryTextColor : textColor }
      ]}>
        {channel.type === 'text' ? '#' : '🔊'}
      </Text>
      <ThemedText style={[
        styles.channelName,
        selectedChannel?.id === channel.id && { color: primaryTextColor }
      ]}>
        {channel.name}
      </ThemedText>
    </TouchableOpacity>
  );

  if (!selectedServer) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🏠</Text>
          <ThemedText style={styles.emptyText}>Select a server to view channels</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Server Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <View style={styles.serverInfo}>
          {onBack && (
            <TouchableOpacity
              style={[styles.backButton, { backgroundColor: cardSecondary }]}
              onPress={onBack}
            >
              <Text style={[styles.backButtonText, { color: textColor }]}>←</Text>
            </TouchableOpacity>
          )}
          <View style={[styles.serverIcon, { backgroundColor: primaryColor }]}>
            <Text style={[styles.serverIconText, { color: primaryTextColor }]}>
              {selectedServer.icon_url ? '🖼️' : selectedServer.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.serverDetails}>
            <ThemedText style={styles.serverName}>{selectedServer.name}</ThemedText>
            {selectedServer.description && (
              <ThemedText style={[styles.serverDescription, { color: textMuted }]} numberOfLines={1}>
                {selectedServer.description}
              </ThemedText>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={[styles.inviteButton, { backgroundColor: successColor }]}
          onPress={() => {
            setShowInviteModal(true);
            fetchInvites();
          }}
        >
          <Text style={[styles.inviteButtonText, { color: successTextColor }]}>Invite</Text>
        </TouchableOpacity>
      </View>

      {/* Channels */}
      <View style={styles.channelsContainer}>
        {/* Text Channels */}
        {textChannels.length > 0 && (
          <View style={styles.channelSection}>
            <ThemedText style={styles.sectionTitle}>Text Channels</ThemedText>
            {textChannels.map(renderChannel)}
          </View>
        )}

        {/* Voice Channels */}
        {voiceChannels.length > 0 && (
          <View style={styles.channelSection}>
            <ThemedText style={styles.sectionTitle}>Voice Channels</ThemedText>
            {voiceChannels.map(renderChannel)}
          </View>
        )}

        {/* Empty State */}
        {textChannels.length === 0 && voiceChannels.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📝</Text>
            <ThemedText style={styles.emptyText}>No channels yet</ThemedText>
            <ThemedText style={styles.emptySubtext}>Create a channel to get started</ThemedText>
          </View>
        )}
      </View>

      {/* Create Channel Button */}
      <TouchableOpacity
        style={[styles.createChannelButton, { backgroundColor: cardSecondary }]}
        onPress={() => setShowCreateForm(true)}
      >
        <Text style={[styles.createChannelButtonText, { color: textColor }]}>+ Create Channel</Text>
      </TouchableOpacity>

      {/* Create Channel Modal */}
      <Modal
        visible={showCreateForm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardColor }]}>
            <ThemedText type="title" style={styles.modalTitle}>Create Channel</ThemedText>
            
            <TextInput
              style={[styles.input, { backgroundColor: cardSecondary, color: textColor }]}
              placeholder="Channel Name"
              placeholderTextColor={textMuted}
              value={newChannelName}
              onChangeText={setNewChannelName}
              maxLength={100}
            />
            
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[
                  styles.typeOption,
                  { backgroundColor: cardSecondary },
                  newChannelType === 'text' && { backgroundColor: primaryColor }
                ]}
                onPress={() => setNewChannelType('text')}
              >
                <Text style={[
                  styles.typeOptionText,
                  { color: textColor },
                  newChannelType === 'text' && { color: primaryTextColor }
                ]}>
                  Text Channel
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.typeOption,
                  { backgroundColor: cardSecondary },
                  newChannelType === 'voice' && { backgroundColor: primaryColor }
                ]}
                onPress={() => setNewChannelType('voice')}
              >
                <Text style={[
                  styles.typeOptionText,
                  { color: textColor },
                  newChannelType === 'voice' && { color: primaryTextColor }
                ]}>
                  Voice Channel
                </Text>
              </TouchableOpacity>
            </View>

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
                onPress={handleCreateChannel}
                disabled={!newChannelName.trim() || isLoading}
              >
                <Text style={[styles.createButtonText, { color: successTextColor }]}>
                  {isLoading ? 'Creating...' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invite Management Modal */}
      <Modal
        visible={showInviteModal}
        transparent
        animationType="fade"
        onRequestClose={() => { 
          setShowInviteModal(false); 
          setInvite(null); 
          setInviteOptions({ max_uses: '', expires_in: '' });
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardColor, maxHeight: '80%' }]}>
            <ThemedText type="title" style={styles.modalTitle}>Manage Invites</ThemedText>
            
            {/* Create New Invite Section */}
            <View style={[styles.inviteCreateSection, { backgroundColor: cardSecondary }]}>
              <ThemedText style={[styles.sectionTitle, { color: textMuted }]}>Create New Invite</ThemedText>
              
              <View style={styles.inviteOptions}>
                <TextInput
                  style={[styles.input, { backgroundColor: cardColor, color: textColor }]}
                  placeholder="Max Uses (optional)"
                  placeholderTextColor={textMuted}
                  value={inviteOptions.max_uses}
                  onChangeText={(text) => setInviteOptions(prev => ({ ...prev, max_uses: text }))}
                  keyboardType="numeric"
                />
                
                <TextInput
                  style={[styles.input, { backgroundColor: cardColor, color: textColor }]}
                  placeholder="Expires In (seconds)"
                  placeholderTextColor={textMuted}
                  value={inviteOptions.expires_in}
                  onChangeText={(text) => setInviteOptions(prev => ({ ...prev, expires_in: text }))}
                  keyboardType="numeric"
                />
              </View>
              
              {invite && (
                <View style={[styles.inviteCodeContainer, { backgroundColor: cardColor }]}>
                  <ThemedText style={[styles.inviteCodeLabel, { color: textMuted }]}>New Invite Code:</ThemedText>
                  <ThemedText style={[styles.inviteCode, { color: textColor }]}>{invite.code}</ThemedText>
                </View>
              )}

              <TouchableOpacity
                style={[styles.generateButton, { backgroundColor: successColor }]}
                onPress={handleCreateInvite}
              >
                <Text style={[styles.generateButtonText, { color: successTextColor }]}>Generate Invite</Text>
              </TouchableOpacity>
            </View>

            {/* Existing Invites List */}
            <View style={styles.invitesListSection}>
              <ThemedText style={[styles.sectionTitle, { color: textMuted }]}>Existing Invites</ThemedText>
              
              {isLoadingInvites ? (
                <View style={styles.loadingContainer}>
                  <ThemedText style={[styles.loadingText, { color: textMuted }]}>Loading invites...</ThemedText>
                </View>
              ) : invites.length === 0 ? (
                <View style={styles.loadingContainer}>
                  <ThemedText style={[styles.loadingText, { color: textMuted }]}>No invites created yet</ThemedText>
                </View>
              ) : (
                <FlatList
                  data={invites}
                  keyExtractor={(item) => item.id.toString()}
                  style={styles.invitesList}
                  showsVerticalScrollIndicator={true}
                  renderItem={({ item: inv }) => {
                    const isExpired = inv.expires_at && new Date(inv.expires_at) < new Date();
                    const isExhausted = inv.max_uses && inv.uses >= inv.max_uses;
                    const status = isExpired ? 'expired' : isExhausted ? 'exhausted' : 'active';
                    const statusColor = status === 'active' ? '#10B981' : status === 'expired' ? '#EF4444' : '#F59E0B';
                    
                    return (
                      <View style={[styles.inviteItem, { backgroundColor: cardSecondary }]}>
                        <View style={styles.inviteItemContent}>
                          <ThemedText style={[styles.inviteCode, { color: textColor }]}>{inv.code}</ThemedText>
                          <ThemedText style={[styles.inviteDetails, { color: textMuted }]}>
                            Uses: {inv.uses || 0}{inv.max_uses ? `/${inv.max_uses}` : '/∞'}
                            {inv.expires_at && (
                              <Text> • Expires: {new Date(inv.expires_at).toLocaleDateString()}</Text>
                            )}
                          </ThemedText>
                          <ThemedText style={[styles.inviteStatus, { color: statusColor }]}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </ThemedText>
                        </View>
                        <TouchableOpacity
                          style={[styles.deleteButton, { backgroundColor: errorColor }]}
                          onPress={() => handleDeleteInvite(inv.id)}
                        >
                          <Text style={[styles.deleteButtonText, { color: errorTextColor }]}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }}
                />
              )}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: mutedColor }]}
                onPress={() => { 
                  setShowInviteModal(false); 
                  setInvite(null); 
                  setInviteOptions({ max_uses: '', expires_in: '' });
                }}
              >
                <Text style={[styles.cancelButtonText, { color: mutedTextColor }]}>Close</Text>
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
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  serverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    marginRight: 8,
    padding: 8,
    borderRadius: 6,
  },
  backButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  serverIcon: {
    marginRight: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serverIconText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  serverDetails: {
    flex: 1,
  },
  serverName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  serverDescription: {
    fontSize: 13,
    opacity: 0.7,
  },
  inviteButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  inviteButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  channelsContainer: {
    flex: 1,
  },
  channelSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.7,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 6,
    borderRadius: 8,
    minHeight: 48,
  },
  channelIcon: {
    fontSize: 18,
    marginRight: 12,
    width: 24,
  },
  channelName: {
    fontSize: 16,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    opacity: 0.7,
  },
  createChannelButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  createChannelButtonText: {
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
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
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  typeOption: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  typeOptionText: {
    fontWeight: '600',
  },
  inviteOptions: {
    gap: 12,
    marginBottom: 16,
  },
  inviteCodeContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  inviteCodeLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  inviteCode: {
    fontSize: 18,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontWeight: '600',
  },
  createButtonText: {
    fontWeight: '600',
  },
  inviteCreateSection: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  generateButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  generateButtonText: {
    fontWeight: '600',
  },
  invitesListSection: {
    flex: 1,
    minHeight: 200,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
  },
  invitesList: {
    flex: 1,
  },
  inviteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  inviteItemContent: {
    flex: 1,
  },
  inviteDetails: {
    fontSize: 12,
    marginTop: 4,
  },
  inviteStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  deleteButton: {
    padding: 8,
    borderRadius: 6,
    marginLeft: 12,
  },
  deleteButtonText: {
    fontSize: 16,
  },
});
