use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use stablebond_types::{ConversionDirection, DepositStatus};

use crate::errors::StablebondError;
use crate::events::{ConversionExecuted, ConversionRecordCreated};
use crate::state::{ConversionRecord, PendingDeposit, ProtocolConfig, UserPosition, YieldSource};

/// Oracle PriceFeed — simplified Meridian-style layout.
/// After 8-byte discriminator:
///   - authority: Pubkey (32)
///   - current_price: u64 (8)  — source per settlement, scaled 1e6
///   - last_update_time: i64 (8)
const ORACLE_PRICE_OFFSET: usize = 8 + 32;
const ORACLE_UPDATE_OFFSET: usize = ORACLE_PRICE_OFFSET + 8;
const MAX_ORACLE_STALENESS: i64 = 300; // 5 minutes

#[derive(Accounts)]
pub struct ExecuteConversion<'info> {
    /// Keeper that triggers the conversion
    #[account(mut)]
    pub keeper: Signer<'info>,

    #[account(
        mut,
        seeds = [ProtocolConfig::SEED],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        mut,
        constraint = pending_deposit.protocol_config == protocol_config.key() @ StablebondError::InvalidPendingDeposit,
        constraint = pending_deposit.status == DepositStatus::Pending @ StablebondError::InvalidPendingDeposit,
    )]
    pub pending_deposit: Box<Account<'info, PendingDeposit>>,

    #[account(
        mut,
        seeds = [
            UserPosition::SEED,
            protocol_config.key().as_ref(),
            pending_deposit.user.as_ref(),
            &[pending_deposit.bond_type.as_u8()],
        ],
        bump = user_position.bump,
    )]
    pub user_position: Box<Account<'info, UserPosition>>,

    /// Protocol USDC vault (keeper pre-loads with settlement currency)
    #[account(
        mut,
        constraint = usdc_vault.key() == protocol_config.usdc_vault @ StablebondError::InvalidAccountData,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,

    /// Oracle PriceFeed PDA for the bond's currency pair
    /// CHECK: Manually deserialized
    pub oracle: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [
            YieldSource::SEED,
            protocol_config.key().as_ref(),
            yield_source.token_mint.as_ref(),
        ],
        bump = yield_source.bump,
    )]
    pub yield_source: Box<Account<'info, YieldSource>>,

    /// Yield source deposit vault (where settlement currency goes after conversion)
    #[account(
        mut,
        constraint = yield_deposit_vault.key() == yield_source.deposit_vault,
    )]
    pub yield_deposit_vault: Account<'info, TokenAccount>,

    /// ConversionRecord to create
    #[account(
        init,
        payer = keeper,
        space = ConversionRecord::LEN,
        seeds = [
            ConversionRecord::SEED,
            protocol_config.key().as_ref(),
            pending_deposit.user.as_ref(),
            &pending_deposit.nonce.to_le_bytes(),
        ],
        bump,
    )]
    pub conversion_record: Box<Account<'info, ConversionRecord>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_execute_conversion(ctx: Context<ExecuteConversion>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let pending = &ctx.accounts.pending_deposit;

    // 1. Check not expired
    require!(now <= pending.expires_at, StablebondError::DepositExpired);

    // 2. Validate oracle matches the yield source's oracle_feed
    let ys = &ctx.accounts.yield_source;
    require!(
        ctx.accounts.oracle.key() == ys.oracle_feed,
        StablebondError::InvalidOraclePrice
    );

    // 3. Read oracle price
    let oracle_data = ctx.accounts.oracle.try_borrow_data()?;
    require!(
        oracle_data.len() >= ORACLE_UPDATE_OFFSET + 8,
        StablebondError::InvalidOraclePrice
    );

    let exchange_rate = u64::from_le_bytes(
        oracle_data[ORACLE_PRICE_OFFSET..ORACLE_PRICE_OFFSET + 8]
            .try_into()
            .unwrap(),
    );
    let last_update = i64::from_le_bytes(
        oracle_data[ORACLE_UPDATE_OFFSET..ORACLE_UPDATE_OFFSET + 8]
            .try_into()
            .unwrap(),
    );
    drop(oracle_data);

    require!(exchange_rate > 0, StablebondError::InvalidOraclePrice);
    require!(
        now - last_update <= MAX_ORACLE_STALENESS,
        StablebondError::StalePriceOracle
    );

    // 4. Calculate settlement output
    // exchange_rate = source currency per settlement unit, scaled 1e6
    // settlement_out = source_amount * 1_000_000 / exchange_rate
    let source_amount = pending.source_amount;
    let gross_settlement = (source_amount as u128)
        .checked_mul(1_000_000)
        .ok_or(StablebondError::MathOverflow)?
        .checked_div(exchange_rate as u128)
        .ok_or(StablebondError::MathOverflow)? as u64;

    // 5. Deduct conversion fee
    let config = &ctx.accounts.protocol_config;
    let fee = (gross_settlement as u128)
        .checked_mul(config.conversion_fee_bps as u128)
        .ok_or(StablebondError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(StablebondError::MathOverflow)? as u64;
    let settlement_received = gross_settlement
        .checked_sub(fee)
        .ok_or(StablebondError::MathOverflow)?;

    // 6. Slippage check
    require!(
        settlement_received >= pending.min_output,
        StablebondError::SlippageExceeded
    );

    // 7. Transfer settlement currency from protocol vault to yield source
    let config_seeds: &[&[u8]] = &[ProtocolConfig::SEED, &[config.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.usdc_vault.to_account_info(),
                to: ctx.accounts.yield_deposit_vault.to_account_info(),
                authority: ctx.accounts.protocol_config.to_account_info(),
            },
            &[config_seeds],
        ),
        settlement_received,
    )?;

    // 8. Calculate shares from yield source NAV
    let shares = (settlement_received as u128)
        .checked_mul(1_000_000)
        .ok_or(StablebondError::MathOverflow)?
        .checked_div(ys.nav_per_share as u128)
        .ok_or(StablebondError::MathOverflow)? as u64;

    // 9. Update PendingDeposit
    let pending_mut = &mut ctx.accounts.pending_deposit;
    pending_mut.status = DepositStatus::Converted;
    pending_mut.conversion_rate = exchange_rate;
    pending_mut.settlement_received = settlement_received;
    pending_mut.fee_paid = fee;

    // 10. Update UserPosition
    let user_pos = &mut ctx.accounts.user_position;
    user_pos.current_shares = user_pos
        .current_shares
        .checked_add(shares)
        .ok_or(StablebondError::MathOverflow)?;
    user_pos.cost_basis = user_pos
        .cost_basis
        .checked_add(settlement_received)
        .ok_or(StablebondError::MathOverflow)?;

    // 11. Update YieldSource
    let ys_mut = &mut ctx.accounts.yield_source;
    ys_mut.total_deposited = ys_mut
        .total_deposited
        .checked_add(settlement_received)
        .ok_or(StablebondError::MathOverflow)?;
    ys_mut.total_shares = ys_mut
        .total_shares
        .checked_add(shares)
        .ok_or(StablebondError::MathOverflow)?;

    // 12. Update ProtocolConfig
    let config_mut = &mut ctx.accounts.protocol_config;
    config_mut.total_deposits = config_mut
        .total_deposits
        .checked_add(settlement_received)
        .ok_or(StablebondError::MathOverflow)?;
    config_mut.pending_conversion = config_mut
        .pending_conversion
        .saturating_sub(source_amount);
    config_mut.updated_at = now;

    // 13. Create ConversionRecord
    let record = &mut ctx.accounts.conversion_record;
    record.user = pending_mut.user;
    record.protocol_config = config_mut.key();
    record.bond_type = pending_mut.bond_type;
    record.source_amount = source_amount;
    record.settlement_amount = settlement_received;
    record.exchange_rate = exchange_rate;
    record.fee_amount = fee;
    record.direction = ConversionDirection::NativeToSettlement;
    record.timestamp = now;
    record.nonce = pending_mut.nonce;
    record.bump = ctx.bumps.conversion_record;

    emit!(ConversionExecuted {
        user: pending_mut.user,
        bond_type: pending_mut.bond_type.as_u8(),
        source_amount,
        settlement_received,
        exchange_rate,
        fee_paid: fee,
        shares_issued: shares,
        nonce: pending_mut.nonce,
        timestamp: now,
    });

    emit!(ConversionRecordCreated {
        user: pending_mut.user,
        bond_type: pending_mut.bond_type.as_u8(),
        source_amount,
        settlement_amount: settlement_received,
        exchange_rate,
        direction: ConversionDirection::NativeToSettlement,
        nonce: pending_mut.nonce,
        timestamp: now,
    });

    msg!(
        "Conversion executed: {} source → {} settlement at rate {}, fee {}",
        source_amount,
        settlement_received,
        exchange_rate,
        fee
    );
    Ok(())
}
