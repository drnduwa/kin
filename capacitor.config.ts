import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'online.kinshasaflow.twa',
  appName: 'Kinshasa Flow',
  webDir: 'out',
  server: {
    url: 'https://kinshasaflow.online',
    allowNavigation: [
      'kinshasaflow.online',
      '*.firebaseapp.com',
      '*.google.com',
      '*.googleapis.com'
    ],
    cleartext: true
  },
  ios: {
    contentInset: 'always',
    preferredContentMode: 'mobile'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;
