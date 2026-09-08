# Savings receipt export audit - 8 September 2026

Savings deposits, scheduled withdrawals and emergency withdrawals now use UnifiedReceipt and the existing Pocket image/PDF renderer. External documents remain white with the existing inline 24 px status badge. Savings links point to X Layer; existing Arc links remain unchanged.

Confirmed monetary transactions save up to 100 recent references per chain, owner, vault and asset on the device, before the pending record is removed. Opening a receipt fetches the chain receipt, canonical block and confirmation height, rechecks the original intent and exact token transfer, and derives amounts, plan ID and timestamp from chain evidence. Local references are not trusted as receipt contents. Closed plans do not remove their receipt references. Approval and emergency access requests are not payment receipts.

Limits: device-local references, no historical backfill or cross-device receipt archive. Clearing application storage removes references. Existing pending recovery and public launch containment remain in place. No contracts or server launch settings changed. Real emergency withdrawal remains due 10 September at 07:35:49 UTC.

Validation: exact-receipt/recovery smoke, recovery UI smoke, standalone surface checks, TypeScript and configured production build passed. Live 0.10 USDC canary deposit verified read-only at block 70083827. Browser and file rendering checks recorded in output/playwright. Withdrawal export uses synthetic event fixtures until the canary unlocks.
