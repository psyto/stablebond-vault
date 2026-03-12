use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use stablebond_types::{withdrawal_cooldown_seconds, BondType};

use crate::errors::StablebondError;
use crate::events::WithdrawalExecuted;
use crate::state::{ProtocolConfig, UserPosition, WithdrawalRequest, YieldSource};

// ─── Request Withdrawal (creates a pending withdrawal with cooldown) ─────────

#[derive(Accounts)]
#[instruction(shares: u64, bond_type: BondType)]
pub struct RequestWithdrawal<'info> {
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

    #[account(
        init,
        payer = user,
        space = WithdrawalRequest::LEN,
        seeds = [
            WithdrawalRequest::SEED,
            protocol_config.key().as_ref(),
            user.key().as_ref(),
            &(user_position.withdrawal_nonce + 1).to_le_bytes(),
        ],
        bump,
    )]
    pub withdrawal_request: Account<'info, WithdrawalRequest>,

    pub system_program: Program<'info, System>,
}

pub fn handle_request_withdrawal(
    ctx: Context<RequestWithdrawal>,
    shares: u64,
    bond_type: BondType,
) -> Result<()> {
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

    // Lock NAV at request time
    let ys = &ctx.accounts.yield_source;
    let amount_out = (shares as u128)
        .checked_mul(ys.nav_per_share as u128)
        .ok_or(StablebondError::MathOverflow)?
        .checked_div(1_000_000)
        .ok_or(StablebondError::MathOverflow)? as u64;

    let now = Clock::get()?.unix_timestamp;
    let cooldown = withdrawal_cooldown_seconds(bond_type);
    let nonce = user_pos.withdrawal_nonce + 1;

    // Create withdrawal request
    let request = &mut ctx.accounts.withdrawal_request;
    request.user = ctx.accounts.user.key();
    request.protocol_config = config.key();
    request.bond_type = bond_type;
    request.shares = shares;
    request.amount_out = amount_out;
    request.requested_at = now;
    request.claimable_at = now + cooldown;
    request.is_claimed = false;
    request.is_cancelled = false;
    request.nonce = nonce;
    request.bump = ctx.bumps.withdrawal_request;

    // Lock shares in user position (deduct immediately to prevent double-withdrawal)
    let user_pos_mut = &mut ctx.accounts.user_position;
    user_pos_mut.current_shares = user_pos_mut
        .current_shares
        .checked_sub(shares)
        .ok_or(StablebondError::MathOverflow)?;
    user_pos_mut.withdrawal_nonce = nonce;

    msg!(
        "Withdrawal requested: {} shares for {} {} (claimable at {})",
        shares,
        amount_out,
        bond_type.as_str(),
        request.claimable_at
    );
    Ok(())
}

// ─── Claim Withdrawal (after cooldown period) ────────────────────────────────

#[derive(Accounts)]
#[instruction(bond_type: BondType, nonce: u64)]
pub struct ClaimWithdrawal<'info> {
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

    #[account(
        mut,
        seeds = [
            WithdrawalRequest::SEED,
            protocol_config.key().as_ref(),
            user.key().as_ref(),
            &nonce.to_le_bytes(),
        ],
        bump = withdrawal_request.bump,
        constraint = withdrawal_request.user == user.key() @ StablebondError::Unauthorized,
        constraint = !withdrawal_request.is_claimed @ StablebondError::WithdrawalAlreadyClaimed,
        constraint = !withdrawal_request.is_cancelled @ StablebondError::WithdrawalCancelled,
    )]
    pub withdrawal_request: Account<'info, WithdrawalRequest>,

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

pub fn handle_claim_withdrawal(
    ctx: Context<ClaimWithdrawal>,
    bond_type: BondType,
    _nonce: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let request = &ctx.accounts.withdrawal_request;

    require!(
        now >= request.claimable_at,
        StablebondError::WithdrawalCooldownActive
    );

    let amount_out = request.amount_out;
    let shares = request.shares;

    // Transfer from yield source vault to user
    let config = &ctx.accounts.protocol_config;
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

    // Mark request as claimed
    let request_mut = &mut ctx.accounts.withdrawal_request;
    request_mut.is_claimed = true;

    // Update yield source
    let ys_mut = &mut ctx.accounts.yield_source;
    ys_mut.total_shares = ys_mut
        .total_shares
        .checked_sub(shares)
        .ok_or(StablebondError::MathOverflow)?;
    ys_mut.total_deposited = ys_mut.total_deposited.saturating_sub(amount_out);

    // Update user position
    let user_pos_mut = &mut ctx.accounts.user_position;
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
        "Withdrawal claimed: {} shares for {} settlement currency ({})",
        shares,
        amount_out,
        bond_type.as_str()
    );
    Ok(())
}

// ─── Cancel Withdrawal (return shares to user) ──────────────────────────────

#[derive(Accounts)]
#[instruction(bond_type: BondType, nonce: u64)]
pub struct CancelWithdrawal<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [ProtocolConfig::SEED],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

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

    #[account(
        mut,
        seeds = [
            WithdrawalRequest::SEED,
            protocol_config.key().as_ref(),
            user.key().as_ref(),
            &nonce.to_le_bytes(),
        ],
        bump = withdrawal_request.bump,
        constraint = withdrawal_request.user == user.key() @ StablebondError::Unauthorized,
        constraint = !withdrawal_request.is_claimed @ StablebondError::WithdrawalAlreadyClaimed,
        constraint = !withdrawal_request.is_cancelled @ StablebondError::WithdrawalCancelled,
    )]
    pub withdrawal_request: Account<'info, WithdrawalRequest>,
}

pub fn handle_cancel_withdrawal(
    ctx: Context<CancelWithdrawal>,
    _bond_type: BondType,
    _nonce: u64,
) -> Result<()> {
    let request = &ctx.accounts.withdrawal_request;
    let shares = request.shares;

    // Return shares to user position
    let user_pos_mut = &mut ctx.accounts.user_position;
    user_pos_mut.current_shares = user_pos_mut
        .current_shares
        .checked_add(shares)
        .ok_or(StablebondError::MathOverflow)?;

    // Mark as cancelled
    let request_mut = &mut ctx.accounts.withdrawal_request;
    request_mut.is_cancelled = true;

    msg!("Withdrawal request cancelled, {} shares returned", shares);
    Ok(())
}

// ─── Legacy: Immediate withdraw (kept for backward compatibility, admin-only emergency) ─

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
