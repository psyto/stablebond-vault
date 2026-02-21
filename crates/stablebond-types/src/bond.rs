use anchor_lang::prelude::*;

/// Supported sovereign bond types.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum BondType {
    UsTBill,    // USD, ~4.5% APY
    MxCetes,    // MXN, ~7-11% APY
    BrTesouro,  // BRL, ~13% APY
    JpJgb,      // JPY, ~0.4% APY
    Custom,     // Future sovereign bonds
}

impl BondType {
    pub fn as_str(&self) -> &'static str {
        match self {
            BondType::UsTBill => "US T-Bill",
            BondType::MxCetes => "MX CETES",
            BondType::BrTesouro => "BR Tesouro",
            BondType::JpJgb => "JP JGB",
            BondType::Custom => "Custom",
        }
    }

    /// Returns the 3-letter ISO currency code for the bond's denomination.
    pub fn denomination_currency(&self) -> [u8; 3] {
        match self {
            BondType::UsTBill => *b"USD",
            BondType::MxCetes => *b"MXN",
            BondType::BrTesouro => *b"BRL",
            BondType::JpJgb => *b"JPY",
            BondType::Custom => *b"USD",
        }
    }

    /// Returns the default baseline APY in basis points.
    pub fn default_apy_bps(&self) -> u16 {
        match self {
            BondType::UsTBill => 450,   // 4.50%
            BondType::MxCetes => 900,   // 9.00%
            BondType::BrTesouro => 1300, // 13.00%
            BondType::JpJgb => 40,      // 0.40%
            BondType::Custom => 0,
        }
    }

    pub fn as_u8(&self) -> u8 {
        match self {
            BondType::UsTBill => 0,
            BondType::MxCetes => 1,
            BondType::BrTesouro => 2,
            BondType::JpJgb => 3,
            BondType::Custom => 4,
        }
    }
}

/// Configuration for a registered sovereign bond type.
/// Merges Exodus YieldSourceType + Continuum CollateralType + Northtail UnderlyingAsset.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct BondConfig {
    /// Type of sovereign bond
    pub bond_type: BondType,
    /// Mint for the bond's settlement/deposit currency (e.g. USDC, MXN stablecoin)
    pub currency_mint: Pubkey,
    /// 3-letter ISO currency code: "USD", "MXN", "BRL", "JPY"
    pub denomination_currency: [u8; 3],
    /// Pyth/Switchboard price feed for FX (currency vs USD)
    pub oracle_feed: Pubkey,
    /// Bond coupon rate in basis points (from Continuum CollateralType)
    pub coupon_rate_bps: u16,
    /// Bond maturity date as unix timestamp (0 = no maturity / rolling)
    pub maturity_date: i64,
    /// Bond face value per unit (from Continuum CollateralType)
    pub face_value: u64,
    /// Collateral haircut in basis points (from Continuum CollateralType)
    pub haircut_bps: u16,
    /// Baseline yield in basis points
    pub default_apy_bps: u16,
    /// Minimum Sovereign tier required to access this bond
    pub min_tier: u8,
    /// Whether this bond type is currently active
    pub is_active: bool,
}

impl BondConfig {
    pub const LEN: usize = 1   // bond_type
        + 32  // currency_mint
        + 3   // denomination_currency
        + 32  // oracle_feed
        + 2   // coupon_rate_bps
        + 8   // maturity_date
        + 8   // face_value
        + 2   // haircut_bps
        + 2   // default_apy_bps
        + 1   // min_tier
        + 1;  // is_active
}
