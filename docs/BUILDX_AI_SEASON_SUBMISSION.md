# HashPayStream Upfront - BuildX AI Season submission

## Submission fields

### Project name

HashPayStream Upfront

### Project description

HashPayStream Upfront turns funded real-world service agreements into
AI-underwritten cash-flow assets. A customer funds a protected USDC agreement;
ZeroScout Agreement Intelligence evaluates the delivery evidence and data gaps;
PolyDesk applies deterministic risk limits and signs a bounded EIP-712 advance
offer; and an allowlisted liquidity provider can verify and escrow that advance
on X Layer.

The result is working-capital infrastructure for freelancers, agencies,
suppliers, and other service providers without asking the customer to pay
twice. Arc testnet provides the protected-payment evidence for this technical
pilot, while X Layer independently owns advance execution. The system makes no
bridge or collateral-equivalence claim between the networks.

### Project URL

https://hashpaystream.app/upfront

### GitHub

https://github.com/Cyano88/hashpaystream

### Implementation repositories

- Application, gateway, and X Layer contracts: https://github.com/Cyano88/hashpaystream
- Agreement Intelligence and 0G proof layer: https://github.com/Cyano88/zeroscout-arena
- Isolated PolyDesk underwriting signer: https://github.com/Cyano88/polydesk-upfront-service

The underwriting service is isolated from PolyDesk's OKX.AI marketplace agent.

### Onchain proof

- Arc testnet split-settlement router: `0xF4D6700B383b6b8Eb14c3b43d5124444D2ecb7b9`
- X Layer testnet escrow: `0x300D0D41a10006f3cb1Da01aed2Fc28418c7E6Be`
- X Layer mainnet escrow: `0xCA4f547527A64a94c9b45306f311D8658d8A3Dbf`
- Mainnet deployment transaction: `0x5527265433154b7168201dd94a4da946ec811a0435b7f937503aba196bc9f845`
- Mainnet explorer: https://www.xlayerscan.com/address/0xCA4f547527A64a94c9b45306f311D8658d8A3Dbf
- Mainnet USDC: `0xB6CEceAB302E2E4948951eE7843FC24E92933061`

## Why this is AI-RWA

The real-world asset is a provider's right to receive payment under a funded
service agreement. AI is in the decision path, not added as a chat layer:

1. HashPayStream binds funded agreement terms and a canonical terms hash.
2. ZeroScout returns evidence-bound Agreement Intelligence: confidence,
   evidence grade, delivery clarity, data gaps, and a cryptographic commitment.
3. PolyDesk deterministically converts that intelligence into approve,
   escalate, or block and caps the maximum advance.
4. PolyDesk signs the approved offer as EIP-712 data for the intended X Layer
   escrow, provider, amount, terms hash, and intelligence commitment.
5. The X Layer contract independently verifies the offer and enforces the
   funder allowlist, pause control, expiry, per-advance cap, and lifetime cap.

## Architecture

```text
Customer-funded service agreement (Arc testnet)
                    |
                    v
          HashPayStream agreement gateway
                    |
                    v
        ZeroScout Agreement Intelligence
     evidence grade + confidence + commitment
                    |
                    v
           PolyDesk underwriting policy
       APPROVE / ESCALATE / BLOCK + EIP-712
                    |
                    v
       UpfrontAdvanceEscrow on X Layer
 allowlisted funder + pause + expiry + hard caps
```

## 90-second demo script

### 0-12 seconds - problem

"A freelancer can finish the work today but wait weeks for payment. Asking the
customer to pay twice is not a solution. HashPayStream Upfront turns the funded
agreement itself into verifiable working-capital evidence."

### 12-28 seconds - protected agreement

Open HashPayStream and show the funded Arc testnet agreement. Emphasize that the
customer payment is already protected and that Arc test USDC has no financial
value in this technical pilot.

### 28-48 seconds - AI decision

Open `/upfront`, select the funded agreement, add the X Layer provider payout
address, and request an advance. Show ZeroScout's evidence grade, confidence,
summary, and the maximum advance selected by PolyDesk.

### 48-67 seconds - liquidity-provider view

Open the private funding desk. Show the verified offer, protected amount,
advance amount, gross spread, term, evidence grade, and confidence. Show that a
dedicated Privy treasury identity is required.

### 67-82 seconds - X Layer proof

Open the X Layer explorer and repository deployment record. Show the testnet
and mainnet escrow addresses and explain the contract controls: allowlisted
funders, paused-by-default deployment, signed offer verification, expiries, and
hard funding caps.

### 82-90 seconds - close

"HashPayStream Upfront is AI-underwritten liquidity for real-world work:
customer protection on one side, bounded X Layer capital on the other."

## X launch post

Attach the 90-second demo to this post from the official project account:

```text
Introducing HashPayStream Upfront: AI-underwritten liquidity for real-world service agreements on @XLayerOfficial.

Funded terms -> ZeroScout evidence -> PolyDesk risk limits -> an X Layer advance.

Live: https://hashpaystream.app/upfront
#BuildX #AIRWA
```

## Submission checklist

- [ ] Public product URL opens directly to the Upfront story.
- [ ] GitHub repository is public and points to the submitted commit.
- [ ] X Layer testnet and mainnet addresses are included.
- [ ] Demo shows one funded agreement and one real Agreement Intelligence result.
- [ ] Demo does not claim Arc test USDC backs real X Layer USDC.
- [ ] Official project X account publishes the demo and tags `@XLayerOfficial`.
- [ ] X post URL is copied into the submission form.
- [ ] Email and Telegram contact fields are correct.
- [ ] Form is submitted before August 21, 2026 at 23:59 UTC.
