use crate::bond::BondType;
use crate::yield_source::YieldSourceType;

/// Tier 0 = Unverified (no access)
/// Tier 1 = Bronze (basic KYC)
/// Tier 2 = Silver (enhanced KYC)
/// Tier 3 = Gold (accredited investor)
/// Tier 4 = Diamond (institutional)

/// Multi-currency monthly deposit limit by Sovereign tier and bond type.
/// Returns amount in minor units (6 decimals) of the bond's native currency.
/// Diamond tier (4) uses concrete caps tied to realistic bond purchase capacity,
/// preventing unbacked exposure that exceeds underlying liquidity pools.
pub fn monthly_limit(tier: u8, bond_type: BondType) -> u64 {
    match (tier, bond_type) {
        // US T-Bills (USD, 6 decimals)
        (0, BondType::UsTBill) => 0,
        (1, BondType::UsTBill) => 5_000_000_000,           // $5,000
        (2, BondType::UsTBill) => 50_000_000_000,          // $50,000
        (3, BondType::UsTBill) => 500_000_000_000,         // $500,000
        (4, BondType::UsTBill) => 10_000_000_000_000,      // $10,000,000

        // Mexico CETES (MXN, 6 decimals)
        (0, BondType::MxCetes) => 0,
        (1, BondType::MxCetes) => 100_000_000_000,         // MXN 100,000
        (2, BondType::MxCetes) => 1_000_000_000_000,       // MXN 1,000,000
        (3, BondType::MxCetes) => 10_000_000_000_000,      // MXN 10,000,000
        (4, BondType::MxCetes) => 200_000_000_000_000,     // MXN 200,000,000

        // Brazil Tesouro (BRL, 6 decimals)
        (0, BondType::BrTesouro) => 0,
        (1, BondType::BrTesouro) => 25_000_000_000,        // BRL 25,000
        (2, BondType::BrTesouro) => 250_000_000_000,       // BRL 250,000
        (3, BondType::BrTesouro) => 2_500_000_000_000,     // BRL 2,500,000
        (4, BondType::BrTesouro) => 50_000_000_000_000,    // BRL 50,000,000

        // Japan JGBs (JPY, 6 decimals)
        (0, BondType::JpJgb) => 0,
        (1, BondType::JpJgb) => 500_000_000_000,           // JPY 500,000
        (2, BondType::JpJgb) => 5_000_000_000_000,         // JPY 5,000,000
        (3, BondType::JpJgb) => 50_000_000_000_000,        // JPY 50,000,000
        (4, BondType::JpJgb) => 1_500_000_000_000_000,     // JPY 1,500,000,000

        // Custom — default to USD-equivalent limits
        (1, BondType::Custom) => 5_000_000_000,
        (2, BondType::Custom) => 50_000_000_000,
        (3, BondType::Custom) => 500_000_000_000,
        (4, BondType::Custom) => 10_000_000_000_000,       // $10,000,000

        _ => 0,
    }
}

/// Settlement cooldown period in seconds per bond type.
/// Aligns with the real-world liquidation timeframe of the underlying asset.
pub fn withdrawal_cooldown_seconds(bond_type: BondType) -> i64 {
    match bond_type {
        BondType::UsTBill => 86_400,      // T+1 (1 day)
        BondType::MxCetes => 172_800,     // T+2 (2 days)
        BondType::BrTesouro => 172_800,   // T+2 (2 days)
        BondType::JpJgb => 172_800,       // T+2 (2 days)
        BondType::Custom => 86_400,       // T+1 default
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
