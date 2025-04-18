import { useState, useEffect } from 'react';

const VersionDisplay = () => {
  const [version, setVersion] = useState('');

  useEffect(() => {
    // Get version from window object (set by Electron)
    if (window.appVersion) {
      setVersion(window.appVersion);
    } else {
      // Fallback to package.json version if available
      import('../../package.json')
        .then(pkg => setVersion(pkg.version))
        .catch(() => setVersion(''));
    }
  }, []);

  if (!version) return null;

  return (
    <div className="text-xs text-gray-400 absolute bottom-2 left-2">
      v{version}
    </div>
  );
};

export default VersionDisplay; 