use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};
use stablebond_types::BondType;

pub mod errors;
pub mod state;

use errors::BondVaultError;
use state::{BondVault, UserShares};

declare_id!("DLFUfzV4iqCzxmmXmCpR7qH6nhvPSLUekq7JCezV1LeE");

const SECONDS_PER_YEAR: u64 = 365 * 24 * 60 * 60;
const NAV_SCALE: u64 = 1_000_000;

/// Oracle PriceFeed layout (Pyth/Switchboard simplified):
///   discriminator(8) + authority(32) + current_price(u64, 8) + last_update_time(i64, 8)
const ORACLE_PRICE_OFFSET: usize = 8 + 32;
const ORACLE_UPDATE_OFFSET: usize = ORACLE_PRICE_OFFSET + 8;
/// Bond price oracle staleness limit: 5 minutes
const MAX_BOND_ORACLE_STALENESS: i64 = 300;

#[program]
pub mod stablebond_yield {
    use super::*;

    /// Initialize a bond vault for a specific bond type with a target APY.
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        bond_type: BondType,
        target_apy_bps: u16,
        coupon_rate_bps: u16,
        maturity_date: i64,
    ) -> Result<()> {
        require!(target_apy_bps <= 5000, BondVaultError::InvalidApy);

        let vault = &mut ctx.accounts.vault_config;
        vault.authority = ctx.accounts.authority.key();
        vault.currency_mint = ctx.accounts.currency_mint.key();
        vault.share_mint = ctx.accounts.share_mint.key();
        vault.currency_vault = ctx.accounts.currency_vault.key();
        vault.bond_type = bond_type;
        vault.coupon_rate_bps = coupon_rate_bps;
        vault.maturity_date = maturity_date;
        vault.target_apy_bps = target_apy_bps;
        vault.total_deposits = 0;
        vault.total_shares = 0;
        vault.nav_per_share = NAV_SCALE; // 1.000000
        vault.last_accrual = Clock::get()?.unix_timestamp;
        vault.is_active = true;
        vault.bump = ctx.bumps.vault_config;
        vault.share_mint_bump = ctx.bumps.share_mint;
        vault.vault_bump = ctx.bumps.currency_vault;
        // Oracle defaults: disabled, use manual APY fallback
        vault.oracle_feed = Pubkey::default();
        vault.last_oracle_price = NAV_SCALE;
        vault.oracle_enabled = false;
        // Reserve attestation defaults: no attestor, no staleness enforcement
        vault.reserve_attestor = Pubkey::default();
        vault.last_attestation_at = 0;
        vault.attested_reserve = 0;
        vault.attestation_max_staleness = BondVault::DEFAULT_ATTESTATION_STALENESS;

        msg!(
            "Bond vault initialized: {} with APY {} bps",
            bond_type.as_str(),
            target_apy_bps
        );
        Ok(())
    }

    /// Deposit settlement currency into the vault and receive shares.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let vault = &ctx.accounts.vault_config;
        require!(vault.is_active, BondVaultError::VaultNotActive);
        require!(amount > 0, BondVaultError::ZeroDeposit);

        // Calculate shares: shares = amount * NAV_SCALE / nav_per_share
        let shares = amount
            .checked_mul(NAV_SCALE)
            .ok_or(BondVaultError::MathOverflow)?
            .checked_div(vault.nav_per_share)
            .ok_or(BondVaultError::MathOverflow)?;

        // Transfer currency from depositor to vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_currency.to_account_info(),
                    to: ctx.accounts.currency_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        // Mint shares to depositor
        let bond_type_byte = ctx.accounts.vault_config.bond_type.as_u8();
        let vault_seeds: &[&[u8]] = &[
            BondVault::SEED,
            ctx.accounts.vault_config.authority.as_ref(),
            std::slice::from_ref(&bond_type_byte),
            &[ctx.accounts.vault_config.bump],
        ];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    to: ctx.accounts.user_shares_ata.to_account_info(),
                    authority: ctx.accounts.vault_config.to_account_info(),
                },
                &[vault_seeds],
            ),
            shares,
        )?;

        // Update vault state
        let vault = &mut ctx.accounts.vault_config;
        vault.total_deposits = vault
            .total_deposits
            .checked_add(amount)
            .ok_or(BondVaultError::MathOverflow)?;
        vault.total_shares = vault
            .total_shares
            .checked_add(shares)
            .ok_or(BondVaultError::MathOverflow)?;

        // Update user shares tracking
        let user_shares = &mut ctx.accounts.user_shares;
        user_shares.user = ctx.accounts.user.key();
        user_shares.vault = ctx.accounts.vault_config.key();
        user_shares.bump = ctx.bumps.user_shares;
        user_shares.shares = user_shares
            .shares
            .checked_add(shares)
            .ok_or(BondVaultError::MathOverflow)?;
        user_shares.deposited_amount = user_shares
            .deposited_amount
            .checked_add(amount)
            .ok_or(BondVaultError::MathOverflow)?;
        user_shares.last_deposit_at = Clock::get()?.unix_timestamp;

        msg!("Deposited {} currency, minted {} shares", amount, shares);
        Ok(())
    }

    /// Withdraw shares and receive settlement currency based on current NAV.
    pub fn withdraw(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
        let vault = &ctx.accounts.vault_config;
        require!(vault.is_active, BondVaultError::VaultNotActive);
        require!(shares > 0, BondVaultError::ZeroWithdrawal);

        let user_shares_account = &ctx.accounts.user_shares;
        require!(
            user_shares_account.shares >= shares,
            BondVaultError::InsufficientShares
        );

        // Calculate currency out: currency_out = shares * nav_per_share / NAV_SCALE
        let currency_out = shares
            .checked_mul(vault.nav_per_share)
            .ok_or(BondVaultError::MathOverflow)?
            .checked_div(NAV_SCALE)
            .ok_or(BondVaultError::MathOverflow)?;

        require!(
            ctx.accounts.currency_vault.amount >= currency_out,
            BondVaultError::InsufficientVaultBalance
        );

        // Burn shares from user
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    from: ctx.accounts.user_shares_ata.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            shares,
        )?;

        // Transfer currency from vault to user
        let bond_type_byte = ctx.accounts.vault_config.bond_type.as_u8();
        let vault_seeds: &[&[u8]] = &[
            BondVault::SEED,
            ctx.accounts.vault_config.authority.as_ref(),
            std::slice::from_ref(&bond_type_byte),
            &[ctx.accounts.vault_config.bump],
        ];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.currency_vault.to_account_info(),
                    to: ctx.accounts.user_currency.to_account_info(),
                    authority: ctx.accounts.vault_config.to_account_info(),
                },
                &[vault_seeds],
            ),
            currency_out,
        )?;

        // Update vault state
        let vault = &mut ctx.accounts.vault_config;
        vault.total_deposits = vault.total_deposits.saturating_sub(currency_out);
        vault.total_shares = vault
            .total_shares
            .checked_sub(shares)
            .ok_or(BondVaultError::MathOverflow)?;

        // Update user shares
        let user_shares_mut = &mut ctx.accounts.user_shares;
        user_shares_mut.shares = user_shares_mut
            .shares
            .checked_sub(shares)
            .ok_or(BondVaultError::MathOverflow)?;

        msg!("Withdrew {} shares for {} currency", shares, currency_out);
        Ok(())
    }

    /// Keeper crank: accrue yield using oracle-derived bond price or fallback APY.
    ///
    /// When oracle_enabled=true, reads the bond price oracle to compute a
    /// market-driven yield rate instead of the admin-set target_apy_bps.
    /// Oracle price represents bond price as fraction of par (scaled 1e6,
    /// e.g. 1_005_000 = 100.5% of par = 50bps yield above par).
    ///
    /// If a reserve attestor is configured, accrual pauses when the
    /// attestation is stale (older than attestation_max_staleness).
    ///
    /// Maturity-aware: stops accruing after bond maturity date.
    pub fn accrue_yield(ctx: Context<AccrueYield>) -> Result<()> {
        let vault = &mut ctx.accounts.vault_config;
        require!(vault.is_active, BondVaultError::VaultNotActive);

        let now = Clock::get()?.unix_timestamp;

        // If bond has matured, stop accruing
        if vault.maturity_date > 0 && now >= vault.maturity_date {
            return Ok(());
        }

        // If reserve attestor is configured, check attestation freshness
        if vault.reserve_attestor != Pubkey::default() {
            let staleness = now - vault.last_attestation_at;
            if staleness > vault.attestation_max_staleness {
                msg!(
                    "Reserve attestation stale ({} seconds), pausing yield accrual for {}",
                    staleness,
                    vault.bond_type.as_str()
                );
                return Ok(());
            }
        }

        let elapsed = (now - vault.last_accrual) as u64;

        if elapsed == 0 || vault.total_shares == 0 {
            return Ok(());
        }

        // Determine effective APY: oracle-derived or manual fallback
        let effective_apy_bps: u64 = if vault.oracle_enabled {
            // Read bond price from oracle
            let oracle_info = &ctx.accounts.bond_price_oracle;
            require!(
                oracle_info.key() == vault.oracle_feed,
                BondVaultError::InvalidOracle
            );

            let oracle_data = oracle_info.try_borrow_data()?;
            require!(
                oracle_data.len() >= ORACLE_UPDATE_OFFSET + 8,
                BondVaultError::InvalidOracle
            );

            let bond_price = u64::from_le_bytes(
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

            require!(bond_price > 0, BondVaultError::InvalidOracle);
            require!(
                now - last_update <= MAX_BOND_ORACLE_STALENESS,
                BondVaultError::StaleOracle
            );

            vault.last_oracle_price = bond_price;

            // Derive yield from bond price vs par (1_000_000).
            // If price < par: positive yield (discount bond)
            //   yield_bps = (par - price) * 10000 / price, annualized
            // If price > par: the bond trades at a premium, yield is the coupon
            //   minus the premium amortization (simplified: use coupon rate)
            // If price == par: yield = coupon rate
            if bond_price < NAV_SCALE {
                // Discount: yield = (par - price) / price * 10000
                // This gives the current yield for a zero-coupon or discount bond
                let discount_yield = ((NAV_SCALE - bond_price) as u128)
                    .checked_mul(10_000)
                    .ok_or(BondVaultError::MathOverflow)?
                    .checked_div(bond_price as u128)
                    .ok_or(BondVaultError::MathOverflow)? as u64;
                // Add coupon rate for coupon-bearing bonds
                discount_yield.saturating_add(vault.coupon_rate_bps as u64)
            } else if bond_price > NAV_SCALE {
                // Premium: yield = coupon - premium amortization
                // premium_cost_bps = (price - par) / price * 10000
                let premium_cost = ((bond_price - NAV_SCALE) as u128)
                    .checked_mul(10_000)
                    .ok_or(BondVaultError::MathOverflow)?
                    .checked_div(bond_price as u128)
                    .ok_or(BondVaultError::MathOverflow)? as u64;
                (vault.coupon_rate_bps as u64).saturating_sub(premium_cost)
            } else {
                vault.coupon_rate_bps as u64
            }
        } else {
            vault.target_apy_bps as u64
        };

        // Cap at 50% to prevent runaway yield
        let capped_apy = effective_apy_bps.min(5000);

        // accrual = nav_per_share * effective_apy * elapsed / (10000 * SECONDS_PER_YEAR)
        let accrual = (vault.nav_per_share as u128)
            .checked_mul(capped_apy as u128)
            .ok_or(BondVaultError::MathOverflow)?
            .checked_mul(elapsed as u128)
            .ok_or(BondVaultError::MathOverflow)?
            .checked_div(10_000u128 * SECONDS_PER_YEAR as u128)
            .ok_or(BondVaultError::MathOverflow)?;

        vault.nav_per_share = vault
            .nav_per_share
            .checked_add(accrual as u64)
            .ok_or(BondVaultError::MathOverflow)?;
        vault.last_accrual = now;

        msg!(
            "Yield accrued for {}: NAV per share now {}, effective APY {} bps (oracle={})",
            vault.bond_type.as_str(),
            vault.nav_per_share,
            capped_apy,
            vault.oracle_enabled
        );
        Ok(())
    }

    /// Admin: update the fallback target APY (used when oracle is disabled).
    pub fn update_apy(ctx: Context<UpdateApy>, new_apy_bps: u16) -> Result<()> {
        require!(new_apy_bps <= 5000, BondVaultError::InvalidApy);
        require!(
            ctx.accounts.authority.key() == ctx.accounts.vault_config.authority,
            BondVaultError::Unauthorized
        );

        ctx.accounts.vault_config.target_apy_bps = new_apy_bps;
        msg!("Fallback APY updated to {} bps", new_apy_bps);
        Ok(())
    }

    /// Admin: configure oracle feed for dynamic pricing.
    /// Setting oracle_feed to Pubkey::default() disables oracle pricing.
    pub fn configure_oracle(
        ctx: Context<ConfigureOracle>,
        oracle_feed: Pubkey,
        enabled: bool,
    ) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.vault_config.authority,
            BondVaultError::Unauthorized
        );

        let vault = &mut ctx.accounts.vault_config;
        vault.oracle_feed = oracle_feed;
        vault.oracle_enabled = enabled;

        msg!(
            "Oracle configured for {}: feed={}, enabled={}",
            vault.bond_type.as_str(),
            oracle_feed,
            enabled
        );
        Ok(())
    }

    /// Admin: configure the reserve attestor authority and staleness parameters.
    pub fn configure_reserve_attestor(
        ctx: Context<ConfigureReserveAttestor>,
        attestor: Pubkey,
        max_staleness: i64,
    ) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.vault_config.authority,
            BondVaultError::Unauthorized
        );
        require!(max_staleness > 0, BondVaultError::InvalidAttestationConfig);

        let vault = &mut ctx.accounts.vault_config;
        vault.reserve_attestor = attestor;
        vault.attestation_max_staleness = max_staleness;

        msg!(
            "Reserve attestor configured for {}: attestor={}, max_staleness={}s",
            vault.bond_type.as_str(),
            attestor,
            max_staleness
        );
        Ok(())
    }

    /// Attestor: submit a Proof-of-Reserve attestation.
    /// Only the configured reserve_attestor can call this.
    /// The attested reserve amount must be verifiable against off-chain custodian records.
    pub fn submit_reserve_attestation(
        ctx: Context<SubmitReserveAttestation>,
        attested_reserve: u64,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault_config;

        require!(
            vault.reserve_attestor != Pubkey::default(),
            BondVaultError::NoAttestorConfigured
        );
        require!(
            ctx.accounts.attestor.key() == vault.reserve_attestor,
            BondVaultError::Unauthorized
        );
        require!(attested_reserve > 0, BondVaultError::InvalidAttestation);

        let now = Clock::get()?.unix_timestamp;
        vault.last_attestation_at = now;
        vault.attested_reserve = attested_reserve;

        msg!(
            "Reserve attestation submitted for {}: {} units at {}",
            vault.bond_type.as_str(),
            attested_reserve,
            now
        );
        Ok(())
    }

    /// Keeper crank with reward: accrue yield and pay the caller a small incentive.
    /// This enables decentralized keeper networks by embedding rewards in the program.
    /// Reward = 0.01% of total_deposits, capped at 10_000 minor units (~$0.01).
    pub fn accrue_yield_incentivized(ctx: Context<AccrueYieldIncentivized>) -> Result<()> {
        let vault = &mut ctx.accounts.vault_config;
        require!(vault.is_active, BondVaultError::VaultNotActive);

        let now = Clock::get()?.unix_timestamp;

        // If bond has matured, stop accruing
        if vault.maturity_date > 0 && now >= vault.maturity_date {
            return Ok(());
        }

        // If reserve attestor is configured, check attestation freshness
        if vault.reserve_attestor != Pubkey::default() {
            let staleness = now - vault.last_attestation_at;
            if staleness > vault.attestation_max_staleness {
                msg!("Reserve attestation stale, pausing accrual");
                return Ok(());
            }
        }

        let elapsed = (now - vault.last_accrual) as u64;
        if elapsed == 0 || vault.total_shares == 0 {
            return Ok(());
        }

        // Minimum 30 seconds between incentivized cranks to prevent spam
        require!(elapsed >= 30, BondVaultError::CrankTooFrequent);

        // Use target_apy_bps for incentivized path (oracle path uses accrue_yield)
        let apy = vault.target_apy_bps as u128;

        let accrual = (vault.nav_per_share as u128)
            .checked_mul(apy)
            .ok_or(BondVaultError::MathOverflow)?
            .checked_mul(elapsed as u128)
            .ok_or(BondVaultError::MathOverflow)?
            .checked_div(10_000u128 * SECONDS_PER_YEAR as u128)
            .ok_or(BondVaultError::MathOverflow)?;

        vault.nav_per_share = vault
            .nav_per_share
            .checked_add(accrual as u64)
            .ok_or(BondVaultError::MathOverflow)?;
        vault.last_accrual = now;

        // Calculate keeper reward: 0.01% of total_deposits, capped at 10_000 (0.01 settlement units)
        let reward = (vault.total_deposits as u128)
            .checked_mul(1)
            .ok_or(BondVaultError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(BondVaultError::MathOverflow)? as u64;
        let capped_reward = reward.min(10_000);

        // Extract values before dropping the mutable borrow for the CPI
        let bond_type_byte = vault.bond_type.as_u8();
        let authority_key = vault.authority;
        let bump = vault.bump;
        let nav = vault.nav_per_share;
        let bond_name = vault.bond_type.as_str();

        if capped_reward > 0 && ctx.accounts.currency_vault.amount > capped_reward {
            let vault_seeds: &[&[u8]] = &[
                BondVault::SEED,
                authority_key.as_ref(),
                std::slice::from_ref(&bond_type_byte),
                &[bump],
            ];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.currency_vault.to_account_info(),
                        to: ctx.accounts.keeper_token.to_account_info(),
                        authority: ctx.accounts.vault_config.to_account_info(),
                    },
                    &[vault_seeds],
                ),
                capped_reward,
            )?;
        }

        msg!(
            "Incentivized yield accrued for {}: NAV {}, reward {} to keeper",
            bond_name,
            nav,
            capped_reward
        );
        Ok(())
    }
}

// ─── Account Contexts ──────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(bond_type: BondType)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = BondVault::LEN,
        seeds = [BondVault::SEED, authority.key().as_ref(), &[bond_type.as_u8()]],
        bump,
    )]
    pub vault_config: Account<'info, BondVault>,

    pub currency_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        seeds = [BondVault::SHARE_MINT_SEED, authority.key().as_ref(), &[bond_type.as_u8()]],
        bump,
        mint::decimals = 6,
        mint::authority = vault_config,
    )]
    pub share_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        seeds = [BondVault::CURRENCY_VAULT_SEED, authority.key().as_ref(), &[bond_type.as_u8()]],
        bump,
        token::mint = currency_mint,
        token::authority = vault_config,
    )]
    pub currency_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [BondVault::SEED, vault_config.authority.as_ref(), &[vault_config.bond_type.as_u8()]],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, BondVault>,

    #[account(
        mut,
        seeds = [BondVault::CURRENCY_VAULT_SEED, vault_config.authority.as_ref(), &[vault_config.bond_type.as_u8()]],
        bump = vault_config.vault_bump,
    )]
    pub currency_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [BondVault::SHARE_MINT_SEED, vault_config.authority.as_ref(), &[vault_config.bond_type.as_u8()]],
        bump = vault_config.share_mint_bump,
    )]
    pub share_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = user_currency.owner == user.key(),
        constraint = user_currency.mint == vault_config.currency_mint,
    )]
    pub user_currency: Account<'info, TokenAccount>,

    /// User's share token ATA
    #[account(
        mut,
        constraint = user_shares_ata.owner == user.key(),
        constraint = user_shares_ata.mint == share_mint.key(),
    )]
    pub user_shares_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        space = UserShares::LEN,
        seeds = [UserShares::SEED, vault_config.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub user_shares: Account<'info, UserShares>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [BondVault::SEED, vault_config.authority.as_ref(), &[vault_config.bond_type.as_u8()]],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, BondVault>,

    #[account(
        mut,
        seeds = [BondVault::CURRENCY_VAULT_SEED, vault_config.authority.as_ref(), &[vault_config.bond_type.as_u8()]],
        bump = vault_config.vault_bump,
    )]
    pub currency_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [BondVault::SHARE_MINT_SEED, vault_config.authority.as_ref(), &[vault_config.bond_type.as_u8()]],
        bump = vault_config.share_mint_bump,
    )]
    pub share_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = user_currency.owner == user.key(),
        constraint = user_currency.mint == vault_config.currency_mint,
    )]
    pub user_currency: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_shares_ata.owner == user.key(),
        constraint = user_shares_ata.mint == share_mint.key(),
    )]
    pub user_shares_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [UserShares::SEED, vault_config.key().as_ref(), user.key().as_ref()],
        bump = user_shares.bump,
    )]
    pub user_shares: Account<'info, UserShares>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AccrueYield<'info> {
    #[account(
        mut,
        seeds = [BondVault::SEED, vault_config.authority.as_ref(), &[vault_config.bond_type.as_u8()]],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, BondVault>,

    /// Bond price oracle feed. Required when oracle_enabled=true.
    /// CHECK: Validated against vault_config.oracle_feed in handler.
    pub bond_price_oracle: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct AccrueYieldIncentivized<'info> {
    /// Keeper that triggers the crank and receives reward
    #[account(mut)]
    pub keeper: Signer<'info>,

    #[account(
        mut,
        seeds = [BondVault::SEED, vault_config.authority.as_ref(), &[vault_config.bond_type.as_u8()]],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, BondVault>,

    #[account(
        mut,
        seeds = [BondVault::CURRENCY_VAULT_SEED, vault_config.authority.as_ref(), &[vault_config.bond_type.as_u8()]],
        bump = vault_config.vault_bump,
    )]
    pub currency_vault: Account<'info, TokenAccount>,

    /// Keeper's token account to receive reward
    #[account(
        mut,
        constraint = keeper_token.owner == keeper.key(),
        constraint = keeper_token.mint == vault_config.currency_mint,
    )]
    pub keeper_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateApy<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [BondVault::SEED, vault_config.authority.as_ref(), &[vault_config.bond_type.as_u8()]],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, BondVault>,
}

#[derive(Accounts)]
pub struct ConfigureOracle<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [BondVault::SEED, vault_config.authority.as_ref(), &[vault_config.bond_type.as_u8()]],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, BondVault>,
}

#[derive(Accounts)]
pub struct ConfigureReserveAttestor<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [BondVault::SEED, vault_config.authority.as_ref(), &[vault_config.bond_type.as_u8()]],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, BondVault>,
}

#[derive(Accounts)]
pub struct SubmitReserveAttestation<'info> {
    pub attestor: Signer<'info>,

    #[account(
        mut,
        seeds = [BondVault::SEED, vault_config.authority.as_ref(), &[vault_config.bond_type.as_u8()]],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, BondVault>,
}
