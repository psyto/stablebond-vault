# Stablebond Vault

Multi-sovereign bond vault protocol on Solana. Deposit into tokenized government bonds (US T-Bills, MX CETES, BR Tesouro, JP JGBs) with tier-based access control, automated yield accrual, and cross-currency conversion.

## Architecture

```
programs/
  stablebond-core/     Anchor program — deposits, withdrawals, yield claims, admin
  stablebond-yield/    Anchor program — per-bond vaults, NAV accrual, share accounting
crates/
  stablebond-types/    Shared Rust types (BondType, Tier, DepositStatus, etc.)
packages/
  types/               TypeScript type definitions
  sdk/                 Client SDK, PDA finders, yield math, tier limits, keeper bots
app/
  frontend/            Next.js 14 dashboard (App Router + Tailwind + wallet adapter)
tests/                 Anchor integration tests (29 passing)
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
| `withdraw` | Withdraw bonds, receive settlement currency |
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
| `withdraw` | Burn shares, receive currency at current NAV |
| `accrue_yield` | Keeper crank: accrue yield based on elapsed time |
| `update_apy` | Admin: update target APY (max 50%) |

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
| Diamond | + Custom | Unlimited |

## Frontend

Next.js 14 dashboard at `app/frontend/` with dark financial theme.

**Pages:**
- `/` — Portfolio dashboard (positions, pending deposits, yield summary)
- `/bonds` — Bond explorer (comparison grid, APY, TVL)
- `/bonds/[bondType]` — Bond detail with deposit/withdraw/claim forms
- `/yield` — Yield tracking with per-bond breakdown and projections
- `/admin` — Protocol config editor, pause/resume, bond registry (authority-only)

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

// Yield math
import { sharesToValue, unrealizedYield, projectNav, formatAmount } from "@stablebond/sdk";
const value = sharesToValue(position.currentShares, yieldSource.navPerShare);
const pnl = unrealizedYield(position.currentShares, navPerShare, position.costBasis);

// Tier validation
import { validateDeposit, getRemainingCapacity } from "@stablebond/sdk";
const error = validateDeposit(Tier.Silver, BondType.MxCetes, amount, monthlyDeposited);
```

## Keeper Bots

Two automated bots in `packages/sdk/src/keeper/`:

- **ConversionBot** — Watches for pending cross-currency deposits and executes conversions (polls every 10s)
- **NavUpdater** — Accrues yield and updates NAV across all bond vaults (polls every 60s)

## Tests

29 integration tests covering both programs:

```bash
anchor test
```

- Protocol initialization and bond registration
- Tier-based access control (Bronze through Diamond)
- Direct and cross-currency deposits
- Share minting, withdrawals, yield claims
- NAV accrual with maturity date enforcement
- Admin operations (pause, resume, fee updates)
- Multi-bond vault independence

## License

MIT
