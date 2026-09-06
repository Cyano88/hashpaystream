# Trade loading and layout stability audit - 2026-09-06

## Verified cause

Trade initialized its mode to loading on every route mount. Its mount effect fetched the public feed, then the mode change triggered a second effect and fetched it again. Each refresh also awaited authenticated private listings. A conditional status paragraph above the page inserted and removed vertical space during each refresh.

## Change

Public feed responses now share concurrent requests and use a bounded in-memory cache (20 query pages, 30-second freshness, five-minute display expiry). Re-entering Trade can render the last public feed immediately, then refresh expired data without blanking it. Listing writes invalidate snapshots, including late in-flight cache writes. Private listings, drafts, tokens and conversations are excluded from this cache.

Public and private listing requests run separately. Fetch effects no longer retrigger on their own mode result; Sell and enquiries switches do not reload the public feed. Loading feedback occupies the existing count position, and initial loading keeps the search and banner visible with static item placeholders. Account identity changes still remount private state.

## Verification

- `node --import tsx scripts/trade-cache-smoke.mjs`: concurrent deduplication, freshness/expiry, private-read exclusion, write invalidation, late-response invalidation, and error recovery passed.
- Existing browser regression passed: preview browsing, saved items, drafts, account isolation, search/location, deep links, and no mobile overflow or runtime errors.
- Synthetic slow-network browser test passed with public response delayed 600 ms and private response delayed 3 seconds. Observed one initial public fetch, no extra public fetch for Sell/Browse or immediate route re-entry, cached content during expired-data refresh, and identical search position before/after initial and background loading.
- Android readiness, account isolation, receipt sharing, and native navigation checks passed.

## Limits

The cache lasts for the current app process only; a fresh app launch still requires a server response. Public snapshots can be up to 30 seconds old before revalidation. Item detail and all write permissions remain server-verified. No server plan, payment behavior or contract changes are included.
