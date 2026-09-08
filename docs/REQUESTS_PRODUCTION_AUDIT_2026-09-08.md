# Requests production audit - 8 September 2026

Scope: customer creation, provider response/counter, final acceptance, agreement handoff, cancellation, account changes and recovery. Tests use isolated identities/stores/upstream fixtures. No private requests or messages sent to real users, and no funds moved.

Fixed and reproduced before changes:
- Account switch retained the previous Requests list. The hook now scopes visible results, caches, access-token continuations and late responses to the active Privy user, invalidates requests on unmount, and hides old results immediately.
- Cancellation could succeed while acceptance awaited upstream agreement creation, then be overwritten by the creation callback. Durable accepted-version guards now block negotiation while acceptance is pending. A creation-attempt marker is stored before the upstream call; after an ambiguous result, accepted terms remain reserved for the existing per-request/version idempotent recovery. Failures before creation is attempted still roll back. No acceptance event is published before ownership and agreement linkage are stored.
- The compose form generated a new idempotency key on every retry. Unchanged content now reuses its key for the open form lifetime, with a synchronous guard against rapid duplicate submits. Edited content gets a new key.
- Pending acceptance exposes Continue acceptance and disables Cancel; agreement completion timestamps reflect completion time.

Validation includes account switch/late response/logout fixtures, actual compose component duplicate/retry tests, acceptance/cancellation concurrency and lost-response recovery, existing direct/early-pay request suites, stale-version and role authorization, terminal lifecycle and customer-request tests. Full release validation is recorded with the Android package.

Limits: compose idempotency is retained for the current form instance, not after abandoning/reopening the form. An upstream creation attempt must be reconciled through Continue acceptance before cancellation; it is intentionally not treated as a failed creation just because the response is missing. No new live private-request rehearsal was performed. Public savings and early-pay launch containment remain unchanged; timed canary/refund checks are still pending.
