use anchor_lang::prelude::*;

use crate::errors::StablebondError;
use crate::events::NavUpdated;
use crate::state::{ProtocolConfig, YieldSource};

/// Reads the BondVault's NAV per share.
/// BondVault layout after 8-byte discriminator:
///   authority(32) + currency_mint(32) + share_mint(32) + currency_vault(32)
///   + bond_type(1) + coupon_rate_bps(2) + maturity_date(8)
///   + target_apy_bps(2) + total_deposits(8) + total_shares(8)
///   + nav_per_share(8) ...
const BOND_VAULT_NAV_OFFSET: usize = 8 + 32 + 32 + 32 + 32 + 1 + 2 + 8 + 2 + 8 + 8;
const BOND_VAULT_APY_OFFSET: usize = 8 + 32 + 32 + 32 + 32 + 1 + 2 + 8;

#[derive(Accounts)]
pub struct UpdateNav<'info> {
    /// Keeper that triggers the NAV update
    pub keeper: Signer<'info>,

    #[account(
        mut,
        seeds = [ProtocolConfig::SEED],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [
            YieldSource::SEED,
            protocol_config.key().as_ref(),
            yield_source.token_mint.as_ref(),
        ],
        bump = yield_source.bump,
    )]
    pub yield_source: Account<'info, YieldSource>,

    /// The BondVault account to read NAV from
    /// CHECK: Manually deserialized
    pub bond_vault_config: AccountInfo<'info>,
}

pub fn handle_update_nav(ctx: Context<UpdateNav>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    // Read NAV from bond vault
    let vault_data = ctx.accounts.bond_vault_config.try_borrow_data()?;
    require!(
        vault_data.len() >= BOND_VAULT_NAV_OFFSET + 8,
        StablebondError::InvalidAccountData
    );

    let new_nav = u64::from_le_bytes(
        vault_data[BOND_VAULT_NAV_OFFSET..BOND_VAULT_NAV_OFFSET + 8]
            .try_into()
            .unwrap(),
    );

    // Also read APY
    let apy_bps = if vault_data.len() >= BOND_VAULT_APY_OFFSET + 2 {
        u16::from_le_bytes(
            vault_data[BOND_VAULT_APY_OFFSET..BOND_VAULT_APY_OFFSET + 2]
                .try_into()
                .unwrap(),
        )
    } else {
        0
    };
    drop(vault_data);

    require!(new_nav > 0, StablebondError::InvalidAccountData);

    let old_nav = ctx.accounts.yield_source.nav_per_share;

    // Update yield source NAV
    let ys = &mut ctx.accounts.yield_source;
    ys.nav_per_share = new_nav;
    ys.current_apy_bps = apy_bps;
    ys.last_nav_update = now;

    // Update protocol config timestamp
    ctx.accounts.protocol_config.updated_at = now;

    emit!(NavUpdated {
        yield_source: ys.key(),
        bond_type: ys.bond_type.as_u8(),
        old_nav,
        new_nav,
        timestamp: now,
    });

    msg!("NAV updated for {}: {} → {}", ys.bond_type.as_str(), old_nav, new_nav);
    Ok(())
}
