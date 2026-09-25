# Circle OTP recovery and reference launch update

24 September 2026. Newer Hash PayStream working source, candidate 1.0.33 / version code 34.

## Reported Circle failure

The app previously reused cached device IDs and generated `crypto.randomUUID()` if Circle's SDK device registration failed. Such a locally generated ID is not registered in Circle, making the reported `Provided device ID is not found in the system` error possible. Both Hash PayStream and Hash PayLink had this fallback.

The app now obtains device IDs only through the Circle SDK on each connection attempt, keeps the device iframe runnable during registration, and fails with a retry message if registration fails. It never uses a fabricated ID. Previously cached IDs are ignored. OTP instructions appear only after a successful OTP request.

`circleOtpFlow.ts` provides a top-right cancel control adapted from the hosted Hash PayLink control. Cancel closes the OTP frame and returns the existing wallet gate to its retry state without signing out. Resend, timeout, success, cancellation and account-change abort all clean up listeners/controls; late callbacks cannot complete a cancelled login. SDK close messages are accepted only from the actual SDK iframe.

Hash PayLink's corresponding device-ID fix is local commit `dfc499cd5`; it is not deployed. Cancel/retry belongs to the hosted checkout UI; the backend API alone cannot paint it into a builder's native screen.

## Launch reference

Reference file: `Downloads/document_5886515595591032840.mp4`, duration approximately 7.98 seconds. Inspected full contact sheet and 10-fps logo close-ups. The relevant sequence is a white rotating/settling mark on black, followed by a letter-by-letter wordmark in the same central location and a motionless hold.

Adapted this motion to the existing Hash PayStream mark/name: 800ms mark phase, 650ms wordmark assembly, 1500ms hold, 160ms fade. Removed the separated mark-above-wordmark layout, blue word segment and bouncing hold. Kept reduced-motion handling and delayed-session recovery. The reference app's logo, screen-recording warning and login PIN screen were not copied.

Visual preview at 390x844 inspected under `output/playwright/launch-reference/` (`mark-preview.png`, `letters-preview.png`, `word-preview.png`). This confirms CSS rendering, not native authentication success.

## Checks

OTP behavior tests cover genuine SDK registration, rejection instead of fake fallback, cancel, late callbacks, retry, resend failure, timeout and account-change cleanup. Biometric, Circle API and Android regression tests are run before installation. The physical device must still confirm Circle registration/OTP succeeds in its WebView; if registration remains blocked, the app now reports that failure rather than sending a fabricated ID.

Candidate 1.0.33 (version code 34) built successfully, package identity verified, installed as an update to `app.hashpaystream.candidate`, and relaunched on the Pixel. Candidate data preserved; main app untouched. APK SHA-256: `DDE9436DFE92406E217E5F707FFC15082AE7A267C323166B4B1C414380DD6A35`. Automated suites passed. Physical Circle registration, OTP cancellation and animation feedback are pending the user's check.
