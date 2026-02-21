use anchor_lang::prelude::*;

#[error_code]
pub enum StablebondError {
    #[msg("Protocol is not active")]
    ProtocolNotActive,

    #[msg("Unauthorized: only protocol authority can perform this action")]
    Unauthorized,

    #[msg("KYC verification required: no valid whitelist entry found")]
    KycRequired,

    #[msg("KYC verification expired")]
    KycExpired,

    #[msg("KYC jurisdiction not allowed (e.g., USA)")]
    JurisdictionRestricted,

    #[msg("Sovereign identity not found")]
    SovereignIdentityNotFound,

    #[msg("Tier too low for this operation")]
    TierTooLow,

    #[msg("Bond type not allowed for your tier")]
    BondTypeNotAllowed,

    #[msg("Monthly deposit limit exceeded for your tier and bond type")]
    MonthlyLimitExceeded,

    #[msg("Deposit amount must be greater than zero")]
    ZeroDeposit,

    #[msg("Pending deposit not found or wrong status")]
    InvalidPendingDeposit,

    #[msg("Pending deposit has expired")]
    DepositExpired,

    #[msg("Slippage tolerance exceeded: output below minimum")]
    SlippageExceeded,

    #[msg("Oracle price is stale (>300 seconds old)")]
    StalePriceOracle,

    #[msg("Invalid oracle price")]
    InvalidOraclePrice,

    #[msg("Yield source is not active")]
    YieldSourceNotActive,

    #[msg("Yield source type not allowed for your tier")]
    YieldSourceNotAllowed,

    #[msg("Insufficient shares for withdrawal")]
    InsufficientShares,

    #[msg("No yield to claim")]
    NoYieldToClaim,

    #[msg("Withdrawal amount must be greater than zero")]
    ZeroWithdrawal,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Deposit below minimum for yield source")]
    BelowMinDeposit,

    #[msg("Allocation would exceed max for yield source")]
    ExceedsMaxAllocation,

    #[msg("Invalid fee configuration")]
    InvalidFee,

    #[msg("Invalid account data or discriminator")]
    InvalidAccountData,

    #[msg("Maximum number of supported bonds reached (8)")]
    MaxBondsReached,

    #[msg("Bond type not found in registry")]
    BondTypeNotFound,

    #[msg("Bond type already registered")]
    BondTypeAlreadyRegistered,
}
