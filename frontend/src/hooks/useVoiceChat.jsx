import { useEffect, useRef, useState } from 'react';

export function useVoiceChat(channelId, socket) {
  const [isMuted, setIsMuted] = useState(true);
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
        teardownRemoteAnalyser(remoteUserId);
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
        
        // Process any pending answers
        const pendingAnswer = pendingAnswersRef.current.get(remoteUserId);
        if (pendingAnswer) {
          console.log('Processing pending answer for:', remoteUserId);
          pendingAnswersRef.current.delete(remoteUserId);
          peerConnection.setRemoteDescription(new RTCSessionDescription(pendingAnswer))
            .catch(err => console.error('Error processing pending answer:', err));
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
        console.log('Adding screen track to peer connection', track.kind);
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

    peerConnection.ontrack = (event) => {
      console.log('Received remote track', event.track.kind, 'from', remoteUserId);
      const stream = event.streams[0];
      if (stream) {
        setPeers((prevPeers) => {
          const newPeers = new Map(prevPeers);
          const existingPeer = newPeers.get(remoteUserId);
          
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
        
        // Create audio-only stream for audio element
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

  const cleanupConnections = () => {
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
  };

  const toggleMute = () => {
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
  };

  const disconnect = () => {
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
  };

  const startScreenShare = async () => {
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
      for (const user of users) {
        const socketId = user.socketId || user; // Handle both new format and legacy
        if (socketId === socket.id) continue; // Skip self
        
        // Store user info for display
        if (user.username) {
          setPeers((prevPeers) => {
            const newPeers = new Map(prevPeers);
            newPeers.set(socketId, {
              username: user.username,
              avatar_url: user.avatar_url,
              userId: user.userId,
              stream: null, // Will be set when track is received
              speaking: false,
              muted: !!user.muted
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

    const handleUserJoined = async ({ socketId, userId, username, avatar_url, muted }) => {
      console.log('User joined voice:', username || socketId);
      
      // Store user info for display
      if (username) {
        setPeers((prevPeers) => {
          const newPeers = new Map(prevPeers);
          newPeers.set(socketId, {
            username: username,
            avatar_url: avatar_url,
            userId: userId,
            stream: null, // Will be set when track is received
            speaking: false,
            muted: !!muted
          });
          return newPeers;
        });
      }
      
      // Only create an offer if we have a local stream and we are the "older" peer
      if (localStreamRef.current && socket.id < socketId) {
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
        pendingIceCandidatesRef.current.set(from, [...pendingCandidates, candidate]);
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

    const handleUserLeft = ({ socketId, userId, username }) => {
      console.log('User left voice:', username || socketId);
      const peerConnection = peerConnectionsRef.current.get(socketId);
      if (peerConnection) {
        peerConnection.close();
        peerConnectionsRef.current.delete(socketId);
      }
      
      const audioElement = audioElementsRef.current.get(socketId);
      if (audioElement) {
        audioElement.srcObject = null;
        audioElement.remove();
        audioElementsRef.current.delete(socketId);
      }
      // Remove volume tracking
      volumesRef.current.delete(socketId);

      teardownRemoteAnalyser(socketId);
      
      setPeers((prevPeers) => {
        const newPeers = new Map(prevPeers);
        newPeers.delete(socketId);
        return newPeers;
      });
    };

    const handleScreenShareStart = ({ socketId, userId, username }) => {
      console.log('User started screen sharing:', username || socketId);
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

    socket.on('voice_users', handleExistingUsers);
    socket.on('user_joined_voice', handleUserJoined);
    socket.on('user_voice_mute', handleUserVoiceMute);
    socket.on('voice_offer', handleVoiceOffer);
    socket.on('voice_answer', handleVoiceAnswer);
    socket.on('relay_ice_candidate', handleIceCandidate);
    socket.on('user_left_voice', handleUserLeft);
    socket.on('screen_share_start', handleScreenShareStart);
    socket.on('screen_share_stop', handleScreenShareStop);

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
    isSpeaking,
    localLevel,
    isScreenSharing,
    peers,
    startVoiceChat,
    toggleMute,
    disconnect,
    startScreenShare,
    stopScreenShare,
    setPeerVolume: (remoteUserId, volume) => {
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
    }
  };
}