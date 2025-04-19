import { useEffect, useRef, useState } from 'react';

export function useVoiceChat(channelId, socket) {
  const [isMuted, setIsMuted] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState(new Map());
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const audioElementsRef = useRef(new Map());
  const pendingAnswersRef = useRef(new Map());
  const pendingIceCandidatesRef = useRef(new Map());

  const waitForSignalingState = async (peerConnection, expectedState, timeout = 5000) => {
    if (peerConnection.signalingState === expectedState) {
      return true;
    }

    return new Promise((resolve) => {
      const checkState = () => {
        if (peerConnection.signalingState === expectedState) {
          clearTimeout(timeoutId);
          resolve(true);
          return;
        }
      };

      const timeoutId = setTimeout(() => {
        peerConnection.removeEventListener('signalingstatechange', checkState);
        resolve(false);
      }, timeout);

      peerConnection.addEventListener('signalingstatechange', checkState);
    });
  };

  const createPeerConnection = (remoteUserId) => {
    console.log('Creating peer connection for', remoteUserId);
    
    let peerConnection = peerConnectionsRef.current.get(remoteUserId);
    
    // Only reuse connection if it's in a good state
    if (peerConnection?.connectionState === 'connected' || 
        peerConnection?.connectionState === 'connecting') {
      console.log('Using existing connection for', remoteUserId);
      return peerConnection;
    }

    // Close any existing connection in a bad state
    if (peerConnection) {
      console.log('Closing existing connection in state:', peerConnection.connectionState);
      peerConnection.close();
    }

    // Create new connection
    peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    // Initialize pending ICE candidates array
    pendingIceCandidatesRef.current.set(remoteUserId, []);

    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state for ${remoteUserId}:`, peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') {
        console.log('Peer connection established successfully');
      } else if (peerConnection.connectionState === 'failed' || 
                 peerConnection.connectionState === 'closed') {
        console.log('Connection failed or closed, cleaning up');
        peerConnectionsRef.current.delete(remoteUserId);
        const audioElement = audioElementsRef.current.get(remoteUserId);
        if (audioElement) {
          audioElement.srcObject = null;
          audioElement.remove();
          audioElementsRef.current.delete(remoteUserId);
        }
        setPeers((prevPeers) => {
          const newPeers = new Map(prevPeers);
          newPeers.delete(remoteUserId);
          return newPeers;
        });
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${remoteUserId}:`, peerConnection.iceConnectionState);
    };

    peerConnection.onsignalingstatechange = () => {
      console.log(`Signaling state for ${remoteUserId}:`, peerConnection.signalingState);
      
      // Process any pending answers when we return to stable state
      if (peerConnection.signalingState === 'stable') {
        const pendingAnswer = pendingAnswersRef.current.get(remoteUserId);
        if (pendingAnswer) {
          console.log('Processing pending answer for:', remoteUserId);
          pendingAnswersRef.current.delete(remoteUserId);
          peerConnection.setRemoteDescription(new RTCSessionDescription(pendingAnswer))
            .catch(err => console.error('Error processing pending answer:', err));
        }
      }
    };

    // Only set up negotiation if we have a local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        console.log('Adding track to peer connection', track.kind);
        peerConnection.addTrack(track, localStreamRef.current);
      });
    } else {
      console.warn('No local stream available when creating peer connection');
    }

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate to', remoteUserId);
        socket.emit('relay_ice_candidate', {
          candidate: event.candidate,
          to: remoteUserId,
        });
      }
    };

    // Process any pending ICE candidates for this peer
    const processPendingCandidates = async () => {
      const pendingCandidates = pendingIceCandidatesRef.current.get(remoteUserId) || [];
      console.log(`Processing ${pendingCandidates.length} pending ICE candidates for`, remoteUserId);
      
      for (const candidate of pendingCandidates) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('Added pending ICE candidate for:', remoteUserId);
        } catch (err) {
          console.error('Error adding pending ICE candidate:', err);
        }
      }
      
      // Clear pending candidates
      pendingIceCandidatesRef.current.set(remoteUserId, []);
    };

    peerConnection.addEventListener('signalingstatechange', () => {
      console.log(`Signaling state for ${remoteUserId}:`, peerConnection.signalingState);
      
      if (peerConnection.signalingState === 'stable') {
        // Process pending ICE candidates when we reach stable state
        processPendingCandidates();
        
        // Process any pending answers
        const pendingAnswer = pendingAnswersRef.current.get(remoteUserId);
        if (pendingAnswer) {
          console.log('Processing pending answer for:', remoteUserId);
          pendingAnswersRef.current.delete(remoteUserId);
          peerConnection.setRemoteDescription(new RTCSessionDescription(pendingAnswer))
            .catch(err => console.error('Error processing pending answer:', err));
        }
      }
    });

    peerConnection.ontrack = (event) => {
      console.log('Received remote track', event.track.kind, 'from', remoteUserId);
      const stream = event.streams[0];
      if (stream) {
        setPeers((prevPeers) => {
          const newPeers = new Map(prevPeers);
          newPeers.set(remoteUserId, {
            stream,
            username: `User ${remoteUserId.slice(0, 4)}`,
            avatar: undefined
          });
          return newPeers;
        });

        // Audio element management
        let audioElement = audioElementsRef.current.get(remoteUserId);
        if (!audioElement) {
          audioElement = new Audio();
          audioElement.autoplay = true;
          audioElement.addEventListener('play', () => console.log('Audio playing for', remoteUserId));
          audioElement.addEventListener('error', (e) => console.error('Audio error:', e));
          audioElementsRef.current.set(remoteUserId, audioElement);
        }
        audioElement.srcObject = stream;
        
        // Play with error handling
        const playPromise = audioElement.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            console.error('Error playing audio:', e);
            // Try playing again with user interaction
            const retryPlay = () => {
              audioElement.play().catch(e => console.error('Retry play error:', e));
              document.removeEventListener('click', retryPlay);
            };
            document.addEventListener('click', retryPlay);
          });
        }
      }
    };

    // Store the new connection
    peerConnectionsRef.current.set(remoteUserId, peerConnection);
    return peerConnection;
  };

  const cleanupConnections = () => {
    // Close all peer connections
    peerConnectionsRef.current.forEach((connection) => {
      connection.close();
    });
    peerConnectionsRef.current.clear();
    pendingIceCandidatesRef.current.clear();
    pendingAnswersRef.current.clear();

    // Clean up audio elements
    audioElementsRef.current.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();

    // Reset peers state
    setPeers(new Map());
  };

  const startVoiceChat = async () => {
    try {
      console.log('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      console.log('Microphone access granted');
      
      const tracks = stream.getTracks();
      console.log('Got audio tracks:', tracks.map(t => `${t.kind} (${t.readyState})`));
      
      localStreamRef.current = stream;
      setIsMuted(false);
      setIsConnected(true);
      
      socket.emit('voice_join', { channelId });
      console.log('Joined voice chat room:', channelId);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Error accessing microphone. Please check permissions and try again.');
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const newMutedState = !isMuted;
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !newMutedState;
        console.log('Track enabled:', !newMutedState);
      });
      setIsMuted(newMutedState);
    }
  };

  const disconnect = () => {
    console.log('Disconnecting from voice chat');
    // Stop all local tracks
    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
      console.log('Stopped track:', track.kind);
    });
    localStreamRef.current = null;

    cleanupConnections();

    // Reset state
    setIsConnected(false);
    setIsMuted(true);

    // Leave the voice channel
    socket.emit('voice_leave', { channelId });
  };

  useEffect(() => {
    if (!socket) return;

    // Socket reconnection handler
    const handleReconnect = () => {
      console.log('Socket reconnected, re-establishing voice connections');
      if (isConnected && localStreamRef.current) {
        // Clean up existing connections
        cleanupConnections();
        // Rejoin the voice channel
        socket.emit('voice_join', { channelId });
      }
    };

    // Add reconnect event listener
    socket.io.on("reconnect", handleReconnect);

    const handleExistingUsers = async ({ users }) => {
      console.log('Received existing users:', users);
      // Only try to connect if we have a local stream
      if (!localStreamRef.current) {
        console.warn('No local stream when handling existing users');
        return;
      }

      // Create peer connections for each existing user
      for (const userId of users) {
        if (userId === socket.id) continue; // Skip self
        console.log('Creating offer for existing user:', userId);
        
        try {
          const peerConnection = createPeerConnection(userId);
          if (!peerConnection) {
            console.error('Failed to create peer connection for', userId);
            continue;
          }

          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          console.log('Sending offer to:', userId);
          socket.emit('voice_offer', { offer, to: userId });
        } catch (err) {
          console.error('Error creating offer for existing user:', err);
        }
      }
    };

    const handleUserJoined = async ({ userId }) => {
      console.log('User joined voice:', userId);
      // Only create an offer if we have a local stream and we are the "older" peer
      if (localStreamRef.current && socket.id < userId) {
        try {
          const peerConnection = createPeerConnection(userId);
          if (!peerConnection) {
            console.error('Failed to create peer connection for', userId);
            return;
          }

          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          console.log('Sending offer to:', userId);
          socket.emit('voice_offer', { offer, to: userId });
        } catch (err) {
          console.error('Error creating offer:', err);
        }
      }
    };

    const handleVoiceOffer = async ({ offer, from }) => {
      console.log('Received offer from:', from);
      if (!localStreamRef.current) {
        console.warn('No local stream when receiving offer');
        return;
      }

      try {
        const peerConnection = createPeerConnection(from);
        if (!peerConnection) {
          console.error('Failed to create peer connection for', from);
          return;
        }

        // Wait for stable state before setting remote description
        const isStable = await waitForSignalingState(peerConnection, 'stable');
        if (!isStable) {
          console.error('Timed out waiting for stable state');
          return;
        }

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        // Small delay to ensure local description is set
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('Sending answer to:', from);
        socket.emit('voice_answer', { answer, to: from });
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    };

    const handleVoiceAnswer = async ({ answer, from }) => {
      console.log('Received answer from:', from);
      const peerConnection = peerConnectionsRef.current.get(from);
      if (!peerConnection) {
        console.error('No peer connection found for', from);
        return;
      }

      try {
        if (peerConnection.signalingState === 'have-local-offer') {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } else {
          console.log('Queueing answer for later processing');
          pendingAnswersRef.current.set(from, answer);
          
          // Set a timeout to clear pending answer if not processed
          setTimeout(() => {
            if (pendingAnswersRef.current.has(from)) {
              console.warn('Clearing unprocessed pending answer for:', from);
              pendingAnswersRef.current.delete(from);
            }
          }, 10000);
        }
      } catch (err) {
        console.error('Error in answer handling:', err);
      }
    };

    const handleIceCandidate = async ({ candidate, from }) => {
      const peerConnection = peerConnectionsRef.current.get(from);
      if (!peerConnection) {
        console.log('No peer connection yet for ICE candidate from', from);
        // Queue the ICE candidate
        const pendingCandidates = pendingIceCandidatesRef.current.get(from) || [];
        pendingCandidatesRef.current.set(from, [...pendingCandidates, candidate]);
        return;
      }

      // If we don't have a remote description yet, queue the candidate
      if (!peerConnection.remoteDescription) {
        console.log('Remote description not set yet, queueing ICE candidate from', from);
        const pendingCandidates = pendingIceCandidatesRef.current.get(from) || [];
        pendingIceCandidatesRef.current.set(from, [...pendingCandidates, candidate]);
        return;
      }

      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('Added ICE candidate from:', from);
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    };

    const handleUserLeft = ({ userId }) => {
      console.log('User left voice:', userId);
      const peerConnection = peerConnectionsRef.current.get(userId);
      if (peerConnection) {
        peerConnection.close();
        peerConnectionsRef.current.delete(userId);
      }
      
      const audioElement = audioElementsRef.current.get(userId);
      if (audioElement) {
        audioElement.srcObject = null;
        audioElement.remove();
        audioElementsRef.current.delete(userId);
      }
      
      setPeers((prevPeers) => {
        const newPeers = new Map(prevPeers);
        newPeers.delete(userId);
        return newPeers;
      });
    };

    socket.on('voice_users', handleExistingUsers);
    socket.on('user_joined_voice', handleUserJoined);
    socket.on('voice_offer', handleVoiceOffer);
    socket.on('voice_answer', handleVoiceAnswer);
    socket.on('relay_ice_candidate', handleIceCandidate);
    socket.on('user_left_voice', handleUserLeft);

    return () => {
      socket.off('voice_users', handleExistingUsers);
      socket.off('user_joined_voice', handleUserJoined);
      socket.off('voice_offer', handleVoiceOffer);
      socket.off('voice_answer', handleVoiceAnswer);
      socket.off('relay_ice_candidate', handleIceCandidate);
      socket.off('user_left_voice', handleUserLeft);
      socket.io.off("reconnect", handleReconnect);
    };
  }, [socket, channelId, isConnected]);

  useEffect(() => {
    return () => {
      console.log('Cleaning up voice chat');
      disconnect();
    };
  }, []);

  return {
    isMuted,
    isConnected,
    peers,
    startVoiceChat,
    toggleMute,
    disconnect,
  };
}