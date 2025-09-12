import React from 'react';
import { Text } from 'react-native';
import packageJson from '../package.json';

export default function VersionDisplay() {
  return <Text>{packageJson.version}</Text>;
}
