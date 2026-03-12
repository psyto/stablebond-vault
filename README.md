# Stablebond Vault

Multi-sovereign bond vault protocol on Solana. Deposit into tokenized government bonds (US T-Bills, MX CETES, BR Tesouro, JP JGBs) with tier-based access control, automated yield accrual, oracle-driven pricing, proof-of-reserve attestation, and cooldown-based withdrawals.

## Architecture

```
programs/
  stablebond-core/     Anchor program — deposits, withdrawals, yield claims, admin
  stablebond-yield/    Anchor program — per-bond vaults, NAV accrual, share accounting,
                       oracle pricing, reserve attestation, keeper incentives
crates/
  stablebond-types/    Shared Rust types (BondType, Tier, DepositStatus, etc.)
packages/
  types/               TypeScript type definitions
  sdk/                 Client SDK, PDA finders, yield math, tier limits, keeper bots,
                       compliance, stratum utils
app/
  frontend/            Next.js 14 dashboard (App Router + Tailwind + wallet adapter)
tests/                 Anchor integration tests (~35 test cases across 2 suites)
```

## Programs

### stablebond-core (`3fnWkVPz51AJjYodQY5VCzteD5enRmkWBTsu3gPedaYs`)

| Instruction | Description |
|---|---|
| `initialize_protocol` | Set up protocol config, bond registry, fees |
| `register_bond` | Register a bond type (US T-Bill, JP JGB, etc.) |
| `register_yield_source` | Link yield source to a bond/currency |
| `deposit_direct` | Deposit when currency matches settlement |
| `deposit_cross_currency` | Cross-currency deposit via keeper conversion |
| `execute_conversion` | Keeper executes pending conversion |
| `request_withdrawal` | Request withdrawal with cooldown period |
| `claim_withdrawal` | Claim matured withdrawal after cooldown |
| `cancel_withdrawal` | Cancel pending withdrawal before cooldown expires |
| `withdraw` | Legacy immediate withdraw (gated, see below) |
| `claim_yield` | Claim accrued yield for a bond position |
| `update_nav` | Update NAV from yield vault |
| `update_protocol_config` | Admin: update fee settings |
| `update_yield_source` | Admin: update yield source config |
| `pause_protocol` | Admin: pause all operations |
| `resume_protocol` | Admin: resume operations |

### stablebond-yield (`DLFUfzV4iqCzxmmXmCpR7qH6nhvPSLUekq7JCezV1LeE`)

| Instruction | Description |
|---|---|
| `initialize_vault` | Create bond vault with target APY and maturity |
| `deposit` | Deposit settlement currency, receive vault shares |
| `withdraw` | Burn shares, receive currency at NAV (gated by `allow_immediate_withdraw`) |
| `accrue_yield` | Keeper crank: accrue yield using oracle or fallback APY |
| `accrue_yield_incentivized` | Incentivized keeper crank with reward (min 30s interval) |
| `update_apy` | Admin: update fallback target APY (max 50%) |
| `configure_oracle` | Admin: set/enable/disable bond price oracle feed |
| `configure_reserve_attestor` | Admin: set attestor authority and staleness threshold |
| `submit_reserve_attestation` | Attestor: submit proof-of-reserve amount |
| `set_immediate_withdraw` | Admin: toggle legacy immediate withdrawal (emergency use) |

## Withdrawal Flow

Withdrawals use a **cooldown-based flow** by default:

1. **Request** — `request_withdrawal` locks shares and records `claimable_at` timestamp
2. **Wait** — Cooldown period must elapse before claiming
3. **Claim** — `claim_withdrawal` releases funds after cooldown
4. **Cancel** — `cancel_withdrawal` returns shares before cooldown expires

Legacy immediate withdraw (`withdraw` on stablebond-yield) is gated by `allow_immediate_withdraw` (default: `false`). The authority can enable it for emergency liquidity via `set_immediate_withdraw`.

## Oracle-Driven NAV

Each bond vault can optionally use a **bond price oracle** (Pyth/Switchboard) for market-driven yield instead of the admin-set fallback APY.

- **Oracle enabled** — Yield derived from bond price vs par value. Discount bonds accrue positive yield; premium bonds amortize the premium against coupon rate.
- **Oracle disabled** — Falls back to `target_apy_bps` set by authority.
- **Staleness protection** — Oracle data older than 300 seconds is rejected.
- The `configure_oracle` instruction sets the feed address and enables/disables oracle pricing.

## Proof of Reserve (PoR)

Bond vaults support **off-chain reserve attestation** for transparency:

- A configured `reserve_attestor` authority periodically submits the custodian's attested reserve amount via `submit_reserve_attestation`.
- If the attestation becomes stale (older than `attestation_max_staleness`), **yield accrual pauses** until a fresh attestation is submitted.
- The frontend displays a reserve coverage indicator showing the backing ratio.
- The SDK provides `verifyReserveCoverage(attestedReserve, totalDeposits)` for off-chain verification.

## Bond Types

| Bond | Currency | Default APY | Min Tier |
|---|---|---|---|
| US T-Bill | USD | 4.50% | Bronze |
| MX CETES | MXN | 9.00% | Silver |
| BR Tesouro | BRL | 13.00% | Gold |
| JP JGB | JPY | 0.40% | Bronze |

## Tier System

| Tier | Bonds Accessible | Monthly Limit (USD equiv.) |
|---|---|---|
| Bronze | US T-Bill, JP JGB | $5,000 |
| Silver | + MX CETES | $50,000 |
| Gold | + BR Tesouro | $500,000 |
| Diamond | + Custom | Capped per bond type |

Diamond tier caps are set per bond type (e.g. US T-Bill: $10M, MX CETES: MXN$5M, BR Tesouro: R$5M, JP JGB: ¥1B) rather than unlimited.

## Frontend

Next.js 14 dashboard at `app/frontend/` with dark financial theme.

**Pages:**
- `/` — Portfolio dashboard (positions, pending deposits, yield summary)
- `/bonds` — Bond explorer with oracle status and reserve backing indicators per card
- `/bonds/[bondType]` — Bond detail with deposit, withdrawal request/claim/cancel, yield claim, reserve coverage indicator, and oracle vs fallback APY badge
- `/yield` — Yield tracking with per-bond breakdown, projections, and aggregate reserve coverage across all vaults
- `/admin` — Protocol config, pause/resume, bond registry, yield sources, oracle/attestor configuration panel, and immediate withdraw toggle (authority-only)

**Stack:** Next.js 14 App Router, Tailwind CSS, `@solana/wallet-adapter` (Phantom, Solflare)

### Run the frontend

```bash
cd app/frontend
npm install
npm run dev
# Open http://localhost:3000
```

**Environment variables:**
- `NEXT_PUBLIC_RPC_URL` — Solana RPC endpoint (default: devnet)
- `NEXT_PUBLIC_NETWORK` — `devnet` | `mainnet-beta`

## SDK

```typescript
import { StablebondClient } from "@stablebond/sdk";
import { BondType, Tier, BOND_TYPE_LABELS } from "@stablebond/types";

// Read methods (no wallet required)
const config = await client.getProtocolConfig();
const bonds = await client.getSupportedBonds();
const portfolio = await client.getPortfolio(walletPubkey);
const vault = await client.getBondVault(BondType.UsTBill);
const vaultExt = await client.getBondVaultExtended(BondType.UsTBill); // includes oracle + PoR fields

// Withdrawal flow
const requests = await client.getWithdrawalRequests(walletPubkey, BondType.UsTBill);
await client.requestWithdrawal(shares, BondType.UsTBill, accounts);
await client.claimWithdrawal(nonce, BondType.UsTBill, accounts);
await client.cancelWithdrawal(nonce, BondType.UsTBill, accounts);

// Admin (requires withYieldProgram)
client.withYieldProgram(yieldProgram);
await client.configureOracle(BondType.UsTBill, oracleFeedPubkey, true);
await client.configureReserveAttestor(BondType.UsTBill, attestorPubkey, maxStalenessBN);
await client.setImmediateWithdraw(BondType.UsTBill, false);

// Yield math
import { sharesToValue, unrealizedYield, projectNav, formatAmount } from "@stablebond/sdk";
const value = sharesToValue(position.currentShares, yieldSource.navPerShare);
const pnl = unrealizedYield(position.currentShares, navPerShare, position.costBasis);

// Reserve verification
import { verifyReserveCoverage } from "@stablebond/sdk";
const { ratio, isFullyBacked } = verifyReserveCoverage(attestedReserve, totalDeposits);

// Tier validation
import { validateDeposit, getRemainingCapacity } from "@stablebond/sdk";
const error = validateDeposit(Tier.Silver, BondType.MxCetes, amount, monthlyDeposited);
```

## Keeper Bots

Four automated services in `packages/sdk/src/keeper/`, all exported from `@stablebond/sdk`:

| Service | Purpose | Default Interval |
|---|---|---|
| `NavUpdater` | Accrue yield and update NAV across all bond vaults | 60s |
| `OracleBridge` | Configure and verify oracle feeds for bond pricing | On-demand |
| `ReserveAttestor` | Fetch custodian reserves and submit on-chain attestations | 1 hour |
| `ConversionBot` | Watch for pending cross-currency deposits and execute conversions | 10s |

```typescript
import { NavUpdater, OracleBridge, ReserveAttestor, ConversionBot } from "@stablebond/sdk";

// NavUpdater
const navUpdater = new NavUpdater(connection, coreProgram, yieldProgram, keeper, coreProgramId, yieldProgramId);
await navUpdater.start(60_000);

// ReserveAttestor
const attestor = new ReserveAttestor(connection, yieldProgram, attestorKeypair, yieldProgramId, custodianEndpoints);
await attestor.start(3600_000);
```

## Compliance

Identity verification and sanctions screening are integrated into the deposit flow.

**Dependencies:**

| Package | Purpose |
|---|---|
| `@accredit/sdk` | On-chain KYC / identity verification |
| `@accredit/types` | Shared types for Accredit identity primitives |
| `@complr/sdk` | Off-chain sanctions & PEP screening |

**Compliance utility** (`packages/sdk/src/lib/compliance.ts`) exposes two helpers:

- `screenWallet(address)` — Pre-deposit sanctions/PEP check via Complr. Returns `allowed`, `riskLevel`, `sanctions`, and `flags`. Wallets flagged as `critical`, `high`, or sanctioned are rejected.
- `checkDepositCompliance({ transactionId, depositorWallet, vaultWallet, amount, currency })` — Post-deposit transaction compliance check. Returns `compliant`, `status`, and `actionItems`.

Requires the `COMPLR_API_KEY` environment variable.

## Stratum Integration

Compact data structures from `@stratum/core` for tier verification, deposit tracking, and bond auditing.

**Dependency:**

| Package | Purpose |
|---|---|
| `@stratum/core` | MerkleTree and Bitfield primitives |

**Stratum utilities** (`packages/sdk/src/lib/stratum-utils.ts`):

- `buildTierMembershipTree(depositors)` — Build a MerkleTree over tier-verified depositors. Each leaf encodes `wallet:tier:monthlyLimit`, enabling compact on-chain proof of tier membership without loading all user position PDAs.
- `getTierProof(tree, wallet, tier, monthlyLimit)` — Generate a merkle proof for a single depositor's tier. Returns `proof`, `root`, and `index`.
- `createMonthlyDepositTracker(depositorCount)` — Create a Bitfield to track which depositors have deposited this month. One bit per depositor slot (10,000 depositors = 1.25 KB).
- `restoreDepositTracker(data)` — Restore a Bitfield from previously stored bytes.
- `buildBondRegistryTree(bonds)` — Build a MerkleTree of registered bond types for proof-of-reserve auditing.
- `buildProofOfReserveTree(holdings)` — Build a Proof-of-Reserve merkle tree from custodian holdings.
- `getReserveProof(tree, ...)` — Generate a proof for a specific holding in the PoR tree.
- `verifyReserveCoverage(attestedReserve, totalDeposits)` — Check reserve backing ratio.

## Tests

~35 integration tests across two suites:

```bash
anchor test
```

### stablebond-yield.ts
- Vault initialization (US T-Bill, JP JGB, APY validation)
- Deposit and share minting at 1:1 NAV
- Withdrawal with NAV-based currency conversion (with immediate withdraw enabled)
- Zero deposit/withdrawal rejection, insufficient balance checks
- Yield accrual with time-elapsed calculation
- Maturity date enforcement (accrual stops after maturity)
- APY updates with authority checks
- Multi-bond vault independence

### new-features.ts
- Oracle configuration (enable/disable, authority checks, fallback APY accrual)
- Reserve attestation (configure attestor, submit attestation, staleness-paused accrual, fresh attestation resumes accrual)
- Incentivized keeper crank (30s minimum interval, NAV increase, reward payout)
- Withdrawal request PDA derivation (determinism, uniqueness across nonces/users/configs)
- Legacy withdraw gating (rejected when disabled, authority toggle, non-authority rejection)
- Withdrawal cooldown e2e PDA derivation (stability, uniqueness, seed correctness)
- Diamond tier caps (concrete caps per bond type, not u64::MAX)

## License

MIT
