use anchor_lang::prelude::*;
use stablebond_types::BondType;

/// Per-bond-type vault configuration.
/// PDA seeds: ["bond_vault", authority, &[bond_type as u8]]
#[account]
#[derive(Debug)]
pub struct BondVault {
    /// Authority that can admin the vault
    pub authority: Pubkey,
    /// Settlement currency mint (e.g. USDC, MXN stablecoin, BRL token)
    pub currency_mint: Pubkey,
    /// Share token mint (minted to represent vault shares)
    pub share_mint: Pubkey,
    /// Token account holding vault's currency deposits
    pub currency_vault: Pubkey,
    /// Which sovereign bond type this vault represents
    pub bond_type: BondType,
    /// Bond coupon rate in basis points (from Continuum CollateralType)
    pub coupon_rate_bps: u16,
    /// Bond maturity date as unix timestamp (0 = no maturity / rolling)
    pub maturity_date: i64,
    /// Target APY in basis points (e.g., 450 = 4.50%)
    pub target_apy_bps: u16,
    /// Total currency deposited (accounting value)
    pub total_deposits: u64,
    /// Total shares outstanding
    pub total_shares: u64,
    /// NAV per share scaled by 1e6 (starts at 1_000_000 = 1.000000)
    pub nav_per_share: u64,
    /// Last time yield was accrued (unix timestamp)
    pub last_accrual: i64,
    /// Whether vault accepts deposits/withdrawals
    pub is_active: bool,
    /// PDA bump for BondVault
    pub bump: u8,
    /// PDA bump for share_mint
    pub share_mint_bump: u8,
    /// PDA bump for currency_vault token account
    pub vault_bump: u8,
}

impl BondVault {
    pub const LEN: usize = 8  // discriminator
        + 32  // authority
        + 32  // currency_mint
        + 32  // share_mint
        + 32  // currency_vault
        + 1   // bond_type (enum)
        + 2   // coupon_rate_bps
        + 8   // maturity_date
        + 2   // target_apy_bps
        + 8   // total_deposits
        + 8   // total_shares
        + 8   // nav_per_share
        + 8   // last_accrual
        + 1   // is_active
        + 1   // bump
        + 1   // share_mint_bump
        + 1;  // vault_bump

    pub const SEED: &'static [u8] = b"bond_vault";
    pub const CURRENCY_VAULT_SEED: &'static [u8] = b"bond_currency_vault";
    pub const SHARE_MINT_SEED: &'static [u8] = b"bond_share_mint";
}

/// Per-user share tracking within a bond vault.
/// PDA seeds: ["bond_shares", vault, user]
#[account]
#[derive(Debug)]
pub struct UserShares {
    /// User who owns these shares
    pub user: Pubkey,
    /// Reference to the BondVault
    pub vault: Pubkey,
    /// Number of share tokens held
    pub shares: u64,
    /// Total currency deposited by this user (for P&L tracking)
    pub deposited_amount: u64,
    /// Timestamp of last deposit
    pub last_deposit_at: i64,
    /// PDA bump
    pub bump: u8,
}

impl UserShares {
    pub const LEN: usize = 8  // discriminator
        + 32  // user
        + 32  // vault
        + 8   // shares
        + 8   // deposited_amount
        + 8   // last_deposit_at
        + 1;  // bump

    pub const SEED: &'static [u8] = b"bond_shares";
}
