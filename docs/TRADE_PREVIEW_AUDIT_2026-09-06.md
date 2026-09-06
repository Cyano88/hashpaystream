# Trade preview audit and implementation - 2026-09-06

## Verified starting point

The Android receipt branch was clean at a898ef5. Work is isolated on
feat/trade-marketplace-preview. The original Desktop/hashpaystream working tree
was not changed. No resale listing persistence/API, seller discovery or physical
goods checkout was found in this app. Existing agreement/advance and savings
contracts do not establish physical-goods delivery or dispute protection.

## Implemented first milestone

- Home's four actions are New, Early pay, Trade, Earn. Move remains available
  as a labelled 44 px minimum-height control below notifications on the balance card.
- /trade supports public Browse/Search and item-detail links via ?item=sample-… .
  Browsing is outside Circle wallet/auth gates. Native launch preserves /trade.
- Compact Pocket selector: Browse, Sell, Saved, My listings. Search stays inside Browse. Sample listings and illustrations
  are explicitly labelled. No fictional sellers, guarantees or live checkout.
- Keyword, category and city filters; empty states and item detail information.
- Saved sample items and editable/deletable seller drafts persist in IndexedDB,
  keyed by the authenticated user ID. Private component state remounts on identity
  change; storage writes must succeed before showing a saved state.
- Up to four photos, 10 MB input limit each; JPEG/PNG/WebP are decoded, resized and
  re-encoded to JPEG. Drafts include title, category, condition, price/currency,
  city, size/measurements, defects and handover preference. Twenty-draft limit.
- Drafts are explicitly device-local, unpublished and unsynced. No financial
  transaction, public write, seller message or production endpoint was added.

NGN is the initial sample currency. Draft currency supports NGN, USD and USDC;
listing prices are not settlement instructions. Initial launch market and currency
remain a product decision. No assumption of global shipping coverage is made.

## Verification

TypeScript, standalone surface assertions and trade-preview-smoke passed.
Synthetic browser checks passed for public browsing, sign-in boundary, Saved
persistence after reload, search/location filtering, photo draft persistence,
account isolation, direct item route, dark detail view, no 390 px mobile overflow
and no browser runtime errors. Mobile Browse, Sell and detail screenshots are
stored under ignored output/playwright. No real account data was used in those tests.

## Required before public marketplace launch

1. Define the first geography/categories, prohibited items, currency and fees.
2. Implement server-owned listings, image storage/moderation, ownership checks,
   pagination/search and public link metadata. Do not promote device drafts as live.
3. Add seller profile/reputation, reporting/blocking, contact controls and an order
   record that freezes the accepted item description, price and delivery terms.
4. Design and audit physical-goods custody, delivery evidence, inspection windows,
   returns, dispute decisions and release/refund permissions. Shipping evidence does
   not prove item condition. No audited savings/advance status implies trade coverage.
5. Add backend authorization/rate-limit tests and real seller/buyer usability checks.

## Android preview result

Android 1.0.3 (versionCode 4) built successfully with unit tests and lint.
The in-place installation succeeded and the Trade screen opened on the Pixel.
All 280 bundled web assets match dist byte-for-byte. The phone switched
to another app during the remaining Home/Move touch checks, so automation was
paused. Browser feature checks and source navigation assertions passed.

APK SHA-256: 6d31019fc44d7be1d74978fd52c8548472a53ebe0ccad0fc966ba771bdd45ac0

## Pocket controls and back navigation follow-up

Reused the exact stream-segment container and Received/Sent button classes.
The shared Pocket CSS makes each selector button 48 px high. Native select
fields were replaced by the existing StreamSelect component for category,
condition, currency and handover. My listings owns the editable draft list.

The apparent reload had two verified code paths: changing from the public Trade
route to an auth-decision route re-enabled the native intro animation; Android
back without history called location.replace. The splash now initializes only
on mount and does not restart on route re-entry. Native fallback back updates
history and emits popstate instead of reloading the document. Auth/Circle gates
and cold-launch behavior remain covered separately.

New regression checks execute the real hook and native back listener with mocked
native services: cold launch animates, Trade -> Home remains idle, direct Trade
entry -> Home remains idle, history back is preserved, no-history back uses SPA
navigation, and Home with no history minimizes. Browser tests verify the 48 px
selector, Pocket dropdown selection, draft editing/list isolation and no native
select elements in Trade. Android readiness includes the regression script.

## Compact discovery layout

Back/Trade remains above the Pocket selector. Removed the repeated subtitle,
preview paragraph, banner kicker/CTA and per-image sample captions. A single
Sample listings label remains because publishing and purchases are not live.
The Good finds card is now a short strip. Location opens from an accessible
filter button beside search, closes with Done/Escape/outside click, and shows
an active location as a removable chip. The existing Pocket dropdowns remain.
At the tested 390 px viewport, the first listing begins above 450 px, compared
with about 700 px before this compacting pass. No location field is exposed
until requested. Android target: 1.0.5 / versionCode 6.

## Keyboard navigation and selected banner

Banner copy: Your once-loved. Someone's next find. The two-line card remains
compact; browser checks keep the first listing above 450 px in a 390 px viewport.

Reproduced the keyboard issue on the Pixel before fixing it: Android adjustResize
moved the fixed bottom navigation from y=2580 to y=1665 while the keyboard was shown.
The native app now uses the installed Capacitor Keyboard show/hide events to mark
keyboard visibility. CSS hides .stream-bottom-nav while typing and removes its
reserved content padding. The menu returns after keyboardDidHide. Form scrolling
and Android adjustResize remain enabled. Listener cleanup also clears the marker.
Native regression tests cover keyboardWillShow, keyboardDidShow and keyboardDidHide.
Final Android target: 1.0.6 / versionCode 7.


Final package verification: Android sync, assembleDebug, testDebugUnitTest and
lintDebug passed. Android readiness and Trade browser checks passed. All 280 dist
files match the APK assets byte-for-byte. APK SHA-256:
91c078728c0449228e3312ccef72fdccf92337a58a90cda30c12606d244393d6.
Installed with adb install -r; confirmed versionName 1.0.6 and versionCode 7.
The final physical keyboard hide/restore check remains pending: the Pixel was
locked, then in another app being used. No on-device success is claimed for this
fix yet; the native event regression checks passed.
