import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.hashpaystream',
  appName: 'HashPayStream',
  webDir: 'dist',
  loggingBehavior: 'none',
  server: {
    hostname: 'hashpaystream.app',
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK',
      hidden: false,
      animation: 'NONE',
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#06070a',
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 12_000,
      backgroundColor: '#06070a',
      showSpinner: false,
      androidSplashResourceName: 'hashpaystream_launch',
    },
    Keyboard: {
      resize: 'native',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
