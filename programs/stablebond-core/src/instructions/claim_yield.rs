use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use stablebond_types::BondType;

use crate::errors::StablebondError;
use crate::events::YieldClaimed;
use crate::state::{ProtocolConfig, UserPosition, YieldSource};

#[derive(Accounts)]
#[instruction(bond_type: BondType)]
pub struct ClaimYield<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [ProtocolConfig::SEED],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        seeds = [
            YieldSource::SEED,
            protocol_config.key().as_ref(),
            yield_source.token_mint.as_ref(),
        ],
        bump = yield_source.bump,
    )]
    pub yield_source: Account<'info, YieldSource>,

    #[account(
        mut,
        seeds = [
            UserPosition::SEED,
            protocol_config.key().as_ref(),
            user.key().as_ref(),
            &[bond_type.as_u8()],
        ],
        bump = user_position.bump,
    )]
    pub user_position: Account<'info, UserPosition>,

    /// Yield source deposit vault
    #[account(
        mut,
        constraint = deposit_vault.key() == yield_source.deposit_vault,
    )]
    pub deposit_vault: Account<'info, TokenAccount>,

    /// User's settlement currency token account
    #[account(
        mut,
        constraint = user_token.owner == user.key(),
    )]
    pub user_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_claim_yield(ctx: Context<ClaimYield>, bond_type: BondType) -> Result<()> {
    let config = &ctx.accounts.protocol_config;
    require!(config.is_active, StablebondError::ProtocolNotActive);

    let user_pos = &ctx.accounts.user_position;
    let ys = &ctx.accounts.yield_source;

    require!(
        user_pos.bond_type == bond_type,
        StablebondError::BondTypeNotFound
    );

    // Calculate current value of user's shares
    let current_value = (user_pos.current_shares as u128)
        .checked_mul(ys.nav_per_share as u128)
        .ok_or(StablebondError::MathOverflow)?
        .checked_div(1_000_000)
        .ok_or(StablebondError::MathOverflow)? as u64;

    // Yield = current_value - cost_basis - already_realized
    let cost_basis = user_pos.cost_basis;
    let total_gain = current_value.saturating_sub(cost_basis);
    let yield_amount = total_gain.saturating_sub(user_pos.realized_yield);

    require!(yield_amount > 0, StablebondError::NoYieldToClaim);

    // Deduct performance fee
    let performance_fee = (yield_amount as u128)
        .checked_mul(config.performance_fee_bps as u128)
        .ok_or(StablebondError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(StablebondError::MathOverflow)? as u64;
    let net_yield = yield_amount
        .checked_sub(performance_fee)
        .ok_or(StablebondError::MathOverflow)?;

    // Transfer net yield from deposit vault to user
    let config_seeds: &[&[u8]] = &[ProtocolConfig::SEED, &[config.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.deposit_vault.to_account_info(),
                to: ctx.accounts.user_token.to_account_info(),
                authority: ctx.accounts.protocol_config.to_account_info(),
            },
            &[config_seeds],
        ),
        net_yield,
    )?;

    let now = Clock::get()?.unix_timestamp;

    // Update user position
    let user_pos_mut = &mut ctx.accounts.user_position;
    user_pos_mut.realized_yield = user_pos_mut
        .realized_yield
        .checked_add(yield_amount)
        .ok_or(StablebondError::MathOverflow)?;

    // Update protocol totals
    let config_mut = &mut ctx.accounts.protocol_config;
    config_mut.total_yield_earned = config_mut
        .total_yield_earned
        .checked_add(yield_amount)
        .ok_or(StablebondError::MathOverflow)?;
    config_mut.updated_at = now;

    emit!(YieldClaimed {
        user: ctx.accounts.user.key(),
        bond_type: bond_type.as_u8(),
        yield_amount,
        performance_fee,
        net_yield,
        timestamp: now,
    });

    msg!(
        "Yield claimed for {}: {} total, {} fee, {} net to user",
        bond_type.as_str(),
        yield_amount,
        performance_fee,
        net_yield
    );
    Ok(())
}
