import { useEffect, useRef, useState } from 'react';

export function useVoiceChat(channelId, socket) {
  const [isMuted, setIsMuted] = useState(true);
  const [peers, setPeers] = useState(new Map());
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());

  // Initialize WebRTC peer connection
  const createPeerConnection = (remoteUserId) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    // Add local stream tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStreamRef.current);
      });
    }

    // Handle incoming ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('relay_ice_candidate', {
          candidate: event.candidate,
          to: remoteUserId,
        });
      }
    };

    // Handle incoming audio streams
    peerConnection.ontrack = (event) => {
      setPeers((prevPeers) => new Map(prevPeers.set(remoteUserId, event.streams[0])));
    };

    return peerConnection;
  };

  // Start voice chat
  const startVoiceChat = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setIsMuted(false);
      socket.emit('voice_join', { channelId });
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  };

  // Handle mute/unmute
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  // Clean up
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      peerConnectionsRef.current.forEach((connection) => connection.close());
    };
  }, []);

  // Handle WebRTC signaling
  useEffect(() => {
    if (!socket) return;

    socket.on('user_joined_voice', async ({ userId }) => {
      const peerConnection = createPeerConnection(userId);
      peerConnectionsRef.current.set(userId, peerConnection);

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('voice_offer', { offer, to: userId });
    });

    socket.on('voice_offer', async ({ offer, from }) => {
      const peerConnection = createPeerConnection(from);
      peerConnectionsRef.current.set(from, peerConnection);

      await peerConnection.setRemoteDescription(offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('voice_answer', { answer, to: from });
    });

    socket.on('voice_answer', async ({ answer, from }) => {
      const peerConnection = peerConnectionsRef.current.get(from);
      if (peerConnection) {
        await peerConnection.setRemoteDescription(answer);
      }
    });

    socket.on('relay_ice_candidate', async ({ candidate, from }) => {
      const peerConnection = peerConnectionsRef.current.get(from);
      if (peerConnection) {
        await peerConnection.addIceCandidate(candidate);
      }
    });

    socket.on('user_left_voice', ({ userId }) => {
      const peerConnection = peerConnectionsRef.current.get(userId);
      if (peerConnection) {
        peerConnection.close();
        peerConnectionsRef.current.delete(userId);
        setPeers((prevPeers) => {
          const newPeers = new Map(prevPeers);
          newPeers.delete(userId);
          return newPeers;
        });
      }
    });

    return () => {
      socket.off('user_joined_voice');
      socket.off('voice_offer');
      socket.off('voice_answer');
      socket.off('relay_ice_candidate');
      socket.off('user_left_voice');
    };
  }, [socket, channelId]);

  return {
    isMuted,
    peers,
    startVoiceChat,
    toggleMute,
  };
}