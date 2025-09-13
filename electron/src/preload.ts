import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Screen sharing functionality
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  
  // Game detection functionality
  getRunningGames: () => ipcRenderer.invoke('get-running-games'),
  
  // Window state notifications
  onWindowStateChange: (callback: (state: { isWindowFocused: boolean; isMinimized: boolean }) => void) => {
    ipcRenderer.on('window-state-change', (event, state) => callback(state));
  },
  
  // Channel switching for notifications
  onSwitchChannel: (callback: (channel: any) => void) => {
    ipcRenderer.on('switch-channel', (event, channel) => callback(channel));
  },
  
  // Send new message notification
  sendNewMessage: (data: { title: string; body: string; channel: any }) => {
    ipcRenderer.send('new-message', data);
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// Type declaration for the exposed API
declare global {
  interface Window {
    electronAPI: {
      getScreenSources: () => Promise<any[]>;
      getRunningGames: () => Promise<string[]>;
      onWindowStateChange: (callback: (state: { isWindowFocused: boolean; isMinimized: boolean }) => void) => void;
      onSwitchChannel: (callback: (channel: any) => void) => void;
      sendNewMessage: (data: { title: string; body: string; channel: any }) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}
