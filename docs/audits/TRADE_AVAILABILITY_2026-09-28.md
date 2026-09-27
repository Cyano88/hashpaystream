# Trade availability follow-up - 2026-09-28

Scope: Hash PayStream web Trade. No agent wallet work or payment transactions.

Confirmed gap: Browse selected active listings even when an accepted offer or immutable funding reservation existed. Existing uniqueness constraints already prevented a second accepted offer/reservation; discovery and new enquiries did not reflect this restriction.

Availability is now derived from those existing records. Browse excludes reserved listings. Owner lists, saved items and direct links retain them with Reserved copy; Ask seller is hidden. New enquiries recheck availability under the listing lock. Existing conversation access is preserved. Shared schema initialization makes availability queries valid on fresh databases and retains legacy migration behavior.

Accepted terms cancelled before reservation restore availability. Reservations remain immutable and do not reopen automatically after cancellation/refund/dispute. Reserved does not claim funds have arrived. Confirmed release continues to mark listings sold via the existing authenticated checkout reconciliation.

Validation: TypeScript, navigation component checks, hosted-route checks and isolated PostgreSQL publication/community/release tests passed. New assertions cover accepted visibility, saved/direct/owner availability, existing participant access, second-buyer rejection, pre-checkout cancellation and retained reservation blocking. Initial test exposed pool-global schema caching bypassing legacy migration on a new store instance; initialization remains instance-scoped and the full database harness passes.

Remaining: unattended lifecycle reconciliation, explicit safe relisting after settled cancellation/refund, and a fresh controlled two-account production trade. These are not claimed complete by this change.
