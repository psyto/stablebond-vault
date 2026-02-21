use anchor_lang::prelude::*;
use stablebond_types::{BondType, DepositStatus};

/// Pending deposit awaiting cross-currency conversion.
/// PDA seeds: ["pending_deposit", config, user, nonce_bytes]
#[account]
#[derive(Debug)]
pub struct PendingDeposit {
    /// Depositor
    pub user: Pubkey,
    /// Reference to ProtocolConfig
    pub protocol_config: Pubkey,
    /// Bond type this deposit targets
    pub bond_type: BondType,
    /// Source amount deposited (in deposit currency minor units)
    pub source_amount: u64,
    /// Minimum settlement currency output (slippage protection)
    pub min_output: u64,
    /// Deposit timestamp
    pub deposited_at: i64,
    /// Expiry timestamp (24h after deposit)
    pub expires_at: i64,
    /// Current status
    pub status: DepositStatus,
    /// Conversion rate used (source per settlement, scaled 1e6) — set on conversion
    pub conversion_rate: u64,
    /// Settlement currency received after conversion — set on conversion
    pub settlement_received: u64,
    /// Fee paid in settlement currency — set on conversion
    pub fee_paid: u64,
    /// Deposit nonce (unique per user)
    pub nonce: u64,
    /// PDA bump
    pub bump: u8,
}

impl PendingDeposit {
    pub const LEN: usize = 8   // discriminator
        + 32  // user
        + 32  // protocol_config
        + 1   // bond_type
        + 8   // source_amount
        + 8   // min_output
        + 8   // deposited_at
        + 8   // expires_at
        + 1   // status (enum)
        + 8   // conversion_rate
        + 8   // settlement_received
        + 8   // fee_paid
        + 8   // nonce
        + 1;  // bump

    pub const SEED: &'static [u8] = b"pending_deposit";

    /// 24 hours in seconds
    pub const EXPIRY_SECONDS: i64 = 24 * 60 * 60;
}
