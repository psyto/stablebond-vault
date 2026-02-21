use crate::bond::BondType;
use crate::yield_source::YieldSourceType;

/// Tier 0 = Unverified (no access)
/// Tier 1 = Bronze (basic KYC)
/// Tier 2 = Silver (enhanced KYC)
/// Tier 3 = Gold (accredited investor)
/// Tier 4 = Diamond (institutional)

/// Multi-currency monthly deposit limit by Sovereign tier and bond type.
/// Returns amount in minor units (6 decimals) of the bond's native currency.
pub fn monthly_limit(tier: u8, bond_type: BondType) -> u64 {
    match (tier, bond_type) {
        // US T-Bills (USD, 6 decimals)
        (0, BondType::UsTBill) => 0,
        (1, BondType::UsTBill) => 5_000_000_000,        // $5,000
        (2, BondType::UsTBill) => 50_000_000_000,       // $50,000
        (3, BondType::UsTBill) => 500_000_000_000,      // $500,000
        (4, BondType::UsTBill) => u64::MAX,

        // Mexico CETES (MXN, 6 decimals)
        (0, BondType::MxCetes) => 0,
        (1, BondType::MxCetes) => 100_000_000_000,      // MXN 100,000
        (2, BondType::MxCetes) => 1_000_000_000_000,    // MXN 1,000,000
        (3, BondType::MxCetes) => 10_000_000_000_000,   // MXN 10,000,000
        (4, BondType::MxCetes) => u64::MAX,

        // Brazil Tesouro (BRL, 6 decimals)
        (0, BondType::BrTesouro) => 0,
        (1, BondType::BrTesouro) => 25_000_000_000,     // BRL 25,000
        (2, BondType::BrTesouro) => 250_000_000_000,    // BRL 250,000
        (3, BondType::BrTesouro) => 2_500_000_000_000,  // BRL 2,500,000
        (4, BondType::BrTesouro) => u64::MAX,

        // Japan JGBs (JPY, 6 decimals)
        (0, BondType::JpJgb) => 0,
        (1, BondType::JpJgb) => 500_000_000_000,        // JPY 500,000
        (2, BondType::JpJgb) => 5_000_000_000_000,      // JPY 5,000,000
        (3, BondType::JpJgb) => 50_000_000_000_000,     // JPY 50,000,000
        (4, BondType::JpJgb) => u64::MAX,

        // Custom — default to USD-equivalent limits
        (1, BondType::Custom) => 5_000_000_000,
        (2, BondType::Custom) => 50_000_000_000,
        (3, BondType::Custom) => 500_000_000_000,
        (4, BondType::Custom) => u64::MAX,

        _ => 0,
    }
}

/// Returns which bond types a given tier can access.
pub fn allowed_bond_types(tier: u8) -> Vec<BondType> {
    match tier {
        0 => vec![],
        1 => vec![BondType::UsTBill, BondType::JpJgb],
        2 => vec![BondType::UsTBill, BondType::JpJgb, BondType::MxCetes],
        3 => vec![
            BondType::UsTBill,
            BondType::JpJgb,
            BondType::MxCetes,
            BondType::BrTesouro,
        ],
        4 => vec![
            BondType::UsTBill,
            BondType::JpJgb,
            BondType::MxCetes,
            BondType::BrTesouro,
            BondType::Custom,
        ],
        _ => vec![],
    }
}

/// Returns which yield source types a given tier can access.
pub fn allowed_yield_sources(tier: u8) -> Vec<YieldSourceType> {
    match tier {
        0 => vec![],
        1 => vec![YieldSourceType::TBill, YieldSourceType::SovereignBond],
        2 => vec![
            YieldSourceType::TBill,
            YieldSourceType::Lending,
            YieldSourceType::SovereignBond,
        ],
        3 => vec![
            YieldSourceType::TBill,
            YieldSourceType::Lending,
            YieldSourceType::Staking,
            YieldSourceType::SovereignBond,
        ],
        4 => vec![
            YieldSourceType::TBill,
            YieldSourceType::Lending,
            YieldSourceType::Staking,
            YieldSourceType::Synthetic,
            YieldSourceType::SovereignBond,
        ],
        _ => vec![],
    }
}

/// Tier display name in English.
pub fn tier_name_en(tier: u8) -> &'static str {
    match tier {
        0 => "Unverified",
        1 => "Bronze",
        2 => "Silver",
        3 => "Gold",
        4 => "Diamond",
        _ => "Unknown",
    }
}

/// Tier display name in Japanese.
pub fn tier_name_ja(tier: u8) -> &'static str {
    match tier {
        0 => "未認証",
        1 => "ブロンズ",
        2 => "シルバー",
        3 => "ゴールド",
        4 => "ダイヤモンド",
        _ => "不明",
    }
}
