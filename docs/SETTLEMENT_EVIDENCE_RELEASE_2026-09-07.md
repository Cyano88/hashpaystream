# Settlement evidence release - 2026-09-07

Web source: 56ecbe02883b6306d7c11b1ca39b5588ec4b36df; Android bundled source: 1ccfd45e4cfd86128817a766c5013a5f44125a10

Render deployment: dep-dafjmih5efls73av7qr0 (live). Android 1.0.18 / code 19 is installed on the Pixel with the existing signing certificate. All 281 bundled web assets match the checked build; the live web entry matches Android. Health/readiness returned 200.

Evidence verification covers successful receipt, exact router/agreement event, original chain and canonical block, with two confirmations. Recovery persists its starting block before submission and scans bounded event pages after interruption. Tests cover database failure after chain success without paying twice, absent proof, wrong chain/router/event, reverted transactions and RPC failure. Shared image/PDF inputs use the actual transaction reference and timestamp.

Both contracts remain paused and worker/automatic-settlement flags remain false. No financial transaction, unpause, allowlisting or signing-key change occurred. The next gate is an authorized funding-to-split/refund walkthrough and recovery exercise. Local tests and operational health are not proof of live financial execution.
