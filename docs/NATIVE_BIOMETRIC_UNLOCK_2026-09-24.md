# Native biometric wallet unlock audit and implementation

24 September 2026. Local change in the clean Hash PayStream production integration checkout. Not deployed, not installed on a phone, and not yet reconciled with the newer dirty product checkout.

## Pocket audit

- `src/pocket/lib/pocketPaymentBiometrics.ts`: current payment biometrics store a Pocket PIN with `BIOMETRY_CURRENT_SET`, retrieve it with one `getSecureCredentials` prompt, and pass it to server PIN verification through `PocketPaymentSecurityGate`.
- `src/pocket/lib/pocketSecureWalletSession.ts`: retains the Circle session separately using ordinary encrypted native credentials (`AccessControl.NONE`). It does not itself enforce biometric unlock.
- `src/pocket/lib/pocketQuickApproval.ts`: existing recovery-compatible quick-approval implementation protects a random AES key with biometrics and encrypts the Circle session. The current Profile page disables that older toggle; it was not described as the active payment-security flow or re-enabled in Pocket.

The new Hash PayStream vault adapts the biometric-protected key and AES-GCM session pattern from this source. It adds authenticated app/account binding, serial native-store operations, interrupted-enrollment detection and late-unlock invalidation. Pocket's PIN/payment authorization backend was not copied or bypassed.

## Implemented behavior

After Circle authentication, Account offers Fingerprint or face unlock on native devices with strong biometrics. Enrollment protects a random key with `BIOMETRY_CURRENT_SET` and replaces the existing retained Circle session with an AES-GCM envelope in native secure storage. There is no additional unprotected copy of the enrolled session retained by this adapter.

On a new app instance, wallet restoration requires one native secure-credential prompt. The unlocked key stays in memory to encrypt refreshed credentials without another biometric prompt. Cancelling or failing biometric authentication stops restoration; it does not silently downgrade to ordinary credentials or automatically request OTP. The existing explicit Verify wallet again recovery action clears the retained data and starts Circle email verification.

App/account changes clear the cached key. An outstanding device approval cannot restore a cached key after locking/sign-out. This change covers wallet restoration on relaunch, not a new automatic background/inactivity app-lock policy. Payment challenges and confirmation remain separate.

## Hosted boundary

`Capacitor Browser.open` opens hosted checkout in a separate browser context. That context cannot access Hash PayStream's native Keychain/Keystore session. No Circle or Privy tokens are placed in return URLs, API responses to builders or browser handoff parameters. The session vault change does not complete silent Privy authentication, hosted Circle authentication or migration away from the existing local wallet integration.

The existing app ID/chain configuration is unchanged; this is not a mainnet activation. Existing wallet identities and funds are not migrated or deleted.

## Verification

- `npm run test:circle-biometric`: mocked native storage with real WebCrypto encryption; enrollment, one prompt, refresh, relaunch, cancellation, app/account binding, corruption, key invalidation, interrupted enrollment, cleanup and late approval after locking.
- Full TypeScript check and existing Circle and Pocket-transfer regression suites pass.
- Real-device fingerprint/Face ID prompts, biometric enrollment changes and OS-specific credential behavior still require hardware verification before release.

## Rollout

Reconcile these additive changes into the newer Hash PayStream product source before a mobile release. Do not install an older app build. Finish the separately scoped hosted session/authentication integration and test on Android/iOS before claiming the final hosted-wallet experience.
