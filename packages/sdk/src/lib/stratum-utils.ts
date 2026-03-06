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
