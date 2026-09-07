# Authorized history reset - 2026-09-07

Completed at 2026-09-07T20:14:23.592Z following explicit user confirmation to clear all payment, agreement and request history while preserving accounts, wallet access and Trade data.

Scope was the HashPayStream production Render database. Read-only inventory found only public.render_durable_kv; no Trade tables were present in this database. No other database or service was reset.

## Deleted history

- 18 Upfront assessment records.
- 11 Upfront and 1 human agreement ownership records.
- 16 service requests and their 16 idempotency entries.
- 27 Upfront webhook events.
- Transfer history and other targeted existing retry maps were already empty.

Five existing store rows were updated to empty history collections, preserving schema envelopes. No table or account row was dropped. All fields outside the explicitly approved collections were compared by canonical fingerprint before commit and matched. Three accounts and one funding-partner profile remain. No wallet keys, credentials, configuration or Trade data were changed.

## Verification

The operation required a matching fresh plan fingerprint, verified database identity, expected store configuration and table inventory, and Render recoveryStatus AVAILABLE. A transaction-level table lock prevented concurrent writes during the reset. The transaction verified all targeted collections empty and all non-target data unchanged before committing.

An independent read-only connection at 2026-09-07T20:14:43.820Z confirmed every targeted collection remained empty and preserved record counts matched. Production readiness returned HTTP 200 / ready at 20:14:40.896Z; the live source commit remained a8e6efb9ef6b3885954d6ccde7ef5f94ac21a488.

Recovery availability was checked, but no restore drill or external export was performed. Sanitized aggregate execution evidence remains in ignored output/playwright/clean-slate-reset-apply.json and clean-slate-inventory.json; no deleted record contents were exported.

## Limits and migration consequence

This is a database history reset, not contract migration, settlement, cancellation or blockchain erasure. Earlier migration audits describe the pre-reset database. Their observed on-chain states and the mixed X Layer mainnet / Arc testnet configuration were not changed by this operation. New signed provider deliveries or new user activity can create fresh history; webhook ingress was not disabled.

The previous database records are no longer available to the migration reader. Do not claim that their history was migrated or that the old contracts have been retired. Reviewed contract activation and the other production release gates remain separate work.
