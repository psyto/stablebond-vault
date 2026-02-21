use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum DepositStatus {
    Pending,
    Converting,
    Converted,
    Cancelled,
    Expired,
}

/// Generalized conversion direction supporting any currency pair.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ConversionDirection {
    JpyToUsdc,
    UsdcToJpy,
    MxnToUsdc,
    BrlToUsdc,
    NativeToSettlement, // Generic: bond's native currency → settlement currency
    SettlementToNative, // Generic: settlement currency → bond's native currency
}
