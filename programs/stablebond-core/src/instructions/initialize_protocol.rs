use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::StablebondError;
use crate::events::ProtocolInitialized;
use crate::state::{BondRegistry, ProtocolConfig};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeProtocolParams {
    pub treasury: Pubkey,
    pub kyc_registry: Pubkey,
    pub sovereign_program: Pubkey,
    pub conversion_fee_bps: u16,
    pub management_fee_bps: u16,
    pub performance_fee_bps: u16,
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = ProtocolConfig::LEN,
        seeds = [ProtocolConfig::SEED],
        bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        init,
        payer = authority,
        space = BondRegistry::LEN,
        seeds = [BondRegistry::SEED, protocol_config.key().as_ref()],
        bump,
    )]
    pub bond_registry: Account<'info, BondRegistry>,

    /// USDC mint (SPL Token) — primary settlement currency
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        seeds = [ProtocolConfig::USDC_VAULT_SEED],
        bump,
        token::mint = usdc_mint,
        token::authority = protocol_config,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_initialize_protocol(ctx: Context<InitializeProtocol>, params: InitializeProtocolParams) -> Result<()> {
    require!(params.conversion_fee_bps <= 1000, StablebondError::InvalidFee);
    require!(params.management_fee_bps <= 500, StablebondError::InvalidFee);
    require!(params.performance_fee_bps <= 5000, StablebondError::InvalidFee);

    let now = Clock::get()?.unix_timestamp;
    let config = &mut ctx.accounts.protocol_config;

    config.authority = ctx.accounts.authority.key();
    config.treasury = params.treasury;
    config.usdc_mint = ctx.accounts.usdc_mint.key();
    config.usdc_vault = ctx.accounts.usdc_vault.key();
    config.kyc_registry = params.kyc_registry;
    config.sovereign_program = params.sovereign_program;
    config.bond_registry = ctx.accounts.bond_registry.key();
    config.conversion_fee_bps = params.conversion_fee_bps;
    config.management_fee_bps = params.management_fee_bps;
    config.performance_fee_bps = params.performance_fee_bps;
    config.total_deposits = 0;
    config.total_yield_earned = 0;
    config.pending_conversion = 0;
    config.deposit_nonce = 0;
    config.num_supported_bonds = 0;
    config.is_active = true;
    config.created_at = now;
    config.updated_at = now;
    config.bump = ctx.bumps.protocol_config;
    config.usdc_vault_bump = ctx.bumps.usdc_vault;

    // Initialize bond registry
    let registry = &mut ctx.accounts.bond_registry;
    registry.protocol_config = config.key();
    registry.bonds = Vec::new();
    registry.bump = ctx.bumps.bond_registry;

    emit!(ProtocolInitialized {
        authority: config.authority,
        usdc_mint: config.usdc_mint,
        timestamp: now,
    });

    msg!("Stablebond protocol initialized");
    Ok(())
}
