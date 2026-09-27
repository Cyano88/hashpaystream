# Trade availability follow-up - 2026-09-28

Scope: Hash PayStream web Trade. No agent wallet work or payment transactions.

Confirmed gap: Browse selected active listings even when an accepted offer or immutable funding reservation existed. Existing uniqueness constraints already prevented a second accepted offer/reservation; discovery and new enquiries did not reflect this restriction.

Availability is now derived from those existing records. Browse excludes reserved listings. Owner lists, saved items and direct links retain them with Reserved copy; Ask seller is hidden. New enquiries recheck availability under the listing lock. Existing conversation access is preserved. Shared schema initialization makes availability queries valid on fresh databases and retains legacy migration behavior.

Accepted terms cancelled before reservation restore availability. Reservations remain immutable and do not reopen automatically after cancellation/refund/dispute. Reserved does not claim funds have arrived. Confirmed release continues to mark listings sold via the existing authenticated checkout reconciliation.

Validation: TypeScript, navigation component checks, hosted-route checks and isolated PostgreSQL publication/community/release tests passed. New assertions cover accepted visibility, saved/direct/owner availability, existing participant access, second-buyer rejection, pre-checkout cancellation and retained reservation blocking. Initial test exposed pool-global schema caching bypassing legacy migration on a new store instance; initialization remains instance-scoped and the full database harness passes.

Remaining: unattended lifecycle reconciliation, explicit safe relisting after settled cancellation/refund, and a fresh controlled two-account production trade. These are not claimed complete by this change.

## Release verification

Commit c915b6e3118465ffcf267f052a5847459cae4578 deployed live as dep-dasqce0473hc739gel30. Production build passed (existing third-party annotation and chunk-size warnings). Checkout interaction, hosted proxy and X Layer checkout checks passed.

Authenticated browser after reload: completed demo remains Sold; Test item and Test item - NVDAx replacement now show Reserved. Browse shows zero available items and public listing API returns HTTP 200, enabled=true, zero rows. No payments or listing deletions performed.

Live desktop Browse/My listings/Sell preserve header x=352, y=32, width=1120 at the measured viewport. No horizontal overflow. Confirmation dialog is centered on desktop and, after its animation finishes, sits at the narrow viewport bottom (937.78 of 938 CSS pixels). Cancel dismissed it without mutation. Browser zoom was present, so these are CSS viewport measurements, not physical device measurements.
