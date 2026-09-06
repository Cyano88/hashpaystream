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
      style: 'LIGHT',
      hidden: false,
      animation: 'NONE',
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'LIGHT',
      backgroundColor: '#F5F5F7',
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1_000,
      backgroundColor: '#F5F5F7',
      showSpinner: false,
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
