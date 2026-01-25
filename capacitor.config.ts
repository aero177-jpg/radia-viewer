import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.radiaviewer.app',
  appName: 'Radia',
  webDir: 'dist',
  // server: {
  //   url: 'http://192.168.0.231:5173/',
  //   cleartext: true
  // },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#00000000'
    }
  }
};

export default config;
