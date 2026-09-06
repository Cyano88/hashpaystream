# Trade login and seller refresh audit - 2026-09-07

## Verified

- Searched Desktop, Documents, Downloads and .android recursively for .jks/.keystore files while excluding dependency/build/git trees. Only .android/debug.keystore was found. This does not prove no release key exists elsewhere or under another extension.
- Saved a labelled local TEST account isolation draft in the authenticated browser seller account.
- Used Account > Sign out in the real production browser session, then opened Trade > My listings. The application showed the sign-in boundary and no seller draft/private listing. Pixel authentication was preserved.
- Opened the browser login UI for the user to sign in as the Pixel account. Real account-to-account isolation is not yet claimed; that login is pending. The labelled seller draft remains for this check and subsequent cleanup.
- Found a stale seller-list state: returning to My listings still showed the moderator-removed synthetic item as Published, even though the public photo correctly returned 404 and database status was removed.
- Refresh seller listings on each entry to My listings while live. Existing loaded rows stay visible during the refresh, and existing failure/retry handling remains intact. Private reads are no longer eagerly triggered merely by opening Browse.
- Browser regression passed: load a seller item, leave My listings, remove it in the test backend, return and verify it disappears after the fresh result. Pending/failure/retry and retained-item tests also passed.

## Pending

Existing release key path or explicit first-release-key decision; real second-account browser login; cleanup of the labelled local seller draft after verification. No signing key was created or replaced.

## Build and deployment evidence

- Production build passed. Render deployment dep-daev5jks728c738dboag is live at 40f35b2.
- Android web sync, assembly, unit tests and lint passed. Installed through adb install -r successfully; no data clear or uninstall was performed.
- APK remains debug 1.0.11 / code 12. Desktop copy: C:/Users/USER/Desktop/HashPayStream-1.0.11-Listing-Refresh.apk
- SHA256: e2d8b3ea2f7af4c44e90655cb6df8cdb10f70c8788ca9e8e4f46501951d0b9f2
- Real second-account login and release signing remain pending user input. No release key was generated.
