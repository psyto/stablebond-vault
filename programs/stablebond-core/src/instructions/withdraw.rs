use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use stablebond_types::BondType;

use crate::errors::StablebondError;
use crate::events::WithdrawalExecuted;
use crate::state::{ProtocolConfig, UserPosition, YieldSource};

#[derive(Accounts)]
#[instruction(shares: u64, bond_type: BondType)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

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

    /// Yield source deposit vault (source of funds for withdrawals)
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

pub fn handle_withdraw(ctx: Context<Withdraw>, shares: u64, bond_type: BondType) -> Result<()> {
    let config = &ctx.accounts.protocol_config;
    require!(config.is_active, StablebondError::ProtocolNotActive);
    require!(shares > 0, StablebondError::ZeroWithdrawal);

    let user_pos = &ctx.accounts.user_position;
    require!(
        user_pos.current_shares >= shares,
        StablebondError::InsufficientShares
    );
    require!(
        user_pos.bond_type == bond_type,
        StablebondError::BondTypeNotFound
    );

    // Calculate settlement currency out based on NAV
    let ys = &ctx.accounts.yield_source;
    let amount_out = (shares as u128)
        .checked_mul(ys.nav_per_share as u128)
        .ok_or(StablebondError::MathOverflow)?
        .checked_div(1_000_000)
        .ok_or(StablebondError::MathOverflow)? as u64;

    // Transfer from yield source vault to user
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
        amount_out,
    )?;

    let now = Clock::get()?.unix_timestamp;

    // Update yield source
    let ys_mut = &mut ctx.accounts.yield_source;
    ys_mut.total_shares = ys_mut
        .total_shares
        .checked_sub(shares)
        .ok_or(StablebondError::MathOverflow)?;
    ys_mut.total_deposited = ys_mut.total_deposited.saturating_sub(amount_out);

    // Update user position
    let user_pos_mut = &mut ctx.accounts.user_position;
    user_pos_mut.current_shares = user_pos_mut
        .current_shares
        .checked_sub(shares)
        .ok_or(StablebondError::MathOverflow)?;
    user_pos_mut.withdrawal_count = user_pos_mut
        .withdrawal_count
        .checked_add(1)
        .ok_or(StablebondError::MathOverflow)?;
    user_pos_mut.last_withdrawal_at = now;

    // Update protocol config
    let config_mut = &mut ctx.accounts.protocol_config;
    config_mut.total_deposits = config_mut.total_deposits.saturating_sub(amount_out);
    config_mut.updated_at = now;

    emit!(WithdrawalExecuted {
        user: ctx.accounts.user.key(),
        bond_type: bond_type.as_u8(),
        shares_burned: shares,
        amount_received: amount_out,
        timestamp: now,
    });

    msg!(
        "Withdrew {} shares for {} settlement currency ({})",
        shares,
        amount_out,
        bond_type.as_str()
    );
    Ok(())
}
