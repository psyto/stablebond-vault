use anchor_lang::prelude::*;

use crate::errors::StablebondError;
use crate::events::{ProtocolPaused, ProtocolResumed};
use crate::state::{ProtocolConfig, YieldSource};

// ─── Update Protocol Config ────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateProtocolConfigParams {
    pub treasury: Option<Pubkey>,
    pub conversion_fee_bps: Option<u16>,
    pub management_fee_bps: Option<u16>,
    pub performance_fee_bps: Option<u16>,
}

#[derive(Accounts)]
pub struct UpdateProtocolConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ProtocolConfig::SEED],
        bump = protocol_config.bump,
        has_one = authority @ StablebondError::Unauthorized,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

pub fn handle_update_protocol_config(
    ctx: Context<UpdateProtocolConfig>,
    params: UpdateProtocolConfigParams,
) -> Result<()> {
    let config = &mut ctx.accounts.protocol_config;
    let now = Clock::get()?.unix_timestamp;

    if let Some(treasury) = params.treasury {
        config.treasury = treasury;
    }
    if let Some(fee) = params.conversion_fee_bps {
        require!(fee <= 1000, StablebondError::InvalidFee);
        config.conversion_fee_bps = fee;
    }
    if let Some(fee) = params.management_fee_bps {
        require!(fee <= 500, StablebondError::InvalidFee);
        config.management_fee_bps = fee;
    }
    if let Some(fee) = params.performance_fee_bps {
        require!(fee <= 5000, StablebondError::InvalidFee);
        config.performance_fee_bps = fee;
    }

    config.updated_at = now;
    msg!("Protocol config updated");
    Ok(())
}

// ─── Update Yield Source ────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateYieldSourceParams {
    pub allocation_weight_bps: Option<u16>,
    pub min_deposit: Option<u64>,
    pub max_allocation: Option<u64>,
    pub is_active: Option<bool>,
}

#[derive(Accounts)]
pub struct UpdateYieldSource<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [ProtocolConfig::SEED],
        bump = protocol_config.bump,
        has_one = authority @ StablebondError::Unauthorized,
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
}

pub fn handle_update_yield_source(
    ctx: Context<UpdateYieldSource>,
    params: UpdateYieldSourceParams,
) -> Result<()> {
    let ys = &mut ctx.accounts.yield_source;

    if let Some(weight) = params.allocation_weight_bps {
        ys.allocation_weight_bps = weight;
    }
    if let Some(min) = params.min_deposit {
        ys.min_deposit = min;
    }
    if let Some(max) = params.max_allocation {
        ys.max_allocation = max;
    }
    if let Some(active) = params.is_active {
        ys.is_active = active;
    }

    msg!("Yield source updated");
    Ok(())
}

// ─── Pause / Resume Protocol ────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct PauseProtocol<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ProtocolConfig::SEED],
        bump = protocol_config.bump,
        has_one = authority @ StablebondError::Unauthorized,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

pub fn handle_pause_protocol(ctx: Context<PauseProtocol>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.protocol_config.is_active = false;
    ctx.accounts.protocol_config.updated_at = now;

    emit!(ProtocolPaused {
        authority: ctx.accounts.authority.key(),
        timestamp: now,
    });

    msg!("Protocol paused");
    Ok(())
}

pub fn handle_resume_protocol(ctx: Context<PauseProtocol>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.protocol_config.is_active = true;
    ctx.accounts.protocol_config.updated_at = now;

    emit!(ProtocolResumed {
        authority: ctx.accounts.authority.key(),
        timestamp: now,
    });

    msg!("Protocol resumed");
    Ok(())
}
