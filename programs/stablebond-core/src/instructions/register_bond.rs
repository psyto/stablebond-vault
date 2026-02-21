use anchor_lang::prelude::*;
use stablebond_types::BondConfig;

use crate::errors::StablebondError;
use crate::events::BondRegistered;
use crate::state::{BondRegistry, ProtocolConfig};

#[derive(Accounts)]
pub struct RegisterBond<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ProtocolConfig::SEED],
        bump = protocol_config.bump,
        has_one = authority @ StablebondError::Unauthorized,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [BondRegistry::SEED, protocol_config.key().as_ref()],
        bump = bond_registry.bump,
        constraint = bond_registry.protocol_config == protocol_config.key(),
    )]
    pub bond_registry: Account<'info, BondRegistry>,
}

pub fn handle_register_bond(ctx: Context<RegisterBond>, config: BondConfig) -> Result<()> {
    let registry = &mut ctx.accounts.bond_registry;

    require!(
        registry.bonds.len() < BondRegistry::MAX_BONDS,
        StablebondError::MaxBondsReached
    );

    // Check for duplicate bond type
    for existing in &registry.bonds {
        require!(
            existing.bond_type != config.bond_type,
            StablebondError::BondTypeAlreadyRegistered
        );
    }

    let now = Clock::get()?.unix_timestamp;

    emit!(BondRegistered {
        bond_type: config.bond_type.as_u8(),
        currency_mint: config.currency_mint,
        default_apy_bps: config.default_apy_bps,
        min_tier: config.min_tier,
        timestamp: now,
    });

    registry.bonds.push(config);
    ctx.accounts.protocol_config.num_supported_bonds += 1;
    ctx.accounts.protocol_config.updated_at = now;

    msg!("Bond type registered");
    Ok(())
}
