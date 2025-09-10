import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { Socket, io } from 'socket.io-client';
import { API_URL } from '@/api';

// Convert HTTPS URL to WSS URL for secure WebSocket connections
const wsProtocol = API_URL.startsWith('https:') ? 'wss:' : 'ws:';
const wsUrl = API_URL.replace(/^https?:/, wsProtocol);

interface PeerData {
  stream: MediaStream;
  username?: string;
  avatar?: string;
}

interface VoiceChatState {
  isMuted: boolean;
  isConnected: boolean;
  peers: Map<string, PeerData>;
  startVoiceChat: () => Promise<void>;
  toggleMute: () => void;
  disconnect: () => void;
}

export const useVoiceChat = (channelId?: number, socket?: Socket | null) => {
  const [isMuted, setIsMuted] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [peers] = useState(new Map<string, PeerData>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef(new Map<string, RTCPeerConnection>());

  const createPeerConnection = async (remoteUserId: string) => {
    console.log('Creating peer connection for', remoteUserId);
    
    let peerConnection = peerConnectionsRef.current.get(remoteUserId);
    
    if (peerConnection?.connectionState === 'connected' || 
        peerConnection?.connectionState === 'connecting') {
      console.log('Using existing connection for', remoteUserId);
      return peerConnection;
    }

    if (peerConnection) {
      console.log('Closing existing connection in state:', peerConnection.connectionState);
      peerConnection.close();
    }

    peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state for ${remoteUserId}:`, peerConnection.connectionState);
      if (peerConnection.connectionState === 'failed' || 
          peerConnection.connectionState === 'closed') {
        console.log('Connection failed or closed, cleaning up');
        peerConnectionsRef.current.delete(remoteUserId);
        peers.delete(remoteUserId);
      }
    };

    if (localStreamRef.current) {
      console.log('Adding local stream tracks to peer connection');
      localStreamRef.current.getTracks().forEach((track) => {
        if (localStreamRef.current) {
          peerConnection.addTrack(track, localStreamRef.current);
        }
      });
    } else {
      console.warn('No local stream available when creating peer connection');
    }

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket) {
        console.log('Sending ICE candidate to', remoteUserId);
        socket.emit('relay_ice_candidate', {
          candidate: event.candidate,
          to: remoteUserId,
        });
      }
    };

    peerConnection.ontrack = (event) => {
      console.log('Received remote track from', remoteUserId);
      const [stream] = event.streams;
      if (stream) {
        // Update existing peer data or create new entry
        const existingPeer = peers.get(remoteUserId);
        peers.set(remoteUserId, { 
          stream,
          username: existingPeer?.username || `User ${remoteUserId.slice(0, 4)}`,
          avatar: existingPeer?.avatar
        });
      }
    };

    peerConnectionsRef.current.set(remoteUserId, peerConnection);
    return peerConnection;
  };

  const startVoiceChat = async () => {
    if (!socket) {
      console.error('[useVoiceChat] Cannot start voice chat: no socket available');
      throw new Error('Socket not available');
    }

    try {
      if (Platform.OS !== 'web') {
        console.warn('Voice chat is currently only supported on web');
        return;
      }

      console.log('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      console.log('Got audio stream with tracks:', stream.getTracks().length);
      localStreamRef.current = stream;
      setIsMuted(false);
      setIsConnected(true);
      
      socket.emit('voice_join', { channelId });
    } catch (err) {
      console.error('Error accessing microphone:', err);
      throw new Error('Could not access microphone');
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const newMutedState = !isMuted;
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !newMutedState;
      });
      setIsMuted(newMutedState);
    }
  };

  const disconnect = () => {
    console.log('Disconnecting from voice chat');
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      localStreamRef.current = null;
    }

    peerConnectionsRef.current.forEach((connection) => {
      connection.close();
    });
    peerConnectionsRef.current.clear();
    peers.clear();

    setIsConnected(false);
    setIsMuted(true);

    if (socket) {
      socket.emit('voice_leave', { channelId });
    }
  };

  useEffect(() => {
    if (!socket) {
      console.log('[useVoiceChat] No socket available, skipping voice chat setup');
      return;
    }

    const handleVoiceUsers = async ({ users }: { users: any[] }) => {
      console.log('Received existing users:', users);
      if (!localStreamRef.current) return;

      for (const user of users) {
        const socketId = user.socketId || user; // Handle both new format and legacy
        if (socketId === socket.id) continue;
        
        // Store user info for display
        if (user.username) {
          peers.set(socketId, {
            stream: new MediaStream(), // Placeholder, will be updated when track is received
            username: user.username,
            avatar: user.avatar_url
          });
        }
        
        try {
          const peerConnection = await createPeerConnection(socketId);
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          socket.emit('voice_offer', { offer, to: socketId });
        } catch (err) {
          console.error('Error creating offer:', err);
        }
      }
    };

    const handleUserJoined = async ({ socketId, userId, username, avatar_url }: { socketId: string, userId?: string, username?: string, avatar_url?: string }) => {
      console.log('User joined voice:', username || socketId);
      
      // Store user info for display
      if (username) {
        peers.set(socketId, {
          stream: new MediaStream(), // Placeholder, will be updated when track is received
          username: username,
          avatar: avatar_url
        });
      }
      
      if (localStreamRef.current && socket?.id && socket.id < socketId) {
        try {
          const peerConnection = await createPeerConnection(socketId);
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          socket.emit('voice_offer', { offer, to: socketId });
        } catch (err) {
          console.error('Error creating offer:', err);
        }
      }
    };

    const handleVoiceOffer = async ({ offer, from }: { offer: RTCSessionDescriptionInit, from: string }) => {
      console.log('Received offer from:', from);
      if (!localStreamRef.current) return;

      try {
        const peerConnection = await createPeerConnection(from);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('voice_answer', { answer, to: from });
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    };

    const handleVoiceAnswer = async ({ answer, from }: { answer: RTCSessionDescriptionInit, from: string }) => {
      console.log('Received answer from:', from);
      const peerConnection = peerConnectionsRef.current.get(from);
      if (peerConnection) {
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('Error setting remote description:', err);
        }
      }
    };

    const handleIceCandidate = async ({ candidate, from }: { candidate: RTCIceCandidateInit, from: string }) => {
      const peerConnection = peerConnectionsRef.current.get(from);
      if (peerConnection) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    };

    const handleUserLeft = ({ socketId, userId, username }: { socketId: string, userId?: string, username?: string }) => {
      console.log('User left voice:', username || socketId);
      const peerConnection = peerConnectionsRef.current.get(socketId);
      if (peerConnection) {
        peerConnection.close();
        peerConnectionsRef.current.delete(socketId);
      }
      peers.delete(socketId);
    };

    socket.on('voice_users', handleVoiceUsers);
    socket.on('user_joined_voice', handleUserJoined);
    socket.on('voice_offer', handleVoiceOffer);
    socket.on('voice_answer', handleVoiceAnswer);
    socket.on('relay_ice_candidate', handleIceCandidate);
    socket.on('user_left_voice', handleUserLeft);

    return () => {
      socket.off('voice_users', handleVoiceUsers);
      socket.off('user_joined_voice', handleUserJoined);
      socket.off('voice_offer', handleVoiceOffer);
      socket.off('voice_answer', handleVoiceAnswer);
      socket.off('relay_ice_candidate', handleIceCandidate);
      socket.off('user_left_voice', handleUserLeft);
    };
  }, [socket, channelId]);

  return {
    isMuted,
    isConnected,
    peers,
    startVoiceChat,
    toggleMute,
    disconnect,
  };
};