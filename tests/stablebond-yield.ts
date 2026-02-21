import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import {
  setupTestContext,
  createAndFundTokenAccount,
  getTokenBalance,
  BondType,
  BOND_TYPE_U8,
  YIELD_PROGRAM_ID,
  findBondVaultPda,
  findBondShareMintPda,
  findBondCurrencyVaultPda,
  findUserSharesPda,
  TestContext,
} from "./helpers/setup";

describe("stablebond-yield", () => {
  let provider: anchor.AnchorProvider;
  let program: Program;
  let ctx: TestContext;
  let usdcMint: PublicKey;

  before(async () => {
    provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    program = anchor.workspace.StablebondYield as Program;
    ctx = await setupTestContext(provider);
    usdcMint = ctx.usdcMint;
  });

  describe("initialize_vault", () => {
    it("initializes a US T-Bill vault", async () => {
      const [vaultPda] = findBondVaultPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.UsTBill,
        program.programId
      );
      const [shareMintPda] = findBondShareMintPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.UsTBill,
        program.programId
      );
      const [currencyVaultPda] = findBondCurrencyVaultPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.UsTBill,
        program.programId
      );

      await program.methods
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

      const vault = await program.account.bondVault.fetch(vaultPda);
      expect(vault.authority.toBase58()).to.equal(
        ctx.authority.publicKey.toBase58()
      );
      expect(vault.targetApyBps).to.equal(450);
      expect(vault.navPerShare.toNumber()).to.equal(1_000_000);
      expect(vault.totalDeposits.toNumber()).to.equal(0);
      expect(vault.totalShares.toNumber()).to.equal(0);
      expect(vault.isActive).to.be.true;
    });

    it("initializes a JP JGB vault", async () => {
      const [vaultPda] = findBondVaultPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.JpJgb,
        program.programId
      );
      const [shareMintPda] = findBondShareMintPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.JpJgb,
        program.programId
      );
      const [currencyVaultPda] = findBondCurrencyVaultPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.JpJgb,
        program.programId
      );

      await program.methods
        .initializeVault(BondType.JpJgb, 40, 40, new BN(0))
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

      const vault = await program.account.bondVault.fetch(vaultPda);
      expect(vault.targetApyBps).to.equal(40);
    });

    it("rejects APY above 50%", async () => {
      const [vaultPda] = findBondVaultPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.MxCetes,
        program.programId
      );
      const [shareMintPda] = findBondShareMintPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.MxCetes,
        program.programId
      );
      const [currencyVaultPda] = findBondCurrencyVaultPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.MxCetes,
        program.programId
      );

      try {
        await program.methods
          .initializeVault(BondType.MxCetes, 5001, 5001, new BN(0))
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
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("InvalidApy");
      }
    });
  });

  describe("deposit & withdraw", () => {
    let userCurrency: PublicKey;
    let userSharesAta: PublicKey;
    let vaultPda: PublicKey;
    let shareMintPda: PublicKey;
    let currencyVaultPda: PublicKey;
    let userSharesPda: PublicKey;

    before(async () => {
      [vaultPda] = findBondVaultPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.UsTBill,
        program.programId
      );
      [shareMintPda] = findBondShareMintPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.UsTBill,
        program.programId
      );
      [currencyVaultPda] = findBondCurrencyVaultPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.UsTBill,
        program.programId
      );
      [userSharesPda] = findUserSharesPda(
        vaultPda,
        ctx.user.publicKey,
        program.programId
      );

      userCurrency = await createAndFundTokenAccount(
        ctx.connection,
        ctx.authority,
        usdcMint,
        ctx.user.publicKey,
        10_000_000_000
      );

      userSharesAta = await createAccount(
        ctx.connection,
        ctx.user,
        shareMintPda,
        ctx.user.publicKey
      );
    });

    it("deposits USDC and receives shares at 1:1 NAV", async () => {
      const depositAmount = 1_000_000_000;

      await program.methods
        .deposit(new BN(depositAmount))
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

      const vault = await program.account.bondVault.fetch(vaultPda);
      expect(vault.totalDeposits.toNumber()).to.equal(depositAmount);
      expect(vault.totalShares.toNumber()).to.equal(depositAmount);

      const shareBalance = await getTokenBalance(ctx.connection, userSharesAta);
      expect(Number(shareBalance)).to.equal(depositAmount);
    });

    it("rejects zero deposit", async () => {
      try {
        await program.methods
          .deposit(new BN(0))
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
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("ZeroDeposit");
      }
    });

    it("withdraws shares and receives USDC", async () => {
      const withdrawShares = 500_000_000;

      await program.methods
        .withdraw(new BN(withdrawShares))
        .accounts({
          user: ctx.user.publicKey,
          vaultConfig: vaultPda,
          currencyVault: currencyVaultPda,
          shareMint: shareMintPda,
          userCurrency,
          userSharesAta,
          userShares: userSharesPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([ctx.user])
        .rpc();

      const vault = await program.account.bondVault.fetch(vaultPda);
      expect(vault.totalShares.toNumber()).to.equal(500_000_000);

      const shareBalance = await getTokenBalance(ctx.connection, userSharesAta);
      expect(Number(shareBalance)).to.equal(500_000_000);
    });

    it("rejects withdrawal exceeding balance", async () => {
      try {
        await program.methods
          .withdraw(new BN(999_999_999_999))
          .accounts({
            user: ctx.user.publicKey,
            vaultConfig: vaultPda,
            currencyVault: currencyVaultPda,
            shareMint: shareMintPda,
            userCurrency,
            userSharesAta,
            userShares: userSharesPda,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([ctx.user])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("InsufficientShares");
      }
    });
  });

  describe("accrue_yield", () => {
    it("accrues yield based on time elapsed", async () => {
      const [vaultPda] = findBondVaultPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.UsTBill,
        program.programId
      );

      const vaultBefore = await program.account.bondVault.fetch(vaultPda);
      const navBefore = vaultBefore.navPerShare.toNumber();

      await new Promise((resolve) => setTimeout(resolve, 2000));

      await program.methods
        .accrueYield()
        .accounts({
          vaultConfig: vaultPda,
        })
        .rpc();

      const vaultAfter = await program.account.bondVault.fetch(vaultPda);
      const navAfter = vaultAfter.navPerShare.toNumber();

      expect(navAfter).to.be.at.least(navBefore);
    });

    it("stops accruing after maturity date", async () => {
      const pastMaturity = Math.floor(Date.now() / 1000) - 86400;

      const [vaultPda] = findBondVaultPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.BrTesouro,
        program.programId
      );
      const [shareMintPda] = findBondShareMintPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.BrTesouro,
        program.programId
      );
      const [currencyVaultPda] = findBondCurrencyVaultPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.BrTesouro,
        program.programId
      );

      await program.methods
        .initializeVault(
          BondType.BrTesouro,
          1300,
          1300,
          new BN(pastMaturity)
        )
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

      const vaultBefore = await program.account.bondVault.fetch(vaultPda);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      await program.methods.accrueYield().accounts({ vaultConfig: vaultPda }).rpc();

      const vaultAfter = await program.account.bondVault.fetch(vaultPda);

      expect(vaultAfter.navPerShare.toNumber()).to.equal(
        vaultBefore.navPerShare.toNumber()
      );
    });
  });

  describe("update_apy", () => {
    it("authority can update APY", async () => {
      const [vaultPda] = findBondVaultPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.UsTBill,
        program.programId
      );

      await program.methods
        .updateApy(500)
        .accounts({
          authority: ctx.authority.publicKey,
          vaultConfig: vaultPda,
        })
        .signers([ctx.authority])
        .rpc();

      const vault = await program.account.bondVault.fetch(vaultPda);
      expect(vault.targetApyBps).to.equal(500);
    });

    it("non-authority cannot update APY", async () => {
      const [vaultPda] = findBondVaultPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.UsTBill,
        program.programId
      );

      try {
        await program.methods
          .updateApy(600)
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
  });

  describe("multi-bond vaults", () => {
    it("each bond type gets its own independent vault", async () => {
      const [tbillVault] = findBondVaultPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.UsTBill,
        program.programId
      );
      const [jgbVault] = findBondVaultPda(
        ctx.authority.publicKey,
        BOND_TYPE_U8.JpJgb,
        program.programId
      );

      const tbill = await program.account.bondVault.fetch(tbillVault);
      const jgb = await program.account.bondVault.fetch(jgbVault);

      expect(tbill.targetApyBps).to.not.equal(jgb.targetApyBps);
      expect(tbillVault.toBase58()).to.not.equal(jgbVault.toBase58());
    });
  });
});
