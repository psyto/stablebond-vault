use anchor_lang::prelude::*;
use stablebond_types::{BondType, ConversionDirection};

/// Historical conversion record.
/// PDA seeds: ["conversion", config, user, nonce_bytes]
#[account]
#[derive(Debug)]
pub struct ConversionRecord {
    /// User who initiated the conversion
    pub user: Pubkey,
    /// Reference to ProtocolConfig
    pub protocol_config: Pubkey,
    /// Bond type this conversion was for
    pub bond_type: BondType,
    /// Source currency amount (minor units)
    pub source_amount: u64,
    /// Settlement currency amount (minor units)
    pub settlement_amount: u64,
    /// Exchange rate used (source per settlement, scaled 1e6)
    pub exchange_rate: u64,
    /// Fee amount in settlement currency (minor units)
    pub fee_amount: u64,
    /// Direction of conversion
    pub direction: ConversionDirection,
    /// Timestamp of conversion
    pub timestamp: i64,
    /// Conversion nonce
    pub nonce: u64,
    /// PDA bump
    pub bump: u8,
}

impl ConversionRecord {
    pub const LEN: usize = 8   // discriminator
        + 32  // user
        + 32  // protocol_config
        + 1   // bond_type
        + 8   // source_amount
        + 8   // settlement_amount
        + 8   // exchange_rate
        + 8   // fee_amount
        + 1   // direction (enum)
        + 8   // timestamp
        + 8   // nonce
        + 1;  // bump

    pub const SEED: &'static [u8] = b"conversion";
}
