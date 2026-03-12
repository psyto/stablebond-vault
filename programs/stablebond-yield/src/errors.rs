use anchor_lang::prelude::*;

#[error_code]
pub enum BondVaultError {
    #[msg("Vault is not active")]
    VaultNotActive,

    #[msg("Deposit amount must be greater than zero")]
    ZeroDeposit,

    #[msg("Insufficient shares for withdrawal")]
    InsufficientShares,

    #[msg("Withdrawal amount must be greater than zero")]
    ZeroWithdrawal,

    #[msg("Unauthorized: only vault authority can perform this action")]
    Unauthorized,

    #[msg("APY basis points must be between 0 and 5000 (50%)")]
    InvalidApy,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Insufficient vault balance for withdrawal")]
    InsufficientVaultBalance,

    #[msg("Bond has matured — no further yield accrual")]
    BondMatured,

    #[msg("Invalid or mismatched bond price oracle")]
    InvalidOracle,

    #[msg("Bond price oracle data is stale (>300 seconds)")]
    StaleOracle,

    #[msg("No reserve attestor configured")]
    NoAttestorConfigured,

    #[msg("Invalid reserve attestation: amount must be > 0")]
    InvalidAttestation,

    #[msg("Invalid attestation config: max_staleness must be > 0")]
    InvalidAttestationConfig,

    #[msg("Incentivized crank called too frequently (min 30 seconds)")]
    CrankTooFrequent,

    #[msg("Immediate withdrawals are disabled — use the cooldown-based withdrawal flow")]
    ImmediateWithdrawDisabled,
}
