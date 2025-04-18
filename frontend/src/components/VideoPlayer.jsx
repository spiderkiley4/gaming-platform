import React, { useRef, useState, useEffect } from 'react';

export default function VideoPlayer({ src }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  
  // Initialize volume from localStorage or default to 1
  const [volume, setVolume] = useState(() => {
    const savedVolume = localStorage.getItem('videoPlayerVolume');
    return savedVolume ? parseFloat(savedVolume) : 1;
  });

  // Apply volume setting when component mounts or volume changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
    localStorage.setItem('videoPlayerVolume', volume.toString());
  }, [volume]);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
  };

  return (
    <div className="flex flex-col">
      <video
        ref={videoRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleVideoEnded}
        className="w-full h-auto"
        src={src}
      />
      <div className="flex flex-wrap items-center gap-2 mt-2 p-2">
        <button onClick={togglePlayPause} className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded">
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <div className="flex items-center gap-1 min-w-[120px]">
          <span className="text-white text-sm">Volume:</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="w-20"
          />
        </div>
        <div className="flex items-center gap-1 flex-1">
          <span className="text-white text-sm">Time:</span>
          <input
            type="range"
            min="0"
            max={videoRef.current?.duration || 0}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            className="flex-1"
          />
          <span className="text-white text-sm">{Math.floor(currentTime)}s</span>
        </div>
      </div>
    </div>
  );
}
