import { useEffect, useRef, useState, useCallback } from 'react';

export function useVoiceChat(channelId, socket, isPreview = false) {
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState(new Map());
  const localStreamRef = useRef(null);
  const localScreenStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const audioElementsRef = useRef(new Map());
  const pendingAnswersRef = useRef(new Map());
  const pendingIceCandidatesRef = useRef(new Map());
  const volumesRef = useRef(new Map()); // remoteUserId -> volume (0.0 - 1.0)
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [localLevel, setLocalLevel] = useState(0);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const levelRafRef = useRef(null);
  // Local sensitivity calibration
  const localNoiseFloorRef = useRef(0.002);
  const localCalibratingRef = useRef(true);
  const localCalibEndTimeRef = useRef(0);
  // Remote speaking detection
  const remoteAudioContextRef = useRef(null);
  const remoteAnalysersRef = useRef(new Map()); // remoteUserId -> { analyser, source, dataArray, speaking, silenceMs, lastTick, noiseFloor }
  const remoteSpeakingRafRef = useRef(null);

  const waitForSignalingState = async (peerConnection, expectedState, timeout = 5000) => {
    if (peerConnection.signalingState === expectedState) {
      return true;
    }

    return new Promise((resolve) => {
      const checkState = () => {
        if (peerConnection.signalingState === expectedState) {
          clearTimeout(timeoutId);
          peerConnection.removeEventListener('signalingstatechange', checkState);
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

  const setupLocalAnalyser = (stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.warn('Web Audio API not supported');
        return;
      }
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const resumeIfNeeded = async () => {
        try {
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
          }
        } catch (_) {}
      };
      resumeIfNeeded();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.88;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let speaking = false;
      let silenceMs = 0;
      let lastTick = performance.now();

      // Calibration for first 800ms to capture room noise
      localCalibratingRef.current = true;
      localCalibEndTimeRef.current = performance.now() + 800;
      localNoiseFloorRef.current = 0.002; // default fallback

      const minThreshold = 0.004; // base minimal threshold
      const gainFactor = 3.0; // how far above floor we trigger
      const releaseMs = 200; // quicker release for responsiveness

      const tick = () => {
        analyser.getByteTimeDomainData(dataArray);
        // Compute RMS
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128; // -1..1
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setLocalLevel(rms);

        const now = performance.now();
        const dt = now - lastTick;
        lastTick = now;

        // Calibration window
        if (localCalibratingRef.current) {
          if (now < localCalibEndTimeRef.current) {
            // track running average of floor
            const alpha = 0.05;
            localNoiseFloorRef.current = (1 - alpha) * localNoiseFloorRef.current + alpha * rms;
          } else {
            localCalibratingRef.current = false;
          }
        }

        const dynamicThreshold = Math.max(minThreshold, localNoiseFloorRef.current * gainFactor);

        if (!isMuted && rms > dynamicThreshold) {
          speaking = true;
          silenceMs = 0;
        } else {
          silenceMs += dt;
          if (silenceMs >= releaseMs) {
            speaking = false;
          }
        }
        setIsSpeaking(speaking);

        levelRafRef.current = requestAnimationFrame(tick);
      };

      levelRafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.warn('Failed to setup local analyser', e);
    }
  };

  const teardownLocalAnalyser = () => {
    if (levelRafRef.current) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (_) {}
      audioContextRef.current = null;
    }
    setLocalLevel(0);
    setIsSpeaking(false);
  };

  const ensureRemoteAudioContext = () => {
    if (remoteAudioContextRef.current) return remoteAudioContextRef.current;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      console.warn('Web Audio API not supported for remote analysis');
      return null;
    }
    const ctx = new AudioCtx();
    remoteAudioContextRef.current = ctx;
    // Best-effort resume
    try { if (ctx.state === 'suspended') { ctx.resume(); } } catch (_) {}
    return ctx;
  };

  const startRemoteSpeakingLoop = () => {
    if (remoteSpeakingRafRef.current) return; // already running
    const releaseMs = 200;
    const minThreshold = 0.004;
    const gainFactor = 3.0;

    const tick = () => {
      const entries = Array.from(remoteAnalysersRef.current.entries());
      for (const [remoteUserId, ctx] of entries) {
        try {
          ctx.analyser.getByteTimeDomainData(ctx.dataArray);
          let sum = 0;
          for (let i = 0; i < ctx.dataArray.length; i++) {
            const v = (ctx.dataArray[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / ctx.dataArray.length);
          const now = performance.now();
          const dt = now - ctx.lastTick;
          ctx.lastTick = now;

          // Update noise floor (EMA)
          const alpha = 0.05;
          ctx.noiseFloor = (1 - alpha) * (ctx.noiseFloor || 0.002) + alpha * rms;
          const dynamicThreshold = Math.max(minThreshold, (ctx.noiseFloor || 0.002) * gainFactor);

          let speaking = ctx.speaking;
          if (rms > dynamicThreshold) {
            speaking = true;
            ctx.silenceMs = 0;
          } else {
            ctx.silenceMs += dt;
            if (ctx.silenceMs >= releaseMs) speaking = false;
          }

          if (speaking !== ctx.speaking) {
            ctx.speaking = speaking;
            // update peers map with minimal changes
            setPeers((prev) => {
              const next = new Map(prev);
              const existing = next.get(remoteUserId);
              if (!existing) return prev;
              next.set(remoteUserId, { ...existing, speaking });
              return next;
            });
          }
        } catch (e) {
          // If analyser fails, skip this peer for now
        }
      }
      if (remoteAnalysersRef.current.size > 0) {
        remoteSpeakingRafRef.current = requestAnimationFrame(tick);
      } else {
        remoteSpeakingRafRef.current = null;
      }
    };
    remoteSpeakingRafRef.current = requestAnimationFrame(tick);
  };

  const setupRemoteAnalyser = (remoteUserId, stream) => {
    try {
      const audioCtx = ensureRemoteAudioContext();
      if (!audioCtx) return;
      // Avoid duplicate
      if (remoteAnalysersRef.current.has(remoteUserId)) return;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.88;
      // Connect source to analyser and to gain->destination for playback
      source.connect(analyser);
      const gainNode = audioCtx.createGain();
      const savedGain = volumesRef.current.get(remoteUserId);
      gainNode.gain.value = typeof savedGain === 'number' ? savedGain : 1.0;
      source.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      remoteAnalysersRef.current.set(remoteUserId, {
        analyser,
        source,
        gainNode,
        dataArray,
        speaking: false,
        silenceMs: 0,
        lastTick: performance.now(),
        noiseFloor: 0.002
      });
      startRemoteSpeakingLoop();
    } catch (e) {
      console.warn('Failed to setup remote analyser for', remoteUserId, e);
    }
  };

  const teardownRemoteAnalyser = (remoteUserId) => {
    const entry = remoteAnalysersRef.current.get(remoteUserId);
    if (!entry) return;
    try {
      // Disconnect nodes
      try { entry.source.disconnect(); } catch (_) {}
      try { entry.analyser.disconnect(); } catch (_) {}
      try { entry.gainNode.disconnect(); } catch (_) {}
    } finally {
      remoteAnalysersRef.current.delete(remoteUserId);
    }
  };

  const teardownAllRemoteAnalysers = () => {
    for (const remoteUserId of remoteAnalysersRef.current.keys()) {
      teardownRemoteAnalyser(remoteUserId);
    }
    if (remoteSpeakingRafRef.current) {
      cancelAnimationFrame(remoteSpeakingRafRef.current);
      remoteSpeakingRafRef.current = null;
    }
    if (remoteAudioContextRef.current) {
      try { remoteAudioContextRef.current.close(); } catch (_) {}
      remoteAudioContextRef.current = null;
    }
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
      try {
        peerConnection.close();
      } catch (e) {
        console.warn('Error closing existing connection:', e);
      }
    }

    // Create new connection
    peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    // Initialize pending ICE candidates array
    pendingIceCandidatesRef.current.set(remoteUserId, []);

    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state for ${remoteUserId}:`, peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') {
        console.log('Peer connection established successfully');
      } else if (peerConnection.connectionState === 'failed') {
        console.log('Connection failed, attempting to reconnect...');
        // Don't immediately clean up on failed state, give it a chance to recover
        setTimeout(() => {
          if (peerConnection.connectionState === 'failed') {
            console.log('Connection still failed after timeout, cleaning up');
            cleanupPeerConnection(remoteUserId);
          }
        }, 5000);
      } else if (peerConnection.connectionState === 'closed' ||
                 peerConnection.connectionState === 'disconnected') {
        console.log('Connection closed or disconnected, cleaning up');
        cleanupPeerConnection(remoteUserId);
      }
    };

    // Helper function to clean up a peer connection
    const cleanupPeerConnection = (userId) => {
      peerConnectionsRef.current.delete(userId);
      const audioElement = audioElementsRef.current.get(userId);
      if (audioElement) {
        audioElement.srcObject = null;
        audioElement.remove();
        audioElementsRef.current.delete(userId);
      }
      teardownRemoteAnalyser(userId);
      volumesRef.current.delete(userId);
      setPeers((prevPeers) => {
        const newPeers = new Map(prevPeers);
        newPeers.delete(userId);
        console.log('Removed disconnected user from peers. Remaining peers:', newPeers.size);
        return newPeers;
      });
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${remoteUserId}:`, peerConnection.iceConnectionState);
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

    peerConnection.onsignalingstatechange = () => {
      console.log(`Signaling state for ${remoteUserId}:`, peerConnection.signalingState);
      
      if (peerConnection.signalingState === 'stable') {
        // Process pending ICE candidates when we reach stable state
        processPendingCandidates();
        
        // Process any pending answers only if we're in the right state
        const pendingAnswer = pendingAnswersRef.current.get(remoteUserId);
        if (pendingAnswer && peerConnection.signalingState === 'stable') {
          console.log('Processing pending answer for:', remoteUserId);
          pendingAnswersRef.current.delete(remoteUserId);
          peerConnection.setRemoteDescription(new RTCSessionDescription(pendingAnswer))
            .catch(err => {
              console.error('Error processing pending answer:', err);
              // If we can't process the pending answer, clear it
              pendingAnswersRef.current.delete(remoteUserId);
            });
        }
      }
    };

    // Add local audio stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        console.log('Adding audio track to peer connection', track.kind);
        peerConnection.addTrack(track, localStreamRef.current);
      });
    } else {
      console.warn('No local audio stream available when creating peer connection');
    }

    // Add local screen share tracks if available
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => {
        console.log('Adding existing screen track to new peer connection', track.kind);
        peerConnection.addTrack(track, localScreenStreamRef.current);
      });
    }

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate to', remoteUserId);
        if (socket && socket.connected) {
          socket.emit('relay_ice_candidate', {
            candidate: event.candidate,
            to: remoteUserId,
          });
        }
      }
    };

    // Add error handling to suppress DTLS transport errors
    peerConnection.oniceconnectionstatechange = () => {
      if (peerConnection.iceConnectionState === 'failed') {
        console.log('ICE connection failed for', remoteUserId, '- attempting restart');
        // Don't log the DTLS error as it's expected during connection establishment
      }
    };

    peerConnection.ontrack = (event) => {
      console.log('Received remote track', event.track.kind, 'from', remoteUserId, 'Track details:', {
        id: event.track.id,
        kind: event.track.kind,
        label: event.track.label,
        enabled: event.track.enabled,
        readyState: event.track.readyState
      });
      const stream = event.streams[0];
      if (stream) {
        console.log('Stream details:', {
          id: stream.id,
          active: stream.active,
          audioTracks: stream.getAudioTracks().length,
          videoTracks: stream.getVideoTracks().length
        });
        setPeers((prevPeers) => {
          const newPeers = new Map(prevPeers);
          const existingPeer = newPeers.get(remoteUserId);
          
          // Get existing streams or create new ones
          let audioStream = existingPeer?.stream || new MediaStream();
          let videoStream = existingPeer?.videoStream || new MediaStream();
          
          // Add new tracks to existing streams
          stream.getTracks().forEach(track => {
            if (track.kind === 'audio') {
              // Check if this audio track is already in the stream
              const hasTrack = audioStream.getTracks().some(existingTrack => existingTrack.id === track.id);
              if (!hasTrack) {
                audioStream.addTrack(track);
                console.log('Added audio track to existing stream for', remoteUserId);
              }
            } else if (track.kind === 'video') {
              // Check if this video track is already in the stream
              const hasTrack = videoStream.getTracks().some(existingTrack => existingTrack.id === track.id);
              if (!hasTrack) {
                videoStream.addTrack(track);
                console.log('Added video track to existing stream for', remoteUserId);
              }
            }
          });
          
          newPeers.set(remoteUserId, {
            ...existingPeer,
            stream: audioStream, // Keep audio stream for audio playback
            videoStream: videoStream.getVideoTracks().length > 0 ? videoStream : null, // Separate video stream
            username: existingPeer?.username || `User ${remoteUserId.slice(0, 4)}`,
            avatar_url: existingPeer?.avatar_url,
            userId: existingPeer?.userId,
            volume: existingPeer?.volume ?? (volumesRef.current.get(remoteUserId) ?? 1),
            speaking: existingPeer?.speaking ?? false
          });
          return newPeers;
        });

        // Audio element management (muted, since playback is via Web Audio)
        let audioElement = audioElementsRef.current.get(remoteUserId);
        if (!audioElement) {
          audioElement = new Audio();
          audioElement.autoplay = true;
          audioElement.muted = true;
          audioElement.addEventListener('play', () => console.log('Audio element (muted) for', remoteUserId));
          audioElement.addEventListener('error', (e) => console.error('Audio element error:', e));
          audioElementsRef.current.set(remoteUserId, audioElement);
        }
        
        // Update audio element with all audio tracks
        const audioStream = new MediaStream();
        stream.getAudioTracks().forEach(track => audioStream.addTrack(track));
        audioElement.srcObject = audioStream;
        
        // Setup analyser + gain playback for remote speaking detection and volume control
        setupRemoteAnalyser(remoteUserId, audioStream);
      }
    };

    // Store the new connection
    peerConnectionsRef.current.set(remoteUserId, peerConnection);
    return peerConnection;
  };

  const cleanupConnections = useCallback(() => {
    // Close all peer connections
    peerConnectionsRef.current.forEach((connection, remoteUserId) => {
      try { connection.close(); } catch (_) {}
      teardownRemoteAnalyser(remoteUserId);
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
  }, []);

  const startVoiceChat = useCallback(async () => {
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

      setupLocalAnalyser(stream);
      
      if (socket && socket.connected) {
        socket.emit('voice_join', { channelId });
        console.log('Joined voice chat room:', channelId);
      } else {
        console.error('Socket not connected');
      }
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Error accessing microphone. Please check permissions and try again.');
    }
  }, [socket, channelId]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const newMutedState = !isMuted;
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !newMutedState;
        console.log('Track enabled:', !newMutedState);
      });
      setIsMuted(newMutedState);
      // Broadcast mute status to others
      try {
        if (socket && socket.connected) {
          socket.emit('voice_mute', { channelId, muted: newMutedState });
        }
      } catch (_) {}
    }
  }, [isMuted, socket, channelId]);

  const toggleDeafen = useCallback(() => {
    const newDeafenedState = !isDeafened;
    setIsDeafened(newDeafenedState);
    
    if (newDeafenedState) {
      // When deafened, also mute yourself
      if (!isMuted) {
        toggleMute();
      }
      // Mute all remote audio
      audioElementsRef.current.forEach((audioElement) => {
        audioElement.muted = true;
      });
    } else {
      // When undeafened, restore remote audio volumes
      audioElementsRef.current.forEach((audioElement, userId) => {
        const volume = volumesRef.current.get(userId) || 1;
        audioElement.muted = false;
        // Volume is controlled by Web Audio gain nodes, not the audio element
      });
    }
  }, [isDeafened, isMuted, toggleMute]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting from voice chat');
    // Stop all local tracks
    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
      console.log('Stopped track:', track.kind);
    });
    localStreamRef.current = null;

    // Stop screen sharing if active
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log('Stopped screen track:', track.kind);
      });
      localScreenStreamRef.current = null;
      setIsScreenSharing(false);
    }

    teardownLocalAnalyser();
    teardownAllRemoteAnalysers();

    cleanupConnections();

    // Reset state
    setIsConnected(false);
    setIsMuted(true);

    // Leave the voice channel
    if (socket && socket.connected) {
      socket.emit('voice_leave', { channelId });
    }
  }, [socket, channelId, cleanupConnections]);

  const startScreenShare = useCallback(async () => {
    try {
      console.log('Requesting screen share access...');
      
      // Check if we're in Electron
      const isElectron = typeof window !== 'undefined' && window.electronAPI;
      
      let screenStream;
      
      if (isElectron) {
        try {
          console.log('Detected Electron environment, using Electron screen capture');
          
          // Get screen sources from Electron main process via secure API
          const sources = await window.electronAPI.getScreenSources();
          
          console.log('Available screen sources:', sources);
          
          if (sources.length === 0) {
            throw new Error('No screen sources available. Make sure you have windows or screens to share.');
          }
          
          // Use the first available source
          const source = sources[0];
          console.log('Using screen source:', source.name, 'with ID:', source.id);
          
          screenStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id,
                minWidth: 1280,
                maxWidth: 1920,
                minHeight: 720,
                maxHeight: 1080
              }
            }
          });
        } catch (electronErr) {
          console.error('Electron screen capture error:', electronErr);
          
          // Try fallback to getDisplayMedia if available
          if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
            console.log('Falling back to getDisplayMedia API');
            screenStream = await navigator.mediaDevices.getDisplayMedia({
              video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 }
              },
              audio: false
            });
          } else {
            throw new Error('Failed to access screen in Electron. Please check your screen sharing permissions and try again.');
          }
        }
      } else {
        // Check if screen sharing is supported in web browsers
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          throw new Error('Screen sharing is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Edge.');
        }
        
        // Use getDisplayMedia API for web browsers
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          },
          audio: false
        });
      }
      
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
      peerConnectionsRef.current.forEach(async (peerConnection, remoteUserId) => {
        // Clear any pending answers before renegotiation
        pendingAnswersRef.current.delete(remoteUserId);
        
        videoTracks.forEach((track) => {
          console.log('Adding screen track to peer connection for:', remoteUserId, 'Track details:', {
            id: track.id,
            kind: track.kind,
            label: track.label,
            enabled: track.enabled,
            readyState: track.readyState
          });
          peerConnection.addTrack(track, screenStream);
        });
        
        // Renegotiate the connection to include the new video tracks
        try {
          console.log('Renegotiating connection for screen share with:', remoteUserId);
          console.log('Current connection state:', peerConnection.connectionState);
          console.log('Current signaling state:', peerConnection.signalingState);
          
          // Only create offer if connection is in a valid state
          if (peerConnection.connectionState === 'connected' || 
              peerConnection.connectionState === 'connecting') {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            console.log('Sending renegotiation offer to:', remoteUserId);
            socket.emit('voice_offer', { offer, to: remoteUserId });
          } else {
            console.log('Connection not in valid state for renegotiation:', peerConnection.connectionState);
          }
        } catch (err) {
          console.error('Error renegotiating connection for screen share:', err);
        }
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
      } else if (err.name === 'AbortError') {
        errorMessage += 'Screen sharing was cancelled by the user.';
      } else if (err.name === 'TypeError') {
        errorMessage += 'Screen sharing API is not available. Please check if you are running in a supported environment.';
      } else if (err.message) {
        // Check for specific Electron-related errors
        if (err.message.includes('get-screen-sources')) {
          errorMessage += 'Failed to get screen sources from Electron. Please restart the application and try again.';
        } else if (err.message.includes('chromeMediaSource')) {
          errorMessage += 'Electron screen capture failed. Please check your system permissions and try again.';
        } else {
          errorMessage += err.message;
        }
      } else {
        errorMessage += 'Please check your permissions and try again.';
      }
      
      alert(errorMessage);
    }
  }, [socket, channelId]);

  const stopScreenShare = useCallback(() => {
    if (localScreenStreamRef.current) {
      console.log('Stopping screen share');
      
      // Stop screen share tracks
      localScreenStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log('Stopped screen track:', track.kind);
      });
      
      // Remove screen share tracks from peer connections
      peerConnectionsRef.current.forEach(async (peerConnection, remoteUserId) => {
        const senders = peerConnection.getSenders();
        let removedVideoTrack = false;
        
        senders.forEach((sender) => {
          if (sender.track && sender.track.kind === 'video') {
            peerConnection.removeTrack(sender);
            console.log('Removed screen track from peer connection for:', remoteUserId);
            removedVideoTrack = true;
          }
        });
        
        // Renegotiate the connection after removing video tracks
        if (removedVideoTrack) {
          try {
            console.log('Renegotiating connection after stopping screen share with:', remoteUserId);
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            console.log('Sending renegotiation offer after stopping screen share to:', remoteUserId);
            socket.emit('voice_offer', { offer, to: remoteUserId });
          } catch (err) {
            console.error('Error renegotiating connection after stopping screen share:', err);
          }
        }
      });
      
      localScreenStreamRef.current = null;
      setIsScreenSharing(false);
      
      // Notify other users that we stopped sharing screen
      if (socket && socket.connected) {
        socket.emit('screen_share_stop', { channelId });
      }
    }
  }, [socket, channelId]);

  useEffect(() => {
    if (!socket) return;

    // Socket reconnection handler
    const handleReconnect = () => {
      console.log('Socket reconnected, re-establishing voice connections');
      if (isConnected && localStreamRef.current) {
        // Only clean up if we don't have any working connections
        const hasWorkingConnections = Array.from(peerConnectionsRef.current.values())
          .some(conn => conn.connectionState === 'connected' || conn.connectionState === 'connecting');
        
        if (!hasWorkingConnections) {
          console.log('No working connections found, cleaning up and rejoining');
          cleanupConnections();
          // Rejoin the voice channel
          socket.emit('voice_join', { channelId });
        } else {
          console.log('Found working connections, skipping cleanup');
        }
      }
    };

    // Socket disconnection handler
    const handleDisconnect = () => {
      console.log('Socket disconnected, cleaning up voice connections');
      // Clean up all peer connections when socket disconnects
      cleanupConnections();
    };

    // Add event listeners
    socket.io.on("reconnect", handleReconnect);
    socket.io.on("disconnect", handleDisconnect);

    const handleExistingUsers = async ({ users }) => {
      console.log('Received existing users:', users);
      // Only try to connect if we have a local stream
      if (!localStreamRef.current) {
        console.warn('No local stream when handling existing users');
        return;
      }

      // Create peer connections for each existing user
      for (const user of users) {
        const socketId = user.socketId || user; // Handle both new format and legacy
        if (socketId === socket.id) continue; // Skip self
        
        // Check if we already have a working connection for this user
        const existingConnection = peerConnectionsRef.current.get(socketId);
        if (existingConnection && 
            (existingConnection.connectionState === 'connected' || 
             existingConnection.connectionState === 'connecting')) {
          console.log('Already have working connection for', socketId, 'skipping');
          continue;
        }
        
        // Store user info for display
        if (user.username) {
          setPeers((prevPeers) => {
            const newPeers = new Map(prevPeers);
            
            // Check if this user already exists (same userId but different socketId)
            const existingPeer = Array.from(newPeers.values()).find(peer => peer.userId === user.userId);
            if (existingPeer) {
              console.log('User already exists in existing users, updating socketId for:', user.username, 'from', existingPeer.socketId, 'to', socketId);
              // Remove the old entry and add the new one
              newPeers.delete(Array.from(newPeers.keys()).find(key => newPeers.get(key).userId === user.userId));
            }
            
            newPeers.set(socketId, {
              username: user.username,
              avatar_url: user.avatar_url,
              userId: user.userId,
              stream: null, // Will be set when track is received
              speaking: false,
              muted: !!user.muted,
              isScreenSharing: !!user.isScreenSharing // Include screen share state
            });
            return newPeers;
          });
        }
        
        console.log('Creating offer for existing user:', socketId);
        
        try {
          const peerConnection = createPeerConnection(socketId);
          if (!peerConnection) {
            console.error('Failed to create peer connection for', socketId);
            continue;
          }

          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          console.log('Sending offer to:', socketId);
          socket.emit('voice_offer', { offer, to: socketId });
        } catch (err) {
          console.error('Error creating offer for existing user:', err);
        }
      }
    };

    const handleUserJoined = async ({ socketId, userId, username, avatar_url, muted, isScreenSharing }) => {
      console.log('User joined voice:', username || socketId);
      
      // Store user info for display
      if (username) {
        setPeers((prevPeers) => {
          const newPeers = new Map(prevPeers);
          
          // Check if this user already exists (same userId but different socketId)
          const existingPeer = Array.from(newPeers.values()).find(peer => peer.userId === userId);
          if (existingPeer) {
            console.log('User already exists, updating socketId for:', username, 'from', existingPeer.socketId, 'to', socketId);
            // Remove the old entry and add the new one
            newPeers.delete(Array.from(newPeers.keys()).find(key => newPeers.get(key).userId === userId));
          }
          
          newPeers.set(socketId, {
            username: username,
            avatar_url: avatar_url,
            userId: userId,
            stream: null, // Will be set when track is received
            speaking: false,
            muted: !!muted,
            isScreenSharing: !!isScreenSharing // Include screen share state
          });
          return newPeers;
        });
      }
      
      // Only create an offer if we have a local stream and we are the "older" peer
      if (localStreamRef.current && socket.id < socketId) {
        // Check if we already have a working connection for this user
        const existingConnection = peerConnectionsRef.current.get(socketId);
        if (existingConnection && 
            (existingConnection.connectionState === 'connected' || 
             existingConnection.connectionState === 'connecting')) {
          console.log('Already have working connection for new user', socketId, 'skipping');
          return;
        }
        
        try {
          const peerConnection = createPeerConnection(socketId);
          if (!peerConnection) {
            console.error('Failed to create peer connection for', socketId);
            return;
          }

          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          console.log('Sending offer to:', socketId);
          socket.emit('voice_offer', { offer, to: socketId });
        } catch (err) {
          console.error('Error creating offer:', err);
        }
      }
    };

    const handleUserVoiceMute = ({ socketId, userId, muted }) => {
      setPeers((prev) => {
        const next = new Map(prev);
        const existing = next.get(socketId);
        if (!existing) return prev;
        next.set(socketId, { ...existing, muted: !!muted });
        return next;
      });
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
        console.log('Current signaling state:', peerConnection.signalingState);
        
        if (peerConnection.signalingState === 'have-local-offer') {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('Successfully set remote description for:', from);
        } else if (peerConnection.signalingState === 'stable') {
          // If we're in stable state, this might be a renegotiation answer
          console.log('Connection is stable, this might be a renegotiation answer. Ignoring.');
          return;
        } else {
          console.log('Queueing answer for later processing, current state:', peerConnection.signalingState);
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
        // Clear the pending answer if there was an error
        pendingAnswersRef.current.delete(from);
      }
    };

    const handleIceCandidate = async ({ candidate, from }) => {
      const peerConnection = peerConnectionsRef.current.get(from);
      if (!peerConnection) {
        console.log('No peer connection yet for ICE candidate from', from);
        // Queue the ICE candidate
        const pendingCandidates = pendingIceCandidatesRef.current.get(from) || [];
        pendingIceCandidatesRef.current.set(from, [...pendingCandidates, candidate]);
        return;
      }

      // Check if connection is in a valid state
      if (peerConnection.connectionState === 'closed' || 
          peerConnection.connectionState === 'failed' ||
          peerConnection.signalingState === 'closed') {
        console.log('Peer connection is closed/failed, ignoring ICE candidate from', from);
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
        // Don't log "Unknown ufrag" errors as they're often harmless
        if (!err.message.includes('Unknown ufrag')) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    };

    const handleUserLeft = ({ socketId, userId, username }) => {
      console.log('User left voice:', username || socketId);
      
      // Clean up peer connection
      const peerConnection = peerConnectionsRef.current.get(socketId);
      if (peerConnection) {
        peerConnection.close();
        peerConnectionsRef.current.delete(socketId);
      }
      
      // Clean up audio element
      const audioElement = audioElementsRef.current.get(socketId);
      if (audioElement) {
        audioElement.srcObject = null;
        audioElement.remove();
        audioElementsRef.current.delete(socketId);
      }
      
      // Remove volume tracking
      volumesRef.current.delete(socketId);

      // Clean up remote analyser
      teardownRemoteAnalyser(socketId);
      
      // Remove from peers
      setPeers((prevPeers) => {
        const newPeers = new Map(prevPeers);
        newPeers.delete(socketId);
        console.log('Removed user from peers. Remaining peers:', newPeers.size);
        return newPeers;
      });
    };

    const handleScreenShareStart = ({ socketId, userId, username }) => {
      console.log('User started screen sharing:', username || socketId);
      console.log('Current peer connections:', Array.from(peerConnectionsRef.current.keys()));
      setPeers((prevPeers) => {
        const newPeers = new Map(prevPeers);
        const existingPeer = newPeers.get(socketId);
        if (existingPeer) {
          newPeers.set(socketId, { ...existingPeer, isScreenSharing: true });
        }
        return newPeers;
      });
    };

    const handleScreenShareStop = ({ socketId, userId, username }) => {
      console.log('User stopped screen sharing:', username || socketId);
      setPeers((prevPeers) => {
        const newPeers = new Map(prevPeers);
        const existingPeer = newPeers.get(socketId);
        if (existingPeer) {
          newPeers.set(socketId, { ...existingPeer, isScreenSharing: false });
        }
        return newPeers;
      });
    };

    const handleVoiceChannelInfo = ({ channelId, users, count }) => {
      console.log('Received voice channel info for preview:', channelId, users);
      // Convert the users array to a Map for preview mode
      const previewPeers = new Map();
      users.forEach(user => {
        if (user.socketId) {
          previewPeers.set(user.socketId, {
            userId: user.userId,
            username: user.username,
            avatar_url: user.avatar_url,
            muted: user.muted,
            speaking: false, // We don't have speaking info in preview
            isScreenSharing: false, // We don't have screen share info in preview
            volume: 1
          });
        }
      });
      setPeers(previewPeers);
    };

    socket.on('voice_users', handleExistingUsers);
    socket.on('user_joined_voice', handleUserJoined);
    socket.on('user_voice_mute', handleUserVoiceMute);
    socket.on('voice_offer', handleVoiceOffer);
    socket.on('voice_answer', handleVoiceAnswer);
    socket.on('relay_ice_candidate', handleIceCandidate);
    socket.on('user_left_voice', handleUserLeft);
    socket.on('screen_share_start', handleScreenShareStart);
    socket.on('screen_share_stop', handleScreenShareStop);
    socket.on('voice_channel_info', handleVoiceChannelInfo);

    return () => {
      socket.off('voice_users', handleExistingUsers);
      socket.off('user_joined_voice', handleUserJoined);
      socket.off('user_voice_mute', handleUserVoiceMute);
      socket.off('voice_offer', handleVoiceOffer);
      socket.off('voice_answer', handleVoiceAnswer);
      socket.off('relay_ice_candidate', handleIceCandidate);
      socket.off('user_left_voice', handleUserLeft);
      socket.off('screen_share_start', handleScreenShareStart);
      socket.off('screen_share_stop', handleScreenShareStop);
      socket.off('voice_channel_info', handleVoiceChannelInfo);
      socket.io.off("reconnect", handleReconnect);
      socket.io.off("disconnect", handleDisconnect);
    };
  }, [socket, channelId, isConnected]);

  // Handle channel changes - switch channels without disconnecting
  useEffect(() => {
    if (channelId && isConnected && socket && socket.connected && !isPreview) {
      console.log('Switching to voice channel:', channelId);
      // Clean up existing connections before switching channels
      cleanupConnections();
      // Just join the new channel - the backend will handle leaving the previous one
      socket.emit('voice_join', { channelId });
    } else if (channelId && isPreview && socket && socket.connected) {
      console.log('Getting voice channel info for preview:', channelId);
      // Request voice channel info without joining
      socket.emit('get_voice_channel_info', { channelId });
    } else if (!channelId && isConnected) {
      // If we're connected but no channel is selected, disconnect
      console.log('No voice channel selected, disconnecting from voice chat');
      disconnect();
    }
  }, [channelId, isConnected, socket, disconnect, isPreview]);

  // Only disconnect when component unmounts (channelId becomes null)
  useEffect(() => {
    return () => {
      if (!channelId) {
        console.log('Cleaning up voice chat - no active channel');
        disconnect();
      }
    };
  }, [channelId]);

  return {
    isMuted,
    isDeafened,
    isConnected,
    isSpeaking,
    localLevel,
    isScreenSharing,
    peers,
    localScreenStreamRef,
    startVoiceChat,
    toggleMute,
    toggleDeafen,
    disconnect,
    startScreenShare,
    stopScreenShare,
    setPeerVolume: useCallback((remoteUserId, volume) => {
      try {
        // Accept up to 5.0 (500%)
        const clamped = Math.max(0, Math.min(5, Number(volume)));
        volumesRef.current.set(remoteUserId, clamped);
        // Update Web Audio gain if present
        const entry = remoteAnalysersRef.current.get(remoteUserId);
        if (entry?.gainNode) {
          entry.gainNode.gain.value = clamped;
        }
        // Keep audio element volume at 0 (we use Web Audio), but set anyway for safety
        const audio = audioElementsRef.current.get(remoteUserId);
        if (audio) {
          audio.volume = 0;
        }
        setPeers((prev) => {
          const next = new Map(prev);
          const existing = next.get(remoteUserId) || {};
          next.set(remoteUserId, { ...existing, volume: clamped });
          return next;
        });
      } catch (e) {
        console.error('Error setting peer volume:', e);
      }
    }, [])
  };
}