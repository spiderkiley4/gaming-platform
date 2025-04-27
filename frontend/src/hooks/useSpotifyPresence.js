import { useEffect, useState } from 'react';

export function useSpotifyPresence(updatePresence) {
  const [player, setPlayer] = useState(null);

  useEffect(() => {
    // Load Spotify Web Playback SDK
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;

    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: 'Jemcord Player',
        getOAuthToken: cb => {
          // You would need to implement Spotify OAuth to get a token
          // For now, we'll just check if Spotify is running in the browser
          fetch('http://localhost:4380/query')
            .then(response => response.json())
            .then(data => {
              if (data.is_playing) {
                updatePresence({
                  type: 'listening',
                  name: `${data.item?.name} by ${data.item?.artists[0]?.name}`
                });
              }
            })
            .catch(() => {
              // Spotify not running or not detected
            });
        }
      });

      setPlayer(player);

      player.addListener('player_state_changed', state => {
        if (state) {
          updatePresence({
            type: 'listening',
            name: `${state.track_window.current_track.name} by ${state.track_window.current_track.artists[0].name}`
          });
        }
      });
    };

    return () => {
      document.body.removeChild(script);
      if (player) {
        player.disconnect();
      }
    };
  }, [updatePresence]);

  return player;
}