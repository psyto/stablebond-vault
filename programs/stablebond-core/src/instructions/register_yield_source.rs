use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use stablebond_types::{BondType, YieldSourceType};

use crate::errors::StablebondError;
use crate::events::YieldSourceRegistered;
use crate::state::{ProtocolConfig, YieldSource};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RegisterYieldSourceParams {
    pub name: [u8; 32],
    pub source_type: YieldSourceType,
    pub bond_type: BondType,
    pub deposit_vault: Pubkey,
    pub yield_token_vault: Pubkey,
    pub currency_mint: Pubkey,
    pub oracle_feed: Pubkey,
    pub coupon_rate_bps: u16,
    pub maturity_date: i64,
    pub haircut_bps: u16,
    pub allocation_weight_bps: u16,
    pub min_deposit: u64,
    pub max_allocation: u64,
}

#[derive(Accounts)]
#[instruction(params: RegisterYieldSourceParams)]
pub struct RegisterYieldSource<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [ProtocolConfig::SEED],
        bump = protocol_config.bump,
        has_one = authority @ StablebondError::Unauthorized,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = YieldSource::LEN,
        seeds = [YieldSource::SEED, protocol_config.key().as_ref(), token_mint.key().as_ref()],
        bump,
    )]
    pub yield_source: Account<'info, YieldSource>,

    pub system_program: Program<'info, System>,
}

pub fn handle_register_yield_source(ctx: Context<RegisterYieldSource>, params: RegisterYieldSourceParams) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let ys = &mut ctx.accounts.yield_source;

    ys.protocol_config = ctx.accounts.protocol_config.key();
    ys.name = params.name;
    ys.source_type = params.source_type;
    ys.token_mint = ctx.accounts.token_mint.key();
    ys.deposit_vault = params.deposit_vault;
    ys.yield_token_vault = params.yield_token_vault;
    ys.current_apy_bps = 0;
    ys.total_deposited = 0;
    ys.total_shares = 0;
    ys.allocation_weight_bps = params.allocation_weight_bps;
    ys.min_deposit = params.min_deposit;
    ys.max_allocation = params.max_allocation;
    ys.is_active = true;
    ys.last_nav_update = now;
    ys.nav_per_share = 1_000_000; // 1.000000
    // Bond-specific fields
    ys.bond_type = params.bond_type;
    ys.currency_mint = params.currency_mint;
    ys.oracle_feed = params.oracle_feed;
    ys.coupon_rate_bps = params.coupon_rate_bps;
    ys.maturity_date = params.maturity_date;
    ys.haircut_bps = params.haircut_bps;
    ys.bump = ctx.bumps.yield_source;

    emit!(YieldSourceRegistered {
        yield_source: ys.key(),
        name: params.name,
        source_type: params.source_type as u8,
        bond_type: params.bond_type.as_u8(),
        token_mint: ys.token_mint,
        timestamp: now,
    });

    msg!("Yield source registered for bond type: {}", params.bond_type.as_str());
    Ok(())
}
