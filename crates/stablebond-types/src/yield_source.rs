use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum YieldSourceType {
    TBill,          // existing from Exodus
    Lending,        // existing from Exodus
    Staking,        // existing from Exodus
    Synthetic,      // existing from Exodus
    SovereignBond,  // NEW — covers all bond types via BondConfig
}

impl YieldSourceType {
    pub fn as_str(&self) -> &'static str {
        match self {
            YieldSourceType::TBill => "T-Bill",
            YieldSourceType::Lending => "Lending",
            YieldSourceType::Staking => "Staking",
            YieldSourceType::Synthetic => "Synthetic",
            YieldSourceType::SovereignBond => "Sovereign Bond",
        }
    }
}
