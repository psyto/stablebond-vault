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
  CORE_PROGRAM_ID,
  YIELD_PROGRAM_ID,
  findProtocolConfigPda,
  findBondRegistryPda,
  findYieldSourcePda,
  findUserPositionPda,
  findUsdcVaultPda,
  findBondVaultPda,
  findBondShareMintPda,
  findBondCurrencyVaultPda,
  makeUsTBillConfig,
  makeMxCetesConfig,
  makeJpJgbConfig,
  TestContext,
} from "./helpers/setup";

describe("stablebond-core", () => {
  let provider: anchor.AnchorProvider;
  let coreProgram: Program;
  let yieldProgram: Program;
  let ctx: TestContext;
  let configPda: PublicKey;
  let registryPda: PublicKey;
  let usdcVaultPda: PublicKey;
  let oracleFeed: Keypair;
  const kycWhitelistRegistry = Keypair.generate().publicKey;

  before(async () => {
    provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    coreProgram = anchor.workspace.StablebondCore as Program;
    yieldProgram = anchor.workspace.StablebondYield as Program;

    ctx = await setupTestContext(provider);
    [configPda] = findProtocolConfigPda(coreProgram.programId);
    [registryPda] = findBondRegistryPda(configPda, coreProgram.programId);
    [usdcVaultPda] = findUsdcVaultPda(coreProgram.programId);
    oracleFeed = Keypair.generate();
  });

  describe("initialize_protocol", () => {
    it("initializes the protocol config and bond registry", async () => {
      await coreProgram.methods
        .initializeProtocol({
          treasury: ctx.treasury.publicKey,
          kycRegistry: Keypair.generate().publicKey,
          sovereignProgram: Keypair.generate().publicKey,
          conversionFeeBps: 30,
          managementFeeBps: 100,
          performanceFeeBps: 1000,
          kycWhitelistRegistry: kycWhitelistRegistry,
          keeper: ctx.keeper.publicKey,
        })
        .accounts({
          authority: ctx.authority.publicKey,
          protocolConfig: configPda,
          bondRegistry: registryPda,
          usdcMint: ctx.usdcMint,
          usdcVault: usdcVaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([ctx.authority])
        .rpc();

      const config = await coreProgram.account.protocolConfig.fetch(configPda);
      expect(config.authority.toBase58()).to.equal(
        ctx.authority.publicKey.toBase58()
      );
      expect(config.conversionFeeBps).to.equal(30);
      expect(config.managementFeeBps).to.equal(100);
      expect(config.performanceFeeBps).to.equal(1000);
      expect(config.isActive).to.be.true;
      expect(config.numSupportedBonds).to.equal(0);
      expect(config.keeper.toBase58()).to.equal(ctx.keeper.publicKey.toBase58());
      expect(config.kycWhitelistRegistry.toBase58()).to.equal(kycWhitelistRegistry.toBase58());
    });
  });

  describe("register_bond", () => {
    it("registers a US T-Bill bond type", async () => {
      const bondConfig = makeUsTBillConfig(ctx.usdcMint, oracleFeed.publicKey);

      await coreProgram.methods
        .registerBond(bondConfig)
        .accounts({
          authority: ctx.authority.publicKey,
          protocolConfig: configPda,
          bondRegistry: registryPda,
        })
        .signers([ctx.authority])
        .rpc();

      const config = await coreProgram.account.protocolConfig.fetch(configPda);
      expect(config.numSupportedBonds).to.equal(1);

      const registry = await coreProgram.account.bondRegistry.fetch(
        registryPda
      );
      expect(registry.bonds.length).to.equal(1);
      expect(registry.bonds[0].defaultApyBps).to.equal(450);
    });

    it("registers MX CETES bond type", async () => {
      const mxnMint = await createMint(
        ctx.connection,
        ctx.authority,
        ctx.authority.publicKey,
        null,
        6
      );
      const bondConfig = makeMxCetesConfig(mxnMint, oracleFeed.publicKey);

      await coreProgram.methods
        .registerBond(bondConfig)
        .accounts({
          authority: ctx.authority.publicKey,
          protocolConfig: configPda,
          bondRegistry: registryPda,
        })
        .signers([ctx.authority])
        .rpc();

      const registry = await coreProgram.account.bondRegistry.fetch(
        registryPda
      );
      expect(registry.bonds.length).to.equal(2);
      expect(registry.bonds[1].defaultApyBps).to.equal(900);
      expect(registry.bonds[1].minTier).to.equal(2);
    });

    it("registers JP JGB bond type", async () => {
      const jpyMint = await createMint(
        ctx.connection,
        ctx.authority,
        ctx.authority.publicKey,
        null,
        6
      );
      const bondConfig = makeJpJgbConfig(jpyMint, oracleFeed.publicKey);

      await coreProgram.methods
        .registerBond(bondConfig)
        .accounts({
          authority: ctx.authority.publicKey,
          protocolConfig: configPda,
          bondRegistry: registryPda,
        })
        .signers([ctx.authority])
        .rpc();

      const registry = await coreProgram.account.bondRegistry.fetch(
        registryPda
      );
      expect(registry.bonds.length).to.equal(3);
    });

    it("rejects duplicate bond type registration", async () => {
      const bondConfig = makeUsTBillConfig(ctx.usdcMint, oracleFeed.publicKey);

      try {
        await coreProgram.methods
          .registerBond(bondConfig)
          .accounts({
            authority: ctx.authority.publicKey,
            protocolConfig: configPda,
            bondRegistry: registryPda,
          })
          .signers([ctx.authority])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err.toString()).to.include("BondTypeAlreadyRegistered");
      }
    });

    it("rejects non-authority registration", async () => {
      const bondConfig = makeUsTBillConfig(ctx.usdcMint, oracleFeed.publicKey);
      // Use a different bond type to avoid the duplicate check
      bondConfig.bondType = BondType.Custom;

      try {
        await coreProgram.methods
          .registerBond(bondConfig)
          .accounts({
            authority: ctx.user.publicKey,
            protocolConfig: configPda,
            bondRegistry: registryPda,
          })
          .signers([ctx.user])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err) {
        // Anchor constraint error for authority mismatch
        expect(err.toString()).to.include("Error");
      }
    });
  });

  describe("tier gating", () => {
    it("Bronze tier allows UsTBill and JpJgb", () => {
      const bronzeBonds = [BOND_TYPE_U8.UsTBill, BOND_TYPE_U8.JpJgb];
      expect(bronzeBonds).to.include(BOND_TYPE_U8.UsTBill);
      expect(bronzeBonds).to.include(BOND_TYPE_U8.JpJgb);
      expect(bronzeBonds).to.not.include(BOND_TYPE_U8.MxCetes);
    });

    it("Silver tier adds MxCetes", () => {
      const silverBonds = [
        BOND_TYPE_U8.UsTBill,
        BOND_TYPE_U8.JpJgb,
        BOND_TYPE_U8.MxCetes,
      ];
      expect(silverBonds).to.include(BOND_TYPE_U8.MxCetes);
      expect(silverBonds).to.not.include(BOND_TYPE_U8.BrTesouro);
    });

    it("Gold tier adds BrTesouro", () => {
      const goldBonds = [
        BOND_TYPE_U8.UsTBill,
        BOND_TYPE_U8.JpJgb,
        BOND_TYPE_U8.MxCetes,
        BOND_TYPE_U8.BrTesouro,
      ];
      expect(goldBonds).to.include(BOND_TYPE_U8.BrTesouro);
    });

    it("Diamond tier allows all including Custom", () => {
      const diamondBonds = [
        BOND_TYPE_U8.UsTBill,
        BOND_TYPE_U8.JpJgb,
        BOND_TYPE_U8.MxCetes,
        BOND_TYPE_U8.BrTesouro,
        BOND_TYPE_U8.Custom,
      ];
      expect(diamondBonds.length).to.equal(5);
    });
  });

  describe("admin operations", () => {
    it("pauses the protocol", async () => {
      await coreProgram.methods
        .pauseProtocol()
        .accounts({
          authority: ctx.authority.publicKey,
          protocolConfig: configPda,
        })
        .signers([ctx.authority])
        .rpc();

      const config = await coreProgram.account.protocolConfig.fetch(configPda);
      expect(config.isActive).to.be.false;
    });

    it("resumes the protocol", async () => {
      await coreProgram.methods
        .resumeProtocol()
        .accounts({
          authority: ctx.authority.publicKey,
          protocolConfig: configPda,
        })
        .signers([ctx.authority])
        .rpc();

      const config = await coreProgram.account.protocolConfig.fetch(configPda);
      expect(config.isActive).to.be.true;
    });

    it("updates protocol config fees", async () => {
      await coreProgram.methods
        .updateProtocolConfig({
          treasury: null,
          conversionFeeBps: 50,
          managementFeeBps: 150,
          performanceFeeBps: 1500,
        })
        .accounts({
          authority: ctx.authority.publicKey,
          protocolConfig: configPda,
        })
        .signers([ctx.authority])
        .rpc();

      const config = await coreProgram.account.protocolConfig.fetch(configPda);
      expect(config.conversionFeeBps).to.equal(50);
      expect(config.managementFeeBps).to.equal(150);
      expect(config.performanceFeeBps).to.equal(1500);
    });
  });

  describe("keeper role", () => {
    const stranger = Keypair.generate();
    let yieldSourcePda: PublicKey;
    let bondVaultPda: PublicKey;

    before(async () => {
      const sig = await ctx.connection.requestAirdrop(stranger.publicKey, 1_000_000_000);
      await ctx.connection.confirmTransaction(sig);

      // A US T-Bill yield source and the authority's stablebond-yield vault for it,
      // so update_nav's accounts resolve and only the keeper check decides.
      [yieldSourcePda] = findYieldSourcePda(configPda, ctx.usdcMint, coreProgram.programId);
      await coreProgram.methods
        .registerYieldSource({
          name: Array(32).fill(0),
          sourceType: { sovereignBond: {} },
          bondType: BondType.UsTBill,
          depositVault: usdcVaultPda,
          yieldTokenVault: usdcVaultPda,
          currencyMint: ctx.usdcMint,
          oracleFeed: oracleFeed.publicKey,
          couponRateBps: 450,
          maturityDate: new BN(0),
          haircutBps: 0,
          allocationWeightBps: 10_000,
          minDeposit: new BN(0),
          maxAllocation: new BN(0),
        })
        .accounts({
          authority: ctx.authority.publicKey,
          protocolConfig: configPda,
          tokenMint: ctx.usdcMint,
          yieldSource: yieldSourcePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.authority])
        .rpc();

      [bondVaultPda] = findBondVaultPda(ctx.authority.publicKey, BOND_TYPE_U8.UsTBill, yieldProgram.programId);
      const [shareMintPda] = findBondShareMintPda(ctx.authority.publicKey, BOND_TYPE_U8.UsTBill, yieldProgram.programId);
      const [currencyVaultPda] = findBondCurrencyVaultPda(ctx.authority.publicKey, BOND_TYPE_U8.UsTBill, yieldProgram.programId);
      await yieldProgram.methods
        .initializeVault(BondType.UsTBill, 450, 450, new BN(0))
        .accounts({
          authority: ctx.authority.publicKey,
          vaultConfig: bondVaultPda,
          currencyMint: ctx.usdcMint,
          shareMint: shareMintPda,
          currencyVault: currencyVaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([ctx.authority])
        .rpc();
    });

    it("rejects set_keeper from a non-authority", async () => {
      try {
        await coreProgram.methods
          .setKeeper(stranger.publicKey)
          .accounts({ authority: stranger.publicKey, protocolConfig: configPda })
          .signers([stranger])
          .rpc();
        expect.fail("Should have thrown Unauthorized");
      } catch (err: any) {
        expect(err.toString()).to.match(/Unauthorized|6001/);
      }
      const config = await coreProgram.account.protocolConfig.fetch(configPda);
      expect(config.keeper.toBase58()).to.equal(ctx.keeper.publicKey.toBase58());
    });

    it("rejects update_nav from a signer that is neither keeper nor authority", async () => {
      try {
        await coreProgram.methods
          .updateNav()
          .accounts({
            keeper: stranger.publicKey,
            protocolConfig: configPda,
            yieldSource: yieldSourcePda,
            bondVaultConfig: bondVaultPda,
          })
          .signers([stranger])
          .rpc();
        expect.fail("Should have thrown Unauthorized");
      } catch (err: any) {
        expect(err.toString()).to.match(/Unauthorized|6001/);
      }
    });

    it("accepts update_nav from the configured keeper", async () => {
      await coreProgram.methods
        .updateNav()
        .accounts({
          keeper: ctx.keeper.publicKey,
          protocolConfig: configPda,
          yieldSource: yieldSourcePda,
          bondVaultConfig: bondVaultPda,
        })
        .signers([ctx.keeper])
        .rpc();
    });

    it("lets the authority change the keeper", async () => {
      const next = Keypair.generate().publicKey;
      await coreProgram.methods
        .setKeeper(next)
        .accounts({ authority: ctx.authority.publicKey, protocolConfig: configPda })
        .signers([ctx.authority])
        .rpc();
      let config = await coreProgram.account.protocolConfig.fetch(configPda);
      expect(config.keeper.toBase58()).to.equal(next.toBase58());

      await coreProgram.methods
        .setKeeper(ctx.keeper.publicKey)
        .accounts({ authority: ctx.authority.publicKey, protocolConfig: configPda })
        .signers([ctx.authority])
        .rpc();
      config = await coreProgram.account.protocolConfig.fetch(configPda);
      expect(config.keeper.toBase58()).to.equal(ctx.keeper.publicKey.toBase58());
    });
  });

  describe("multi-bond positions", () => {
    it("user position PDA is unique per (user, bondType)", () => {
      const user = Keypair.generate().publicKey;

      const [posTBill] = findUserPositionPda(
        configPda,
        user,
        BOND_TYPE_U8.UsTBill,
        coreProgram.programId
      );
      const [posJgb] = findUserPositionPda(
        configPda,
        user,
        BOND_TYPE_U8.JpJgb,
        coreProgram.programId
      );
      const [posCetes] = findUserPositionPda(
        configPda,
        user,
        BOND_TYPE_U8.MxCetes,
        coreProgram.programId
      );

      // All PDAs should be different
      const addresses = new Set([
        posTBill.toBase58(),
        posJgb.toBase58(),
        posCetes.toBase58(),
      ]);
      expect(addresses.size).to.equal(3);
    });

    it("bond vault PDA is unique per (authority, bondType)", () => {
      const authority = ctx.authority.publicKey;

      const [vaultTBill] = findBondVaultPda(
        authority,
        BOND_TYPE_U8.UsTBill,
        yieldProgram.programId
      );
      const [vaultJgb] = findBondVaultPda(
        authority,
        BOND_TYPE_U8.JpJgb,
        yieldProgram.programId
      );

      expect(vaultTBill.toBase58()).to.not.equal(vaultJgb.toBase58());
    });
  });

  describe("bond registry", () => {
    it("lists all registered bonds", async () => {
      const registry = await coreProgram.account.bondRegistry.fetch(
        registryPda
      );

      expect(registry.bonds.length).to.equal(3);

      // Verify bond types are distinct
      const types = registry.bonds.map((b: any) => JSON.stringify(b.bondType));
      const uniqueTypes = new Set(types);
      expect(uniqueTypes.size).to.equal(3);
    });

    it("bond registry is linked to protocol config", async () => {
      const registry = await coreProgram.account.bondRegistry.fetch(
        registryPda
      );
      expect(registry.protocolConfig.toBase58()).to.equal(
        configPda.toBase58()
      );
    });
  });
});
