use anchor_lang::prelude::*;

/// Global protocol configuration. PDA seeds: ["stablebond_config"]
#[account]
#[derive(Debug)]
pub struct ProtocolConfig {
    /// Admin authority
    pub authority: Pubkey,
    /// Protocol treasury for fee collection
    pub treasury: Pubkey,
    /// USDC mint (SPL Token) — primary settlement currency
    pub usdc_mint: Pubkey,
    /// Protocol USDC vault token account
    pub usdc_vault: Pubkey,
    /// Accredit KYC registry program ID
    pub kyc_registry: Pubkey,
    /// Sovereign identity program ID
    pub sovereign_program: Pubkey,
    /// PDA storing BondConfig[] for all supported bonds
    pub bond_registry: Pubkey,
    /// Fee for cross-currency conversion (basis points)
    pub conversion_fee_bps: u16,
    /// Management fee on AUM (basis points, annualized)
    pub management_fee_bps: u16,
    /// Performance fee on yield (basis points)
    pub performance_fee_bps: u16,
    /// Total deposits across all bond vaults (in settlement currency)
    pub total_deposits: u64,
    /// Total yield earned across all users
    pub total_yield_earned: u64,
    /// Total pending conversion amount
    pub pending_conversion: u64,
    /// Nonce for deposit IDs
    pub deposit_nonce: u64,
    /// Number of supported bond types
    pub num_supported_bonds: u8,
    /// Protocol active flag
    pub is_active: bool,
    /// Creation timestamp
    pub created_at: i64,
    /// Last update timestamp
    pub updated_at: i64,
    /// PDA bump
    pub bump: u8,
    /// USDC vault PDA bump
    pub usdc_vault_bump: u8,
}

impl ProtocolConfig {
    pub const LEN: usize = 8  // discriminator
        + 32  // authority
        + 32  // treasury
        + 32  // usdc_mint
        + 32  // usdc_vault
        + 32  // kyc_registry
        + 32  // sovereign_program
        + 32  // bond_registry
        + 2   // conversion_fee_bps
        + 2   // management_fee_bps
        + 2   // performance_fee_bps
        + 8   // total_deposits
        + 8   // total_yield_earned
        + 8   // pending_conversion
        + 8   // deposit_nonce
        + 1   // num_supported_bonds
        + 1   // is_active
        + 8   // created_at
        + 8   // updated_at
        + 1   // bump
        + 1;  // usdc_vault_bump

    pub const SEED: &'static [u8] = b"stablebond_config";
    pub const USDC_VAULT_SEED: &'static [u8] = b"stablebond_usdc_vault";
}
