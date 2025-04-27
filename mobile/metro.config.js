const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Configure logging
config.logger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.log, // Enable debug logs
};

// Don't filter any logs
config.reporter = {
  ...config.reporter,
  update: () => {},
  log: (message) => {
    console.log(message);
  },
};

module.exports = config;