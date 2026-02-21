use anchor_lang::prelude::*;
use stablebond_types::BondType;

/// Per-user per-bond-type position tracking.
/// PDA seeds: ["user_position", config, owner, &[bond_type as u8]]
/// One position per (user, bond_type) — simpler accounting, parallel access.
#[account]
#[derive(Debug)]
pub struct UserPosition {
    /// Position owner
    pub owner: Pubkey,
    /// Reference to ProtocolConfig
    pub protocol_config: Pubkey,
    /// Which bond type this position is for
    pub bond_type: BondType,
    /// Total deposited in settlement currency (lifetime, minor units)
    pub total_deposited: u64,
    /// Current shares held for this bond's yield source
    pub current_shares: u64,
    /// Cost basis in settlement currency
    pub cost_basis: u64,
    /// Realized yield in settlement currency (already withdrawn)
    pub realized_yield: u64,
    /// User's Sovereign tier at last check
    pub sovereign_tier: u8,
    /// Amount deposited in current month (minor units, settlement currency)
    pub monthly_deposited: u64,
    /// Timestamp of current month start
    pub month_start: i64,
    /// Total number of deposits
    pub deposit_count: u32,
    /// Total number of withdrawals
    pub withdrawal_count: u32,
    /// Last deposit timestamp
    pub last_deposit_at: i64,
    /// Last withdrawal timestamp
    pub last_withdrawal_at: i64,
    /// User's deposit nonce (for PendingDeposit PDAs)
    pub deposit_nonce: u64,
    /// Account creation timestamp
    pub created_at: i64,
    /// PDA bump
    pub bump: u8,
}

impl UserPosition {
    pub const LEN: usize = 8   // discriminator
        + 32  // owner
        + 32  // protocol_config
        + 1   // bond_type
        + 8   // total_deposited
        + 8   // current_shares
        + 8   // cost_basis
        + 8   // realized_yield
        + 1   // sovereign_tier
        + 8   // monthly_deposited
        + 8   // month_start
        + 4   // deposit_count
        + 4   // withdrawal_count
        + 8   // last_deposit_at
        + 8   // last_withdrawal_at
        + 8   // deposit_nonce
        + 8   // created_at
        + 1;  // bump

    pub const SEED: &'static [u8] = b"user_position";

    /// Reset monthly counters if we're in a new month (30-day rolling window).
    pub fn maybe_reset_monthly(&mut self, now: i64) {
        const MONTH_SECONDS: i64 = 30 * 24 * 60 * 60;
        if now - self.month_start >= MONTH_SECONDS {
            self.monthly_deposited = 0;
            self.month_start = now;
        }
    }
}
