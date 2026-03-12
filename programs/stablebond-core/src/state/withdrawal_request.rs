use anchor_lang::prelude::*;
use stablebond_types::BondType;

/// Pending withdrawal request with a bond-type-specific cooldown period.
/// Users must first request a withdrawal, then claim it after the cooldown.
/// This aligns with real-world bond liquidation timeframes (T+1 for T-Bills, T+2 for others).
/// PDA seeds: ["withdrawal_request", config, user, &nonce.to_le_bytes()]
#[account]
#[derive(Debug)]
pub struct WithdrawalRequest {
    /// User who requested the withdrawal
    pub user: Pubkey,
    /// Reference to ProtocolConfig
    pub protocol_config: Pubkey,
    /// Bond type for this withdrawal
    pub bond_type: BondType,
    /// Number of shares to burn
    pub shares: u64,
    /// Calculated settlement amount at request time (locked NAV)
    pub amount_out: u64,
    /// When the request was created
    pub requested_at: i64,
    /// When the withdrawal becomes claimable
    pub claimable_at: i64,
    /// Whether the withdrawal has been claimed
    pub is_claimed: bool,
    /// Whether the withdrawal was cancelled
    pub is_cancelled: bool,
    /// Request nonce (from UserPosition)
    pub nonce: u64,
    /// PDA bump
    pub bump: u8,
}

impl WithdrawalRequest {
    pub const LEN: usize = 8   // discriminator
        + 32  // user
        + 32  // protocol_config
        + 1   // bond_type
        + 8   // shares
        + 8   // amount_out
        + 8   // requested_at
        + 8   // claimable_at
        + 1   // is_claimed
        + 1   // is_cancelled
        + 8   // nonce
        + 1;  // bump

    pub const SEED: &'static [u8] = b"withdrawal_request";
}
