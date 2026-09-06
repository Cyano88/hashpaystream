# Trade shared-listing pilot audit - 6 September 2026

## Scope and result

Continued from local commit b55bc3e in hashpaystream-android-release-20260906,
branch feat/trade-marketplace-preview. The separate Desktop checkout is untouched.
The previous implementation used sample listings and account-scoped IndexedDB drafts.
This change implements publishing, public discovery/details/photos, seller editing,
marking sold and removal against PostgreSQL. The selected banner remains unchanged.

## Boundaries verified

- Server-side Privy access-token verification supplies the seller identity. Client
  owner/status/timestamp fields are not trusted. Public DTOs exclude owner hashes
  and Privy identifiers. The identity is HMAC-scoped to Trade using the existing
  server ownership secret; changing that secret would disconnect listing ownership.
- Separate hashpaystream_trade_listings table; no agreement, receipt, wallet,
  savings, settlement or contract writes. Schema creation is lazy, only when the
  pilot is enabled and storage is used. Missing storage/auth fails closed.
- PostgreSQL transactions, seller advisory locks and expected revisions enforce
  ownership, a 20-listing seller quota, and conflict detection. A simultaneous
  cross-seller ID collision cannot overwrite the winner. Deleted records retain
  an ID tombstone and remove photo bodies.
- Public pages are bounded to 25 items with stable created-time/ID pagination.
  Search, category, location and saved-ID filters run in SQL using parameters.
  Search wildcard characters are escaped. Discovery reads exclude photo bodies.
- Upload authentication runs before the route-specific 8 MB JSON parser. Existing
  financial API parsers remain at 64 KB. Writes have a 10/minute IP limit; Trade
  requests have a 120/minute IP limit, following the app's existing limiter model.
- Up to four bounded JPEG uploads are decoded by Sharp with a 16 MP input limit,
  resized to at most 1200 px and re-encoded without original metadata. Invalid
  content and oversized bodies are rejected. Images have no-store responses.
- Android's existing API bridge expects JSON. Native photos therefore use an
  explicit JSON photo response and render the validated JPEG data URI. Browsers
  use ordinary image/jpeg responses. Neither path exposes seller identifiers.
- Private UI state remounts on identity changes; outstanding responses are ignored
  after unmount. Publication success is distinct from optional local-draft cleanup.
  A failed API request does not turn into sample data or publication success.

## Verification

Real isolated local PostgreSQL 17, synthetic accounts and photos only:
- HTTP publish -> second-account browse and direct lookup.
- Empty second-account My listings; cross-account edit/remove denied.
- Stale revisions rejected; concurrent editors and cross-seller ID collision tested.
- Edit -> sold -> removed lifecycle, photo removal, seller quota and pagination.
- Database search/location/category/saved-ID filtering and escaped wildcards.
- JPEG metadata stripping, malformed fields/images/JSON and 8 MB body rejection.
- Android photo JSON transport, local image passthrough and failed-photo handling.

Chrome at 390 x 844, actual Trade component plus real local Trade router/database:
- Published a synthetic listing through Sell; My listings confirmed publication.
- Switched to a separate synthetic account; Browse rendered the item/photo while
  that account's My listings remained empty. No console errors in this flow.
- Opened the published listing in the seller edit form with its stored photo.
- Reviewed the compact mobile screenshot; listing imagery begins near y=408.
- Existing preview browser regression covers sample browsing, sign-in boundary,
  bookmarks/reload, photo drafts/reload, account isolation, detail links, filters,
  Pocket selectors and mobile overflow.

Run `npm run test:trade-backend` with an isolated loopback PostgreSQL database using
TRADE_TEST_DATABASE_URL. The default is a synthetic local cluster on port 55439.
The test creates and drops only a random test schema. Remote databases are refused.
Run `npm run test:trade-native-photo` and `npm run test:trade-preview` for the other
focused checks. Browser fixture/screenshots remain under ignored output/playwright.

## Deployment and remaining work

Not deployed or enabled on the public service. HASHPAYSTREAM_TRADE_ENABLED defaults
false; GET of the listing collection explicitly selects the existing sample preview.
A reviewed pilot environment needs the new server build, PostgreSQL, existing Privy
server settings and ownership secret, then HASHPAYSTREAM_TRADE_ENABLED=true.
Deploy the matching server before distributing the new UI: an older server has no
Trade endpoint and the new UI correctly reports an API error rather than samples.
The installed Pixel app remains version 1.0.6 from the prior turn; this feature has
not been installed or physically verified on Android. Its earlier physical keyboard
hide/restore check also remains pending.

This is a listing pilot, not a complete marketplace launch. Bookmarks and unpublished
drafts are still scoped to the account on this device. Seller contact, server-synced
bookmarks/drafts, report/block/moderation, prohibited-item enforcement, delivery,
orders, disputes and payments remain separate work. No protection, delivery licence
verification, escrow or payment-success claims are introduced. Wider launch needs
moderation and operational review. Photo storage is bounded per listing in PostgreSQL;
move it to managed object storage before scaling the marketplace. Existing in-memory
IP limiting is per server instance, not a shared abuse-control service.

Final checks: production web build/typecheck, Trade PostgreSQL/HTTP, native photo,
preview browser/draft checks and the Android readiness suite all passed. The build
retains existing vendor annotation and bundle-size warnings. No production deploy,
contract change, payment action or new Android installation was performed.
