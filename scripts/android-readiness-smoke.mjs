import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const [capacitor, manifest, gradle, strings, styles, nativeApp, instrumentedTest] = await Promise.all([
  read('capacitor.config.ts'),
  read('android/app/src/main/AndroidManifest.xml'),
  read('android/app/build.gradle'),
  read('android/app/src/main/res/values/strings.xml'),
  read('android/app/src/main/res/values/styles.xml'),
  read('src/lib/nativeApp.ts'),
  read('android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java'),
])
const nativeApiTransport = await read('src/lib/nativeApiTransport.ts')
const main = await read('src/main.tsx')
const buildConfigCheck = await read('scripts/android-build-config-check.mjs')

assert.match(capacitor, /appId:\s*'app\.hashpaystream'/)
assert.match(capacitor, /hostname:\s*'hashpaystream\.app'/)
assert.match(capacitor, /androidScheme:\s*'https'/)
assert.match(capacitor, /allowMixedContent:\s*false/)
assert.match(capacitor, /SystemBars:\s*\{[\s\S]*insetsHandling:\s*'css'/)
assert.match(capacitor, /StatusBar:\s*\{[\s\S]*overlaysWebView:\s*false/)

assert.match(manifest, /android:allowBackup="false"/)
assert.match(manifest, /android:usesCleartextTraffic="false"/)
assert.match(manifest, /android:networkSecurityConfig="@xml\/network_security_config"/)
assert.match(manifest, /android:windowSoftInputMode="adjustResize"/)
assert.match(manifest, /android:autoVerify="true"/)
assert.match(manifest, /android:scheme="https" android:host="hashpaystream\.app"/)
assert.match(manifest, /android:scheme="hashpaystream"/)

assert.match(gradle, /namespace = "app\.hashpaystream"/)
assert.match(gradle, /applicationId "app\.hashpaystream"/)
assert.match(gradle, /HASHPAYSTREAM_UPLOAD_STORE_FILE/)
assert.match(gradle, /releaseBuildRequested && !releaseSigningConfigured/)
assert.match(gradle, /minifyEnabled true/)
assert.match(gradle, /shrinkResources true/)

assert.match(strings, /<string name="app_name">HashPayStream<\/string>/)
assert.match(strings, /<string name="custom_url_scheme">hashpaystream<\/string>/)
assert.match(styles, /name="AppTheme\.NoActionBarLaunch"[\s\S]*postSplashScreenTheme[^\n]*@style\/AppTheme\.NoActionBar/)
assert.match(nativeApp, /App\.addListener\('backButton'/)
assert.match(nativeApp, /App\.addListener\('appUrlOpen'/)
assert.match(nativeApp, /Browser\.open\(\{ url: anchor\.href \}\)/)
assert.match(nativeApp, /App\.addListener\('appStateChange'/)
assert.match(nativeApp, /addEventListener\('orientationchange', onViewportChange\)/)
assert.match(nativeApp, /addEventListener\('resize', onViewportChange\)/)
assert.match(nativeApp, /addEventListener\('visibilitychange', onVisibilityChange\)/)
assert.match(nativeApp, /scheduleSystemBars[\s\S]*setTimeout\(applySystemBars, 420\)/)
assert.match(nativeApp, /SystemBars\.setStyle/)
assert.match(nativeApp, /SystemBars\.show/)
assert.doesNotMatch(nativeApp, /--stream-native-top-inset/)
assert.match(nativeApp, /data-stream-system-surface/)
assert.match(nativeApp, /forcedSurface === 'dark'/)
assert.match(nativeApiTransport, /CapacitorHttp\.request/)
assert.match(nativeApiTransport, /pathname\.startsWith\(API_PATH_PREFIX\)/)
assert.match(nativeApiTransport, /https:\/\/hashpaystream\.app/)
assert.match(nativeApiTransport, /https:\/\/hashpaystream\.onrender\.com/)
assert.match(main, /installNativeApiTransport\(\)[\s\S]*initializeNativeApp\(\)/)
for (const name of [
  'VITE_HASHPAYSTREAM_FEE_SETTLEMENT_V3_ENABLED',
  'VITE_HASHPAYSTREAM_UPFRONT_CHAIN_ID',
  'VITE_HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS',
  'VITE_HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS',
  'VITE_HASHPAYSTREAM_UPFRONT_TREASURY_ENABLED',
]) assert.match(buildConfigCheck, new RegExp(name))
assert.match(buildConfigCheck, /invalid production public configuration/)
assert.match(instrumentedTest, /package app\.hashpaystream;/)
assert.match(instrumentedTest, /assertEquals\("app\.hashpaystream", appContext\.getPackageName\(\)\)/)

for (const path of [
  'android/app/src/main/res/mipmap-mdpi/ic_launcher.png',
  'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png',
  'android/app/src/main/res/drawable-port-xxxhdpi/splash.png',
]) {
  assert.ok((await stat(new URL(`../${path}`, import.meta.url))).size > 1_000, `${path} is missing or empty`)
}

console.log('android readiness smoke checks passed')
