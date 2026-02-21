use anchor_lang::prelude::*;
use stablebond_types::BondConfig;

/// Registry of all supported sovereign bond types.
/// PDA seeds: ["bond_registry", protocol_config]
#[account]
#[derive(Debug)]
pub struct BondRegistry {
    /// Reference to the ProtocolConfig
    pub protocol_config: Pubkey,
    /// List of supported bond configurations (max 8)
    pub bonds: Vec<BondConfig>,
    /// PDA bump
    pub bump: u8,
}

impl BondRegistry {
    /// Max 8 bond types to keep account size manageable
    pub const MAX_BONDS: usize = 8;

    pub const LEN: usize = 8    // discriminator
        + 32                     // protocol_config
        + 4                      // Vec length prefix
        + (BondConfig::LEN * Self::MAX_BONDS) // max bonds
        + 1;                     // bump

    pub const SEED: &'static [u8] = b"bond_registry";
}
