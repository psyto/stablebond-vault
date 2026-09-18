# References

Source material for the compliance, vault, and NAV-oracle layers of this protocol.

## In this directory

| File | What it is | Why it is here |
|---|---|---|
| `EIP-4626.txt` | Tokenized Vault Standard (Ethereum, CC0) | The share-accounting semantics this protocol's `stablebond-yield` mirrors — `convertToShares`/`convertToAssets`, preview functions, rounding direction |
| `ERC-3643.txt` | T-REX permissioned token standard (Ethereum, CC0) | Reference model for `canTransfer`-style eligibility checks and forced transfer/recovery. Maps onto this protocol's tier-based access control |

## Cited but not redistributed

Third-party whitepapers are kept locally (gitignored — see `.gitignore`) rather than committed,
since their copyright is retained by the authors.

- **TSSO: Trusted Single Source Oracle** — Miki Bergin (Securitize), Jakub Wojciechowski (RedStone),
  July 2025. **The most directly applicable document here.** Specifies cryptographic verification for
  single-source NAV data: a Secure Root Key for manual/significant updates and a Derivative Chain Key
  for automated updates within a deviation threshold (δ ≤ ε), with each record chained via
  `assetId ‖ price ‖ timestamp ‖ seqNum ‖ prevSig ‖ prevHash`, plus periodic re-signing to prevent
  stale data. This is the specification `update_nav` and the reserve-attestation path should
  implement, rather than an ad-hoc signed price feed.
- **DS Protocol** — Carlos Domingo, Shay Finkelstein, Jorge Serna (Securitize), v1.0.0, June 2018.
  Trust Service / Registry Service / Compliance Service / Comms Service decomposition. Note the
  Registry Service holds investor country, KYC status, accreditation status and expiry dates — the
  field set a tier model needs.
- **The Infrastructure of Tokenized Securities: How Securitize Powers the RWA Market.** Market
  context and a walkthrough of DS Protocol as implemented for BUIDL.

## Note on Solana

None of the above mentions Solana; all three are EVM-native. The Solana-side landscape as of
2026-09 — what exists, what stalled, and what is genuinely absent — is written up in a non-public
working note kept outside this repository, since it carries deal context.
