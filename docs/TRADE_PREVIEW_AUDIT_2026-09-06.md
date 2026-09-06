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
- Four top actions: Browse, Search, Sell, Saved. Sample listings and illustrations
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
