import React, { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';

const signalingServerUrl = 'ws://localhost:8080'; // Signaling server URL

function App() {
  const [connected, setConnected] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = new WebSocket(signalingServerUrl);
    
    socketRef.current.onopen = () => {
      console.log('Connected to signaling server');
    };
    
    socketRef.current.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.type === 'offer') {
        handleOffer(data);
      } else if (data.type === 'answer') {
        handleAnswer(data);
      } else if (data.type === 'iceCandidate') {
        handleNewICECandidate(data);
      }
    };

    return () => {
      socketRef.current.close();
    };
  }, []);

  // Initialize local media stream
  useEffect(() => {
    const startVideo = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    };
    startVideo();
  }, []);

  // Create a new peer connection
  const createPeerConnection = () => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: localVideoRef.current?.srcObject,
    });

    peer.on('signal', (data) => {
      socketRef.current.send(JSON.stringify({ type: 'offer', data }));
    });

    peer.on('stream', (stream) => {
      remoteVideoRef.current.srcObject = stream;
    });

    peer.on('iceCandidate', (candidate) => {
      socketRef.current.send(JSON.stringify({ type: 'iceCandidate', candidate }));
    });

    peerRef.current = peer;
  };

  // Handle incoming offer
  const handleOffer = (data) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: localVideoRef.current?.srcObject,
    });

    peer.on('signal', (answer) => {
      socketRef.current.send(JSON.stringify({ type: 'answer', data: answer }));
    });

    peer.on('stream', (stream) => {
      remoteVideoRef.current.srcObject = stream;
    });

    peer.on('iceCandidate', (candidate) => {
      socketRef.current.send(JSON.stringify({ type: 'iceCandidate', candidate }));
    });

    peer.signal(data.data);
    peerRef.current = peer;
  };

  // Handle incoming answer
  const handleAnswer = (data) => {
    peerRef.current.signal(data.data);
  };

  // Handle ICE Candidate (network info)
  const handleNewICECandidate = (data) => {
    const candidate = new RTCIceCandidate(data.candidate);
    peerRef.current.addIceCandidate(candidate);
  };

  // Create a new call when button is clicked
  const handleCallClick = () => {
    setConnected(true);
    createPeerConnection();
  };

  return (
    <div className="App">
      <h1>P2P Communication with WebRTC</h1>
      <button onClick={handleCallClick} disabled={connected}>Start Call</button>
      <div>
        <video ref={localVideoRef} autoPlay muted />
        <video ref={remoteVideoRef} autoPlay />
      </div>
    </div>
  );
}

export default App;
