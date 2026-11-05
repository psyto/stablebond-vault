use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use stablebond_types::{allowed_bond_types, monthly_limit, allowed_yield_sources, BondType, DepositStatus};

use crate::errors::StablebondError;
use crate::events::{DepositInitiated, DirectDeposit};
use crate::state::{BondRegistry, PendingDeposit, ProtocolConfig, UserPosition, YieldSource};

/// Accredit transfer-hook WhitelistEntry PDA prefix: ["whitelist", registry, wallet]
const WHITELIST_SEED: &[u8] = b"whitelist";
/// Sovereign SovereignIdentity PDA prefix: ["identity", owner]
const SOVEREIGN_IDENTITY_SEED: &[u8] = b"identity";

// ─── Generalized Deposit (cross-currency, creates PendingDeposit) ───────────

#[derive(Accounts)]
#[instruction(amount: u64, bond_type: BondType)]
pub struct DepositCrossCurrency<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [ProtocolConfig::SEED],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    /// Registered bonds; source_mint must be the active currency_mint of bond_type
    #[account(
        seeds = [BondRegistry::SEED, protocol_config.key().as_ref()],
        bump = bond_registry.bump,
        constraint = bond_registry.protocol_config == protocol_config.key() @ StablebondError::InvalidAccountData,
    )]
    pub bond_registry: Box<Account<'info, BondRegistry>>,

    /// Source currency mint (e.g. JPY, MXN, BRL stablecoin)
    /// CHECK: Checked against bond_registry in the handler; both token accounts below use this mint.
    pub source_mint: AccountInfo<'info>,

    /// User's source currency token account
    #[account(
        mut,
        token::mint = source_mint,
        token::authority = user,
    )]
    pub user_source_ata: Box<Account<'info, TokenAccount>>,

    /// Protocol vault for the source currency: the protocol config PDA's
    /// associated token account for source_mint (must already exist).
    #[account(
        mut,
        associated_token::mint = source_mint,
        associated_token::authority = protocol_config,
    )]
    pub source_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = user,
        space = UserPosition::LEN,
        seeds = [
            UserPosition::SEED,
            protocol_config.key().as_ref(),
            user.key().as_ref(),
            &[bond_type.as_u8()],
        ],
        bump,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        init,
        payer = user,
        space = PendingDeposit::LEN,
        seeds = [
            PendingDeposit::SEED,
            protocol_config.key().as_ref(),
            user.key().as_ref(),
            &(protocol_config.deposit_nonce + 1).to_le_bytes(),
        ],
        bump,
    )]
    pub pending_deposit: Account<'info, PendingDeposit>,

    /// Accredit WhitelistEntry PDA for this user.
    /// CHECK: Owned by the configured KYC program at ["whitelist", kyc_whitelist_registry, user]; fields read in validate_kyc.
    #[account(
        owner = protocol_config.kyc_registry @ StablebondError::KycRequired,
        seeds = [
            WHITELIST_SEED,
            protocol_config.kyc_whitelist_registry.as_ref(),
            user.key().as_ref()
        ],
        bump,
        seeds::program = protocol_config.kyc_registry,
    )]
    pub whitelist_entry: AccountInfo<'info>,

    /// Sovereign Identity PDA for this user.
    /// CHECK: Owned by the configured Sovereign program at ["identity", user]; tier read in read_sovereign_tier.
    #[account(
        owner = protocol_config.sovereign_program @ StablebondError::SovereignIdentityNotFound,
        seeds = [SOVEREIGN_IDENTITY_SEED, user.key().as_ref()],
        bump,
        seeds::program = protocol_config.sovereign_program,
    )]
    pub sovereign_identity: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}

// ─── Direct Deposit (settlement currency matches bond's currency) ───────────

#[derive(Accounts)]
#[instruction(amount: u64, bond_type: BondType)]
pub struct DepositDirect<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [ProtocolConfig::SEED],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

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

    #[account(
        mut,
        constraint = user_token.owner == user.key(),
    )]
    pub user_token: Account<'info, TokenAccount>,

    /// Yield source deposit vault
    #[account(
        mut,
        constraint = deposit_vault.key() == yield_source.deposit_vault,
    )]
    pub deposit_vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        space = UserPosition::LEN,
        seeds = [
            UserPosition::SEED,
            protocol_config.key().as_ref(),
            user.key().as_ref(),
            &[bond_type.as_u8()],
        ],
        bump,
    )]
    pub user_position: Box<Account<'info, UserPosition>>,

    /// Accredit WhitelistEntry PDA
    /// CHECK: Owned by the configured KYC program at ["whitelist", kyc_whitelist_registry, user]; fields read in validate_kyc.
    #[account(
        owner = protocol_config.kyc_registry @ StablebondError::KycRequired,
        seeds = [
            WHITELIST_SEED,
            protocol_config.kyc_whitelist_registry.as_ref(),
            user.key().as_ref()
        ],
        bump,
        seeds::program = protocol_config.kyc_registry,
    )]
    pub whitelist_entry: AccountInfo<'info>,

    /// Sovereign Identity PDA
    /// CHECK: Owned by the configured Sovereign program at ["identity", user]; tier read in read_sovereign_tier.
    #[account(
        owner = protocol_config.sovereign_program @ StablebondError::SovereignIdentityNotFound,
        seeds = [SOVEREIGN_IDENTITY_SEED, user.key().as_ref()],
        bump,
        seeds::program = protocol_config.sovereign_program,
    )]
    pub sovereign_identity: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ─── Shared KYC/Tier validation (same pattern as Exodus) ────────────────────

// Accredit transfer-hook WhitelistEntry layout (after the 8-byte discriminator):
// wallet(32) registry(32) kyc_level(1) jurisdiction(1) kyc_hash(32) is_active(1)
// daily_limit(8) daily_volume(8) volume_reset_time(8) verified_at(8)
// expiry_timestamp(8) last_activity(8) created_at(8) bump(1)
const WL_OFFSET_WALLET: usize = 8;
const WL_OFFSET_REGISTRY: usize = 8 + 32; // 40
const WL_OFFSET_JURISDICTION: usize = 8 + 32 + 32 + 1; // 73
const WL_OFFSET_IS_ACTIVE: usize = 8 + 32 + 32 + 1 + 1 + 32; // 106
const WL_OFFSET_EXPIRY: usize = WL_OFFSET_IS_ACTIVE + 1 + 8 + 8 + 8 + 8; // 139
const WL_MIN_SIZE: usize = WL_OFFSET_EXPIRY + 8 + 8 + 8 + 1; // 164
/// Accredit Jurisdiction::Usa
const JURISDICTION_USA: u8 = 4;

// Sovereign SovereignIdentity layout: owner(32) created_at(8) 5 authorities(32 each)
// 6 scores(u16 each) tier(u8) ...
const SOV_OFFSET_OWNER: usize = 8;
const SOV_OFFSET_TIER: usize = 8 + 32 + 8 + 32 * 5 + 2 * 6; // 220

/// Validate KYC via an Accredit WhitelistEntry (owner program and PDA are
/// pinned by the account constraints; the entry must come from `registry`).
fn validate_kyc(whitelist_entry: &AccountInfo, user: &Pubkey, registry: &Pubkey) -> Result<()> {
    let data = whitelist_entry.try_borrow_data()?;
    require!(data.len() >= WL_MIN_SIZE, StablebondError::KycRequired);

    let wallet = Pubkey::try_from(&data[WL_OFFSET_WALLET..WL_OFFSET_WALLET + 32])
        .map_err(|_| StablebondError::InvalidAccountData)?;
    require!(wallet == *user, StablebondError::KycRequired);

    let entry_registry = Pubkey::try_from(&data[WL_OFFSET_REGISTRY..WL_OFFSET_REGISTRY + 32])
        .map_err(|_| StablebondError::InvalidAccountData)?;
    require!(entry_registry == *registry, StablebondError::KycRequired);

    require!(data[WL_OFFSET_IS_ACTIVE] == 1, StablebondError::KycRequired);

    require!(
        data[WL_OFFSET_JURISDICTION] != JURISDICTION_USA,
        StablebondError::JurisdictionRestricted
    );

    // Accredit semantics: expiry 0 = no expiry
    let expires_at = i64::from_le_bytes(
        data[WL_OFFSET_EXPIRY..WL_OFFSET_EXPIRY + 8].try_into().unwrap(),
    );
    if expires_at != 0 {
        require!(expires_at > Clock::get()?.unix_timestamp, StablebondError::KycExpired);
    }

    Ok(())
}

/// Read the tier from a Sovereign SovereignIdentity PDA.
fn read_sovereign_tier(sovereign_identity: &AccountInfo, user: &Pubkey) -> Result<u8> {
    let data = sovereign_identity.try_borrow_data()?;
    require!(data.len() > SOV_OFFSET_TIER, StablebondError::SovereignIdentityNotFound);

    let owner = Pubkey::try_from(&data[SOV_OFFSET_OWNER..SOV_OFFSET_OWNER + 32])
        .map_err(|_| StablebondError::InvalidAccountData)?;
    require!(owner == *user, StablebondError::SovereignIdentityNotFound);

    Ok(data[SOV_OFFSET_TIER])
}

// ─── Cross-currency deposit handler ─────────────────────────────────────────

pub fn handle_deposit_cross_currency(
    ctx: Context<DepositCrossCurrency>,
    amount: u64,
    bond_type: BondType,
    min_output: u64,
) -> Result<()> {
    let config = &ctx.accounts.protocol_config;
    require!(config.is_active, StablebondError::ProtocolNotActive);
    require!(amount > 0, StablebondError::ZeroDeposit);

    // 0. source_mint must be the registered, active currency of this bond type
    let source_mint = ctx.accounts.source_mint.key();
    require!(
        ctx.accounts.bond_registry.bonds.iter().any(|b| {
            b.bond_type == bond_type && b.is_active && b.currency_mint == source_mint
        }),
        StablebondError::BondTypeNotFound
    );

    // 1. Validate KYC via Accredit WhitelistEntry
    validate_kyc(
        &ctx.accounts.whitelist_entry,
        &ctx.accounts.user.key(),
        &config.kyc_whitelist_registry,
    )?;

    // 2. Read Sovereign tier and validate bond type access
    let tier = read_sovereign_tier(&ctx.accounts.sovereign_identity, &ctx.accounts.user.key())?;
    require!(tier > 0, StablebondError::TierTooLow);

    let allowed = allowed_bond_types(tier);
    require!(
        allowed.contains(&bond_type),
        StablebondError::BondTypeNotAllowed
    );

    let now = Clock::get()?.unix_timestamp;
    let user_pos = &mut ctx.accounts.user_position;

    // Initialize if new
    if user_pos.created_at == 0 {
        user_pos.owner = ctx.accounts.user.key();
        user_pos.protocol_config = config.key();
        user_pos.bond_type = bond_type;
        user_pos.created_at = now;
        user_pos.month_start = now;
        user_pos.bump = ctx.bumps.user_position;
    }

    user_pos.maybe_reset_monthly(now);
    user_pos.sovereign_tier = tier;

    // 3. Check monthly limit for this bond type
    let limit = monthly_limit(tier, bond_type);
    let new_monthly = user_pos
        .monthly_deposited
        .checked_add(amount)
        .ok_or(StablebondError::MathOverflow)?;
    require!(new_monthly <= limit, StablebondError::MonthlyLimitExceeded);

    // 4. Transfer source currency from user to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_source_ata.to_account_info(),
                to: ctx.accounts.source_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // 5. Init PendingDeposit
    let nonce = config.deposit_nonce + 1;
    let pending = &mut ctx.accounts.pending_deposit;
    pending.user = ctx.accounts.user.key();
    pending.protocol_config = config.key();
    pending.bond_type = bond_type;
    pending.source_amount = amount;
    pending.min_output = min_output;
    pending.deposited_at = now;
    pending.expires_at = now + PendingDeposit::EXPIRY_SECONDS;
    pending.status = DepositStatus::Pending;
    pending.conversion_rate = 0;
    pending.settlement_received = 0;
    pending.fee_paid = 0;
    pending.nonce = nonce;
    pending.bump = ctx.bumps.pending_deposit;

    // 6. Update UserPosition monthly tracking
    user_pos.monthly_deposited = new_monthly;
    user_pos.total_deposited = user_pos
        .total_deposited
        .checked_add(amount)
        .ok_or(StablebondError::MathOverflow)?;
    user_pos.deposit_count = user_pos
        .deposit_count
        .checked_add(1)
        .ok_or(StablebondError::MathOverflow)?;
    user_pos.last_deposit_at = now;
    user_pos.deposit_nonce = nonce;

    // 7. Update protocol config
    let config_mut = &mut ctx.accounts.protocol_config;
    config_mut.deposit_nonce = nonce;
    config_mut.pending_conversion = config_mut
        .pending_conversion
        .checked_add(amount)
        .ok_or(StablebondError::MathOverflow)?;
    config_mut.updated_at = now;

    emit!(DepositInitiated {
        user: ctx.accounts.user.key(),
        pending_deposit: pending.key(),
        bond_type: bond_type.as_u8(),
        source_amount: amount,
        min_output,
        nonce,
        timestamp: now,
    });

    msg!(
        "Cross-currency deposit initiated: {} for {}, nonce {}",
        amount,
        bond_type.as_str(),
        nonce
    );
    Ok(())
}

// ─── Direct deposit handler (settlement currency == bond currency) ──────────

pub fn handle_deposit_direct(
    ctx: Context<DepositDirect>,
    amount: u64,
    bond_type: BondType,
) -> Result<()> {
    let config = &ctx.accounts.protocol_config;
    require!(config.is_active, StablebondError::ProtocolNotActive);
    require!(amount > 0, StablebondError::ZeroDeposit);

    let ys = &ctx.accounts.yield_source;
    require!(ys.is_active, StablebondError::YieldSourceNotActive);
    require!(amount >= ys.min_deposit, StablebondError::BelowMinDeposit);
    require!(ys.bond_type == bond_type, StablebondError::BondTypeNotFound);

    // KYC check
    validate_kyc(
        &ctx.accounts.whitelist_entry,
        &ctx.accounts.user.key(),
        &config.kyc_whitelist_registry,
    )?;

    // Sovereign tier check
    let tier = read_sovereign_tier(&ctx.accounts.sovereign_identity, &ctx.accounts.user.key())?;
    require!(tier > 0, StablebondError::TierTooLow);

    // Check bond type allowed for tier
    let allowed_bonds = allowed_bond_types(tier);
    require!(
        allowed_bonds.contains(&bond_type),
        StablebondError::BondTypeNotAllowed
    );

    // Check yield source type allowed for tier
    let allowed_sources = allowed_yield_sources(tier);
    require!(
        allowed_sources.contains(&ys.source_type),
        StablebondError::YieldSourceNotAllowed
    );

    // Monthly limit check
    let now = Clock::get()?.unix_timestamp;
    let user_pos = &mut ctx.accounts.user_position;
    if user_pos.created_at == 0 {
        user_pos.owner = ctx.accounts.user.key();
        user_pos.protocol_config = config.key();
        user_pos.bond_type = bond_type;
        user_pos.created_at = now;
        user_pos.month_start = now;
        user_pos.bump = ctx.bumps.user_position;
    }
    user_pos.maybe_reset_monthly(now);
    user_pos.sovereign_tier = tier;

    let limit = monthly_limit(tier, bond_type);
    let new_monthly = user_pos
        .monthly_deposited
        .checked_add(amount)
        .ok_or(StablebondError::MathOverflow)?;
    require!(new_monthly <= limit, StablebondError::MonthlyLimitExceeded);

    // Calculate shares from yield source NAV
    let nav = ys.nav_per_share;
    let shares = (amount as u128)
        .checked_mul(1_000_000)
        .ok_or(StablebondError::MathOverflow)?
        .checked_div(nav as u128)
        .ok_or(StablebondError::MathOverflow)? as u64;

    // Transfer from user to yield source deposit vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token.to_account_info(),
                to: ctx.accounts.deposit_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // Update yield source
    let ys_mut = &mut ctx.accounts.yield_source;
    ys_mut.total_deposited = ys_mut
        .total_deposited
        .checked_add(amount)
        .ok_or(StablebondError::MathOverflow)?;
    ys_mut.total_shares = ys_mut
        .total_shares
        .checked_add(shares)
        .ok_or(StablebondError::MathOverflow)?;

    // Update user position
    user_pos.monthly_deposited = new_monthly;
    user_pos.total_deposited = user_pos
        .total_deposited
        .checked_add(amount)
        .ok_or(StablebondError::MathOverflow)?;
    user_pos.current_shares = user_pos
        .current_shares
        .checked_add(shares)
        .ok_or(StablebondError::MathOverflow)?;
    user_pos.cost_basis = user_pos
        .cost_basis
        .checked_add(amount)
        .ok_or(StablebondError::MathOverflow)?;
    user_pos.deposit_count = user_pos
        .deposit_count
        .checked_add(1)
        .ok_or(StablebondError::MathOverflow)?;
    user_pos.last_deposit_at = now;

    // Update protocol config
    let config_mut = &mut ctx.accounts.protocol_config;
    config_mut.total_deposits = config_mut
        .total_deposits
        .checked_add(amount)
        .ok_or(StablebondError::MathOverflow)?;
    config_mut.updated_at = now;

    emit!(DirectDeposit {
        user: ctx.accounts.user.key(),
        bond_type: bond_type.as_u8(),
        amount,
        shares_received: shares,
        timestamp: now,
    });

    msg!(
        "Direct deposit: {} for {}, {} shares issued",
        amount,
        bond_type.as_str(),
        shares
    );
    Ok(())
}
