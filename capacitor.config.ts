import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bpr.badminton',
  appName: 'BPR',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
};

export default config;
