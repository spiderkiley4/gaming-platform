import { useState, useEffect } from 'react';

const VersionDisplay = () => {
  const [version, setVersion] = useState('');

  useEffect(() => {
    const applyWindowVersion = () => {
      if (typeof window !== 'undefined' && window.appVersion) {
        setVersion(window.appVersion);
        return true;
      }
      return false;
    };

    if (!applyWindowVersion()) {
      // Fallback to package.json version, but replace if Electron injects later
      import('../../package.json')
        .then(pkg => setVersion(pkg.version))
        .catch(() => setVersion(''));

      let attempts = 0;
      const interval = setInterval(() => {
        attempts += 1;
        if (applyWindowVersion() || attempts > 40) {
          clearInterval(interval);
        }
      }, 250);

      return () => clearInterval(interval);
    }
  }, []);

  return version || null;
};

export default VersionDisplay; 