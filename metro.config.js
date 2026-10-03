// Metro (serwer kodu w trakcie budowy aplikacji): domyślna konfiguracja Expo, ale bez folderów natywnych i plików
// kompilacji Androida/iOS – setki tysięcy plików, przez które Metro zawieszał się po każdej przebudowie.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const esc = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\\/g, '[/\\\\]');
const ours = [
  new RegExp(`^${esc(path.join(__dirname, 'android'))}[/\\\\].*`),
  new RegExp(`^${esc(path.join(__dirname, 'ios'))}[/\\\\].*`),
  /[/\\]android[/\\]build[/\\].*/,
  /[/\\]\.gradle[/\\].*/,
];
config.resolver.blockList = [].concat(config.resolver.blockList ?? [], ours);

module.exports = config;
