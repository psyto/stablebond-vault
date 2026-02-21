use anchor_lang::prelude::*;
use stablebond_types::{BondType, YieldSourceType};

/// Registered yield source with bond metadata.
/// PDA seeds: ["yield_source", config, token_mint]
/// Extended from Exodus to include bond-specific fields.
#[account]
#[derive(Debug)]
pub struct YieldSource {
    /// Reference to ProtocolConfig
    pub protocol_config: Pubkey,
    /// Human-readable name (32 bytes)
    pub name: [u8; 32],
    /// Type of yield source
    pub source_type: YieldSourceType,
    /// The underlying token mint (settlement currency)
    pub token_mint: Pubkey,
    /// Vault/pool where deposits are held in the yield source
    pub deposit_vault: Pubkey,
    /// Vault holding yield tokens (e.g., shares from bond vault)
    pub yield_token_vault: Pubkey,
    /// Current APY in basis points
    pub current_apy_bps: u16,
    /// Total deposited into this source (in settlement currency)
    pub total_deposited: u64,
    /// Total shares held in this source
    pub total_shares: u64,
    /// Allocation weight (basis points of total protocol deposits)
    pub allocation_weight_bps: u16,
    /// Minimum deposit in settlement currency minor units
    pub min_deposit: u64,
    /// Max allocation in settlement currency minor units
    pub max_allocation: u64,
    /// Whether this source is active
    pub is_active: bool,
    /// Last NAV update timestamp
    pub last_nav_update: i64,
    /// NAV per share (scaled 1e6)
    pub nav_per_share: u64,
    // === NEW fields for multi-bond support ===
    /// Which sovereign bond this source represents
    pub bond_type: BondType,
    /// Native currency mint (MXN, BRL, JPY, USDC)
    pub currency_mint: Pubkey,
    /// Pyth/Switchboard feed for this currency vs USD
    pub oracle_feed: Pubkey,
    /// Bond coupon rate in basis points
    pub coupon_rate_bps: u16,
    /// Bond maturity date as unix timestamp (0 = rolling)
    pub maturity_date: i64,
    /// Collateral haircut in basis points
    pub haircut_bps: u16,
    /// PDA bump
    pub bump: u8,
}

impl YieldSource {
    pub const LEN: usize = 8   // discriminator
        + 32  // protocol_config
        + 32  // name
        + 1   // source_type (enum)
        + 32  // token_mint
        + 32  // deposit_vault
        + 32  // yield_token_vault
        + 2   // current_apy_bps
        + 8   // total_deposited
        + 8   // total_shares
        + 2   // allocation_weight_bps
        + 8   // min_deposit
        + 8   // max_allocation
        + 1   // is_active
        + 8   // last_nav_update
        + 8   // nav_per_share
        + 1   // bond_type
        + 32  // currency_mint
        + 32  // oracle_feed
        + 2   // coupon_rate_bps
        + 8   // maturity_date
        + 2   // haircut_bps
        + 1;  // bump

    pub const SEED: &'static [u8] = b"yield_source";
}
