# Agreements list menu — 2026-09-23

- Agreements title is centered using the same balanced header layout as Activity.
- Four Pocket-style menu rows: Start new agreement, Requests, Ongoing, Completed.
- Ongoing and Completed use section query parameters so refresh, browser back and native navigation retain the intended list.
- Arc/customer/X Layer work records share compact list rows and updated-at ordering.
- New agreement returns to the Agreements menu when opened there; request-inbox entry remains supported.
- Activity, agreement detail, Trade item detail/enquiries/report screens, funding-request back controls and sign-in back controls use the existing Requests stream-icon-button pattern.
- Requests has a centered heading and back-to-Agreements control.
- No payment or signing behavior changed.

Checks: TypeScript; request account-isolation/compose; standalone surface; native navigation; navigation context; synthetic agreement-menu smoke (section filters, detail/back and app/Telegram context) passed.

Android target: app.hashpaystream 1.0.30 / 31, using the established release signing identity. This updates the existing app; no Candidate package is involved.

Installed successfully on the connected phone as 1.0.30 / 31. Signing certificate verified, adb install -r succeeded, launch returned Status: ok, and the original installation date was preserved. Signed release build, native tests and lint completed successfully.
