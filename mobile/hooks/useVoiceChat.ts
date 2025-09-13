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
  isScreenSharing?: boolean;
}

interface VoiceChatState {
  isMuted: boolean;
  isConnected: boolean;
  isScreenSharing: boolean;
  peers: Map<string, PeerData>;
  startVoiceChat: () => Promise<void>;
  toggleMute: () => void;
  disconnect: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
}

export const useVoiceChat = (channelId?: number, socket?: Socket | null) => {
  const [isMuted, setIsMuted] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [peers] = useState(new Map<string, PeerData>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
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

    // Add local audio stream tracks
    if (localStreamRef.current) {
      console.log('Adding local audio stream tracks to peer connection');
      localStreamRef.current.getTracks().forEach((track) => {
        if (localStreamRef.current) {
          peerConnection.addTrack(track, localStreamRef.current);
        }
      });
    } else {
      console.warn('No local audio stream available when creating peer connection');
    }

    // Add local screen share tracks if available
    if (localScreenStreamRef.current) {
      console.log('Adding local screen share tracks to peer connection');
      localScreenStreamRef.current.getTracks().forEach((track) => {
        if (localScreenStreamRef.current) {
          peerConnection.addTrack(track, localScreenStreamRef.current);
        }
      });
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
      console.log('Received remote track', event.track.kind, 'from', remoteUserId);
      const [stream] = event.streams;
      if (stream) {
        // Create separate streams for audio and video
        const audioStream = new MediaStream();
        const videoStream = new MediaStream();
        
        stream.getTracks().forEach(track => {
          if (track.kind === 'audio') {
            audioStream.addTrack(track);
          } else if (track.kind === 'video') {
            videoStream.addTrack(track);
          }
        });
        
        // Update existing peer data or create new entry
        const existingPeer = peers.get(remoteUserId);
        peers.set(remoteUserId, { 
          stream: audioStream, // Keep audio stream for audio playback
          videoStream: videoStream.getVideoTracks().length > 0 ? videoStream : null, // Separate video stream
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
      // Check if we're in a web environment (including mobile web browsers)
      if (Platform.OS !== 'web' && typeof navigator === 'undefined') {
        console.warn('Voice chat is currently only supported on web');
        return;
      }

      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia is not available in this environment');
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

    // Stop screen sharing if active
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      localScreenStreamRef.current = null;
      setIsScreenSharing(false);
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

  const startScreenShare = async () => {
    try {
      // Check if we're in a web environment (including mobile web browsers)
      if (Platform.OS !== 'web' && typeof navigator === 'undefined') {
        console.warn('Screen sharing is currently only supported on web');
        throw new Error('Screen sharing is only supported in web browsers');
      }

      // Check if getDisplayMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        console.warn('getDisplayMedia is not available in this environment');
        throw new Error('Screen sharing is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Edge.');
      }

      console.log('Requesting screen share access...');
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });
      
      // Check if we actually got a video track
      const videoTracks = screenStream.getVideoTracks();
      if (videoTracks.length === 0) {
        throw new Error('No video track received from screen share. Please try again.');
      }
      
      console.log('Screen share access granted');
      console.log('Got screen video tracks:', videoTracks.map(t => `${t.kind} (${t.readyState})`));
      
      localScreenStreamRef.current = screenStream;
      setIsScreenSharing(true);
      
      // Add screen share tracks to existing peer connections
      peerConnectionsRef.current.forEach((peerConnection, remoteUserId) => {
        videoTracks.forEach((track) => {
          peerConnection.addTrack(track, screenStream);
          console.log('Added screen track to peer connection for:', remoteUserId);
        });
      });
      
      // Notify other users that we're sharing screen
      if (socket && socket.connected) {
        socket.emit('screen_share_start', { channelId });
      }
      
      // Handle screen share end (when user stops sharing via browser UI)
      videoTracks[0].onended = () => {
        stopScreenShare();
      };
      
    } catch (err) {
      console.error('Error accessing screen share:', err);
      
      // Provide specific error messages based on the error type
      let errorMessage = 'Error accessing screen share. ';
      
      if (err.name === 'NotAllowedError') {
        errorMessage += 'Screen sharing permission was denied. Please allow screen sharing and try again.';
      } else if (err.name === 'NotFoundError') {
        errorMessage += 'No screen or window found to share. Please make sure you have something to share.';
      } else if (err.name === 'NotSupportedError') {
        errorMessage += 'Screen sharing is not supported in this browser. Please use Chrome, Firefox, or Edge.';
      } else if (err.name === 'NotReadableError') {
        errorMessage += 'Screen sharing is blocked by another application. Please close other screen sharing apps and try again.';
      } else if (err.name === 'OverconstrainedError') {
        errorMessage += 'Screen sharing constraints could not be satisfied. Please try with different settings.';
      } else if (err.name === 'SecurityError') {
        errorMessage += 'Screen sharing is not allowed due to security restrictions. Please check your browser settings.';
      } else if (err.message) {
        errorMessage += err.message;
      } else {
        errorMessage += 'Please check your permissions and try again.';
      }
      
      throw new Error(errorMessage);
    }
  };

  const stopScreenShare = () => {
    if (localScreenStreamRef.current) {
      console.log('Stopping screen share');
      
      // Stop screen share tracks
      localScreenStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log('Stopped screen track:', track.kind);
      });
      
      // Remove screen share tracks from peer connections
      peerConnectionsRef.current.forEach((peerConnection, remoteUserId) => {
        const senders = peerConnection.getSenders();
        senders.forEach((sender) => {
          if (sender.track && sender.track.kind === 'video') {
            peerConnection.removeTrack(sender);
            console.log('Removed screen track from peer connection for:', remoteUserId);
          }
        });
      });
      
      localScreenStreamRef.current = null;
      setIsScreenSharing(false);
      
      // Notify other users that we stopped sharing screen
      if (socket && socket.connected) {
        socket.emit('screen_share_stop', { channelId });
      }
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

    const handleScreenShareStart = ({ socketId, userId, username }: { socketId: string, userId?: string, username?: string }) => {
      console.log('User started screen sharing:', username || socketId);
      const existingPeer = peers.get(socketId);
      if (existingPeer) {
        peers.set(socketId, { ...existingPeer, isScreenSharing: true });
      }
    };

    const handleScreenShareStop = ({ socketId, userId, username }: { socketId: string, userId?: string, username?: string }) => {
      console.log('User stopped screen sharing:', username || socketId);
      const existingPeer = peers.get(socketId);
      if (existingPeer) {
        peers.set(socketId, { ...existingPeer, isScreenSharing: false });
      }
    };

    socket.on('voice_users', handleVoiceUsers);
    socket.on('user_joined_voice', handleUserJoined);
    socket.on('voice_offer', handleVoiceOffer);
    socket.on('voice_answer', handleVoiceAnswer);
    socket.on('relay_ice_candidate', handleIceCandidate);
    socket.on('user_left_voice', handleUserLeft);
    socket.on('screen_share_start', handleScreenShareStart);
    socket.on('screen_share_stop', handleScreenShareStop);

    return () => {
      socket.off('voice_users', handleVoiceUsers);
      socket.off('user_joined_voice', handleUserJoined);
      socket.off('voice_offer', handleVoiceOffer);
      socket.off('voice_answer', handleVoiceAnswer);
      socket.off('relay_ice_candidate', handleIceCandidate);
      socket.off('user_left_voice', handleUserLeft);
      socket.off('screen_share_start', handleScreenShareStart);
      socket.off('screen_share_stop', handleScreenShareStop);
    };
  }, [socket, channelId]);

  return {
    isMuted,
    isConnected,
    isScreenSharing,
    peers,
    startVoiceChat,
    toggleMute,
    disconnect,
    startScreenShare,
    stopScreenShare,
  };
};