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

    /// Keeper crank: accrue yield based on elapsed time and target APY.
    /// Maturity-aware: stops accruing after bond maturity date (from Continuum).
    pub fn accrue_yield(ctx: Context<AccrueYield>) -> Result<()> {
        let vault = &mut ctx.accounts.vault_config;
        require!(vault.is_active, BondVaultError::VaultNotActive);

        let now = Clock::get()?.unix_timestamp;

        // If bond has matured, stop accruing (from Continuum repo-engine pattern)
        if vault.maturity_date > 0 && now >= vault.maturity_date {
            return Ok(());
        }

        let elapsed = (now - vault.last_accrual) as u64;

        if elapsed == 0 || vault.total_shares == 0 {
            return Ok(());
        }

        // accrual = nav_per_share * target_apy_bps * elapsed / (10000 * SECONDS_PER_YEAR)
        let accrual = (vault.nav_per_share as u128)
            .checked_mul(vault.target_apy_bps as u128)
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
            "Yield accrued for {}: NAV per share now {}",
            vault.bond_type.as_str(),
            vault.nav_per_share
        );
        Ok(())
    }

    /// Admin: update the target APY.
    pub fn update_apy(ctx: Context<UpdateApy>, new_apy_bps: u16) -> Result<()> {
        require!(new_apy_bps <= 5000, BondVaultError::InvalidApy);
        require!(
            ctx.accounts.authority.key() == ctx.accounts.vault_config.authority,
            BondVaultError::Unauthorized
        );

        ctx.accounts.vault_config.target_apy_bps = new_apy_bps;
        msg!("APY updated to {} bps", new_apy_bps);
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
