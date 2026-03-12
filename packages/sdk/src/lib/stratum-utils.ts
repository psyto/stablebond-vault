import { MerkleTree, Bitfield } from '@stratum/core';

// ---------------------------------------------------------------------------
// Tier Membership Merkle Proofs
// ---------------------------------------------------------------------------

/**
 * Build a merkle tree from tier-verified depositor records.
 * Each leaf encodes `walletAddress:tier:monthlyLimit`.
 *
 * Enables compact on-chain proof that a depositor belongs to a
 * specific tier without loading all user position PDAs.
 *
 * Uses @stratum/core MerkleTree.
 */
export function buildTierMembershipTree(
  depositors: Array<{ wallet: string; tier: string; monthlyLimit: string }>,
): MerkleTree {
  const leaves = depositors.map(
    (d) => `${d.wallet}:${d.tier}:${d.monthlyLimit}`,
  );
  return new MerkleTree(leaves);
}

/**
 * Generate a merkle proof for a depositor's tier membership.
 */
export function getTierProof(
  tree: MerkleTree,
  wallet: string,
  tier: string,
  monthlyLimit: string,
): { proof: number[][]; root: number[]; index: number } {
  const index = tree.findLeafIndex(`${wallet}:${tier}:${monthlyLimit}`);
  if (index < 0) throw new Error('Depositor not found in tier tree');
  return {
    proof: tree.getProofArray(index),
    root: tree.rootArray,
    index,
  };
}

// ---------------------------------------------------------------------------
// Monthly Deposit Tracking
// ---------------------------------------------------------------------------

/**
 * Track which depositors have made deposits this month
 * using a compact bitfield. Each bit = one depositor slot.
 *
 * 10,000 depositors = 1.25 KB per month.
 */
export function createMonthlyDepositTracker(depositorCount: number): Bitfield {
  const bytesNeeded = Math.ceil(depositorCount / 8);
  return new Bitfield(bytesNeeded);
}

/**
 * Restore a deposit tracker from stored bytes.
 */
export function restoreDepositTracker(data: Uint8Array): Bitfield {
  return Bitfield.fromBytes(data);
}

// ---------------------------------------------------------------------------
// Bond Registry Merkle Tree
// ---------------------------------------------------------------------------

/**
 * Build a merkle tree of supported bond types for proof-of-reserve auditing.
 * Each leaf encodes `bondType:issuer:maturityDate:yield`.
 */
export function buildBondRegistryTree(
  bonds: Array<{
    bondType: string;
    issuer: string;
    maturityDate: string;
    yieldBps: number;
  }>,
): MerkleTree {
  const leaves = bonds.map(
    (b) => `${b.bondType}:${b.issuer}:${b.maturityDate}:${b.yieldBps}`,
  );
  return new MerkleTree(leaves);
}

// ---------------------------------------------------------------------------
// Proof of Reserve (PoR) Merkle Tree
// ---------------------------------------------------------------------------

/**
 * Build a Proof-of-Reserve merkle tree from off-chain custodian holdings.
 * Each leaf encodes `bondType:custodian:isin:faceValue:holdings:timestamp`.
 *
 * This tree can be verified on-chain against the attested reserve in BondVault.
 * The root hash should match the custodian's signed attestation.
 */
export function buildProofOfReserveTree(
  holdings: Array<{
    bondType: string;
    custodian: string;
    isin: string;
    faceValue: string;
    holdings: string;
    timestamp: string;
  }>,
): MerkleTree {
  const leaves = holdings.map(
    (h) =>
      `${h.bondType}:${h.custodian}:${h.isin}:${h.faceValue}:${h.holdings}:${h.timestamp}`,
  );
  return new MerkleTree(leaves);
}

/**
 * Generate a proof for a specific bond holding in the PoR tree.
 */
export function getReserveProof(
  tree: MerkleTree,
  bondType: string,
  custodian: string,
  isin: string,
  faceValue: string,
  holdings: string,
  timestamp: string,
): { proof: number[][]; root: number[]; index: number } {
  const leaf = `${bondType}:${custodian}:${isin}:${faceValue}:${holdings}:${timestamp}`;
  const index = tree.findLeafIndex(leaf);
  if (index < 0) throw new Error('Holding not found in PoR tree');
  return {
    proof: tree.getProofArray(index),
    root: tree.rootArray,
    index,
  };
}

/**
 * Verify that total attested reserves cover total vault deposits.
 * Returns the coverage ratio (>= 1.0 means fully backed).
 */
export function verifyReserveCoverage(
  attestedReserve: bigint,
  totalDeposits: bigint,
): { ratio: number; isFullyBacked: boolean } {
  if (totalDeposits === 0n) {
    return { ratio: 1.0, isFullyBacked: true };
  }
  const ratio = Number(attestedReserve * 10_000n / totalDeposits) / 10_000;
  return {
    ratio,
    isFullyBacked: ratio >= 1.0,
  };
}
