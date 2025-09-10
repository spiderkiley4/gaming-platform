import React from 'react';
import { Text } from 'react-native';

export default function VersionDisplay() {
  // For mobile, we'll use the version from package.json
  // In a real app, you might want to get this from app.json or a config file
  return <Text>1.0.11</Text>;
}
