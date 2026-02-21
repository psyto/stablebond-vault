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
}
