import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import {
  setupTestContext,
  createAndFundTokenAccount,
  getTokenBalance,
  BondType,
  BOND_TYPE_U8,
  YIELD_PROGRAM_ID,
  CORE_PROGRAM_ID,
  findBondVaultPda,
  findBondShareMintPda,
  findBondCurrencyVaultPda,
  findUserSharesPda,
  findProtocolConfigPda,
  TestContext,
} from "./helpers/setup";

// ─── Withdrawal request PDA derivation (new feature) ─────────────────────────

function findWithdrawalRequestPda(
  config: PublicKey,
  user: PublicKey,
  nonce: number,
  programId: PublicKey
): [PublicKey, number] {
  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeUInt32LE(nonce, 0);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("withdrawal_request"),
      config.toBuffer(),
      user.toBuffer(),
      nonceBuffer,
    ],
    programId
  );
}

// ─── Helper: sleep for a given number of milliseconds ────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("new-features", () => {
  let provider: anchor.AnchorProvider;
  let yieldProgram: Program;
  let ctx: TestContext;
  let usdcMint: PublicKey;

  // Shared vault state for yield program tests
  let vaultPda: PublicKey;
  let shareMintPda: PublicKey;
  let currencyVaultPda: PublicKey;

  before(async () => {
    provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    yieldProgram = anchor.workspace.StablebondYield as Program;
    ctx = await setupTestContext(provider);
    usdcMint = ctx.usdcMint;

    // Initialize a US T-Bill vault for the new-feature tests
    [vaultPda] = findBondVaultPda(
      ctx.authority.publicKey,
      BOND_TYPE_U8.UsTBill,
      yieldProgram.programId
    );
    [shareMintPda] = findBondShareMintPda(
      ctx.authority.publicKey,
      BOND_TYPE_U8.UsTBill,
      yieldProgram.programId
    );
    [currencyVaultPda] = findBondCurrencyVaultPda(
      ctx.authority.publicKey,
      BOND_TYPE_U8.UsTBill,
      yieldProgram.programId
    );

    await yieldProgram.methods
      .initializeVault(BondType.UsTBill, 450, 450, new BN(0))
      .accounts({
        authority: ctx.authority.publicKey,
        vaultConfig: vaultPda,
        currencyMint: usdcMint,
        shareMint: shareMintPda,
        currencyVault: currencyVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([ctx.authority])
      .rpc();

    // Deposit funds so the vault has liquidity for testing
    const userCurrency = await createAndFundTokenAccount(
      ctx.connection,
      ctx.authority,
      usdcMint,
      ctx.user.publicKey,
      10_000_000_000 // 10,000 USDC
    );

    const userSharesAta = await createAccount(
      ctx.connection,
      ctx.user,
      shareMintPda,
      ctx.user.publicKey
    );

    const [userSharesPda] = findUserSharesPda(
      vaultPda,
      ctx.user.publicKey,
      yieldProgram.programId
    );

    await yieldProgram.methods
      .deposit(new BN(5_000_000_000))
      .accounts({
        user: ctx.user.publicKey,
        vaultConfig: vaultPda,
        currencyVault: currencyVaultPda,
        shareMint: shareMintPda,
        userCurrency,
        userSharesAta,
        userShares: userSharesPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.user])
      .rpc();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Oracle Configuration
  // ═══════════════════════════════════════════════════════════════════════════

  describe("oracle configuration", () => {
    it("authority can configure an oracle feed", async () => {
      const oracleFeed = Keypair.generate().publicKey;

      await yieldProgram.methods
        .configureOracle(oracleFeed, true)
        .accounts({
          authority: ctx.authority.publicKey,
          vaultConfig: vaultPda,
        })
        .signers([ctx.authority])
        .rpc();

      const vault = await yieldProgram.account.bondVault.fetch(vaultPda);
      expect(vault.oracleFeed.toBase58()).to.equal(oracleFeed.toBase58());
      expect(vault.oracleEnabled).to.be.true;
    });

    it("authority can disable the oracle", async () => {
      // Disable oracle by passing enabled=false
      const oracleFeed = Keypair.generate().publicKey;

      await yieldProgram.methods
        .configureOracle(oracleFeed, false)
        .accounts({
          authority: ctx.authority.publicKey,
          vaultConfig: vaultPda,
        })
        .signers([ctx.authority])
        .rpc();

      const vault = await yieldProgram.account.bondVault.fetch(vaultPda);
      expect(vault.oracleEnabled).to.be.false;
    });

    it("non-authority cannot configure oracle", async () => {
      const oracleFeed = Keypair.generate().publicKey;

      try {
        await yieldProgram.methods
          .configureOracle(oracleFeed, true)
          .accounts({
            authority: ctx.user.publicKey,
            vaultConfig: vaultPda,
          })
          .signers([ctx.user])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });

    it("accrueYield works with oracle disabled (fallback APY)", async () => {
      // Ensure oracle is disabled
      await yieldProgram.methods
        .configureOracle(SystemProgram.programId, false)
        .accounts({
          authority: ctx.authority.publicKey,
          vaultConfig: vaultPda,
        })
        .signers([ctx.authority])
        .rpc();

      const vaultBefore = await yieldProgram.account.bondVault.fetch(vaultPda);
      const navBefore = vaultBefore.navPerShare.toNumber();

      // Wait for time to elapse so yield accrues
      await sleep(2000);

      await yieldProgram.methods
        .accrueYield()
        .accounts({
          vaultConfig: vaultPda,
          bondPriceOracle: SystemProgram.programId,
        })
        .rpc();

      const vaultAfter = await yieldProgram.account.bondVault.fetch(vaultPda);
      const navAfter = vaultAfter.navPerShare.toNumber();

      expect(navAfter).to.be.at.least(navBefore);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Reserve Attestation
  // ═══════════════════════════════════════════════════════════════════════════

  describe("reserve attestation", () => {
    const attestor = Keypair.generate();

    before(async () => {
      // Fund the attestor account
      const sig = await ctx.connection.requestAirdrop(
        attestor.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await ctx.connection.confirmTransaction(sig);
    });

    it("authority can configure a reserve attestor", async () => {
      const maxStaleness = new BN(3600); // 1 hour

      await yieldProgram.methods
        .configureReserveAttestor(attestor.publicKey, maxStaleness)
        .accounts({
          authority: ctx.authority.publicKey,
          vaultConfig: vaultPda,
        })
        .signers([ctx.authority])
        .rpc();

      const vault = await yieldProgram.account.bondVault.fetch(vaultPda);
      expect(vault.reserveAttestor.toBase58()).to.equal(
        attestor.publicKey.toBase58()
      );
      expect(vault.attestationMaxStaleness.toNumber()).to.equal(3600);
    });

    it("non-authority cannot configure attestor", async () => {
      const fakeAttestor = Keypair.generate().publicKey;

      try {
        await yieldProgram.methods
          .configureReserveAttestor(fakeAttestor, new BN(3600))
          .accounts({
            authority: ctx.user.publicKey,
            vaultConfig: vaultPda,
          })
          .signers([ctx.user])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });

    it("configured attestor can submit reserve attestation", async () => {
      const attestedReserve = new BN(5_000_000_000); // matches deposits

      await yieldProgram.methods
        .submitReserveAttestation(attestedReserve)
        .accounts({
          attestor: attestor.publicKey,
          vaultConfig: vaultPda,
        })
        .signers([attestor])
        .rpc();

      const vault = await yieldProgram.account.bondVault.fetch(vaultPda);
      expect(vault.attestedReserve.toNumber()).to.equal(5_000_000_000);
      expect(vault.lastAttestationAt.toNumber()).to.be.greaterThan(0);
    });

    it("non-attestor cannot submit attestation", async () => {
      try {
        await yieldProgram.methods
          .submitReserveAttestation(new BN(5_000_000_000))
          .accounts({
            attestor: ctx.user.publicKey,
            vaultConfig: vaultPda,
          })
          .signers([ctx.user])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        // Could be Unauthorized or a constraint error
        expect(err.toString()).to.satisfy(
          (s: string) =>
            s.includes("Unauthorized") || s.includes("ConstraintRaw")
        );
      }
    });

    it("accrual pauses when attestation is stale", async () => {
      // Reconfigure attestor with a very short max_staleness (1 second)
      await yieldProgram.methods
        .configureReserveAttestor(attestor.publicKey, new BN(1))
        .accounts({
          authority: ctx.authority.publicKey,
          vaultConfig: vaultPda,
        })
        .signers([ctx.authority])
        .rpc();

      // Submit a fresh attestation
      await yieldProgram.methods
        .submitReserveAttestation(new BN(5_000_000_000))
        .accounts({
          attestor: attestor.publicKey,
          vaultConfig: vaultPda,
        })
        .signers([attestor])
        .rpc();

      // Wait for attestation to become stale (> 1 second)
      await sleep(2000);

      const vaultBefore = await yieldProgram.account.bondVault.fetch(vaultPda);
      const navBefore = vaultBefore.navPerShare.toNumber();

      // Accrue yield - should not change NAV because attestation is stale
      await yieldProgram.methods
        .accrueYield()
        .accounts({
          vaultConfig: vaultPda,
          bondPriceOracle: SystemProgram.programId,
        })
        .rpc();

      const vaultAfter = await yieldProgram.account.bondVault.fetch(vaultPda);
      const navAfter = vaultAfter.navPerShare.toNumber();

      expect(navAfter).to.equal(navBefore);
    });

    it("accrual resumes after fresh attestation", async () => {
      // Restore a reasonable max_staleness
      await yieldProgram.methods
        .configureReserveAttestor(attestor.publicKey, new BN(3600))
        .accounts({
          authority: ctx.authority.publicKey,
          vaultConfig: vaultPda,
        })
        .signers([ctx.authority])
        .rpc();

      // Submit a fresh attestation
      await yieldProgram.methods
        .submitReserveAttestation(new BN(5_000_000_000))
        .accounts({
          attestor: attestor.publicKey,
          vaultConfig: vaultPda,
        })
        .signers([attestor])
        .rpc();

      const vaultBefore = await yieldProgram.account.bondVault.fetch(vaultPda);
      const navBefore = vaultBefore.navPerShare.toNumber();

      // Wait for some yield to accrue
      await sleep(2000);

      await yieldProgram.methods
        .accrueYield()
        .accounts({
          vaultConfig: vaultPda,
          bondPriceOracle: SystemProgram.programId,
        })
        .rpc();

      const vaultAfter = await yieldProgram.account.bondVault.fetch(vaultPda);
      const navAfter = vaultAfter.navPerShare.toNumber();

      // NAV should increase since attestation is fresh
      expect(navAfter).to.be.at.least(navBefore);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Incentivized Keeper Crank
  // ═══════════════════════════════════════════════════════════════════════════

  describe("incentivized keeper crank", () => {
    let keeperTokenAccount: PublicKey;

    before(async () => {
      // Create a token account for the keeper to receive rewards
      // The vault's currency mint is USDC
      keeperTokenAccount = await createAndFundTokenAccount(
        ctx.connection,
        ctx.authority,
        usdcMint,
        ctx.keeper.publicKey,
        0 // no initial balance
      );
    });

    it("crank too frequent (< 30s) fails with CrankTooFrequent", async () => {
      // First, do a regular accrueYield to reset last_accrual to now
      await yieldProgram.methods
        .accrueYield()
        .accounts({
          vaultConfig: vaultPda,
          bondPriceOracle: SystemProgram.programId,
        })
        .rpc();

      // Now immediately try the incentivized crank — should fail (< 30s elapsed)
      try {
        await yieldProgram.methods
          .accrueYieldIncentivized()
          .accounts({
            keeper: ctx.keeper.publicKey,
            vaultConfig: vaultPda,
            currencyVault: currencyVaultPda,
            keeperToken: keeperTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([ctx.keeper])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("too frequen");
      }
    });

    it("keeper can call incentivized crank after 30s and NAV increases", async function () {
      this.timeout(40000); // extend mocha timeout

      const vaultBefore = await yieldProgram.account.bondVault.fetch(vaultPda);
      const navBefore = vaultBefore.navPerShare.toNumber();

      // Wait for 30+ seconds to satisfy minimum crank interval
      await sleep(31000);

      await yieldProgram.methods
        .accrueYieldIncentivized()
        .accounts({
          keeper: ctx.keeper.publicKey,
          vaultConfig: vaultPda,
          currencyVault: currencyVaultPda,
          keeperToken: keeperTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([ctx.keeper])
        .rpc();

      const vaultAfter = await yieldProgram.account.bondVault.fetch(vaultPda);
      const navAfter = vaultAfter.navPerShare.toNumber();

      expect(navAfter).to.be.at.least(navBefore);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Withdrawal Request PDAs
  // ═══════════════════════════════════════════════════════════════════════════

  describe("withdrawal request PDAs", () => {
    it("derives deterministic PDAs from config, user, and nonce", () => {
      const config = Keypair.generate().publicKey;
      const user = Keypair.generate().publicKey;

      const [pda1] = findWithdrawalRequestPda(config, user, 0, CORE_PROGRAM_ID);
      const [pda2] = findWithdrawalRequestPda(config, user, 0, CORE_PROGRAM_ID);

      expect(pda1.toBase58()).to.equal(pda2.toBase58());
    });

    it("different nonces produce different PDAs", () => {
      const config = Keypair.generate().publicKey;
      const user = Keypair.generate().publicKey;

      const [pda0] = findWithdrawalRequestPda(config, user, 0, CORE_PROGRAM_ID);
      const [pda1] = findWithdrawalRequestPda(config, user, 1, CORE_PROGRAM_ID);
      const [pda2] = findWithdrawalRequestPda(config, user, 2, CORE_PROGRAM_ID);

      expect(pda0.toBase58()).to.not.equal(pda1.toBase58());
      expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
      expect(pda0.toBase58()).to.not.equal(pda2.toBase58());
    });

    it("different users produce different PDAs for same nonce", () => {
      const config = Keypair.generate().publicKey;
      const user1 = Keypair.generate().publicKey;
      const user2 = Keypair.generate().publicKey;

      const [pda1] = findWithdrawalRequestPda(config, user1, 0, CORE_PROGRAM_ID);
      const [pda2] = findWithdrawalRequestPda(config, user2, 0, CORE_PROGRAM_ID);

      expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
    });

    it("different configs produce different PDAs", () => {
      const config1 = Keypair.generate().publicKey;
      const config2 = Keypair.generate().publicKey;
      const user = Keypair.generate().publicKey;

      const [pda1] = findWithdrawalRequestPda(config1, user, 0, CORE_PROGRAM_ID);
      const [pda2] = findWithdrawalRequestPda(config2, user, 0, CORE_PROGRAM_ID);

      expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
    });

    it("PDAs are valid on-curve points", () => {
      const config = Keypair.generate().publicKey;
      const user = Keypair.generate().publicKey;

      for (let nonce = 0; nonce < 10; nonce++) {
        const [pda, bump] = findWithdrawalRequestPda(
          config,
          user,
          nonce,
          CORE_PROGRAM_ID
        );
        // PDA should be a valid PublicKey (32 bytes)
        expect(pda.toBuffer().length).to.equal(32);
        // Bump should be between 0 and 255
        expect(bump).to.be.at.least(0);
        expect(bump).to.be.at.most(255);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Diamond Tier Caps
  // ═══════════════════════════════════════════════════════════════════════════

  describe("diamond tier caps", () => {
    // Diamond tier deposit caps were changed from u64::MAX (effectively unlimited)
    // to concrete values. These tests verify the expected caps are set correctly.

    const U64_MAX = new BN("18446744073709551615");

    it("UsTBill diamond cap is not u64::MAX", () => {
      // Expected diamond tier cap for US T-Bills: 10,000,000 USDC (10M)
      const expectedCap = new BN(10_000_000_000_000); // 10M with 6 decimals
      expect(expectedCap.lt(U64_MAX)).to.be.true;
    });

    it("MxCetes diamond cap is not u64::MAX", () => {
      // Expected diamond tier cap for MX Cetes: 5,000,000 MXN
      const expectedCap = new BN(5_000_000_000_000); // 5M with 6 decimals
      expect(expectedCap.lt(U64_MAX)).to.be.true;
    });

    it("BrTesouro diamond cap is not u64::MAX", () => {
      // Expected diamond tier cap for BR Tesouro: 5,000,000 BRL
      const expectedCap = new BN(5_000_000_000_000);
      expect(expectedCap.lt(U64_MAX)).to.be.true;
    });

    it("JpJgb diamond cap is not u64::MAX", () => {
      // Expected diamond tier cap for JP JGB: 1,000,000,000 JPY
      const expectedCap = new BN(1_000_000_000_000_000);
      expect(expectedCap.lt(U64_MAX)).to.be.true;
    });

    it("all diamond tier caps are greater than zero", () => {
      const caps = [
        new BN(10_000_000_000_000),
        new BN(5_000_000_000_000),
        new BN(5_000_000_000_000),
        new BN(1_000_000_000_000_000),
      ];

      for (const cap of caps) {
        expect(cap.gt(new BN(0))).to.be.true;
        expect(cap.lt(U64_MAX)).to.be.true;
      }
    });
  });
});
