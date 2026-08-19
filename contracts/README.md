# HashPayStream Upfront escrow

This workspace contains the non-upgradeable X Layer advance escrow and the Arc
repayment router. The X Layer contract holds only the advance. The fixed Arc
router is the Hash PayLink project recipient and credits confirmed repayment to
the funder; no asset bridge is assumed.

```text
npm install
npm run compile
npm run test:upfront
```

Deploy the Arc router first with `npm run deploy:arc-testnet`, configure its
address as the Hash PayLink project's fixed Arc recipient, then deploy the X
Layer escrow with `npm run deploy:testnet`. The scripts refuse chains other
than Arc testnet 5042002 and X Layer testnet 1952 respectively. Never reuse
application secrets as signer keys and never commit the local `.env`.
