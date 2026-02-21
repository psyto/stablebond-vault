use anchor_lang::prelude::*;
use stablebond_types::{BondConfig, BondType};

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("3fnWkVPz51AJjYodQY5VCzteD5enRmkWBTsu3gPedaYs");

#[program]
pub mod stablebond_core {
    use super::*;

    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        params: InitializeProtocolParams,
    ) -> Result<()> {
        instructions::initialize_protocol::handle_initialize_protocol(ctx, params)
    }

    pub fn register_bond(ctx: Context<RegisterBond>, config: BondConfig) -> Result<()> {
        instructions::register_bond::handle_register_bond(ctx, config)
    }

    pub fn register_yield_source(
        ctx: Context<RegisterYieldSource>,
        params: RegisterYieldSourceParams,
    ) -> Result<()> {
        instructions::register_yield_source::handle_register_yield_source(ctx, params)
    }

    /// Cross-currency deposit (e.g., MXN → CETES, JPY → JGB).
    /// Creates a PendingDeposit for keeper conversion.
    pub fn deposit_cross_currency(
        ctx: Context<DepositCrossCurrency>,
        amount: u64,
        bond_type: BondType,
        min_output: u64,
    ) -> Result<()> {
        instructions::deposit::handle_deposit_cross_currency(ctx, amount, bond_type, min_output)
    }

    /// Direct deposit when settlement currency matches bond's currency.
    /// Immediately allocates to yield source.
    pub fn deposit_direct(
        ctx: Context<DepositDirect>,
        amount: u64,
        bond_type: BondType,
    ) -> Result<()> {
        instructions::deposit::handle_deposit_direct(ctx, amount, bond_type)
    }

    pub fn execute_conversion(ctx: Context<ExecuteConversion>) -> Result<()> {
        instructions::execute_conversion::handle_execute_conversion(ctx)
    }

    pub fn withdraw(ctx: Context<Withdraw>, shares: u64, bond_type: BondType) -> Result<()> {
        instructions::withdraw::handle_withdraw(ctx, shares, bond_type)
    }

    pub fn claim_yield(ctx: Context<ClaimYield>, bond_type: BondType) -> Result<()> {
        instructions::claim_yield::handle_claim_yield(ctx, bond_type)
    }

    pub fn update_nav(ctx: Context<UpdateNav>) -> Result<()> {
        instructions::update_nav::handle_update_nav(ctx)
    }

    pub fn update_protocol_config(
        ctx: Context<UpdateProtocolConfig>,
        params: UpdateProtocolConfigParams,
    ) -> Result<()> {
        instructions::admin::handle_update_protocol_config(ctx, params)
    }

    pub fn update_yield_source(
        ctx: Context<UpdateYieldSource>,
        params: UpdateYieldSourceParams,
    ) -> Result<()> {
        instructions::admin::handle_update_yield_source(ctx, params)
    }

    pub fn pause_protocol(ctx: Context<PauseProtocol>) -> Result<()> {
        instructions::admin::handle_pause_protocol(ctx)
    }

    pub fn resume_protocol(ctx: Context<PauseProtocol>) -> Result<()> {
        instructions::admin::handle_resume_protocol(ctx)
    }
}
