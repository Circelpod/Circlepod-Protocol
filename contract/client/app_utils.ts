import * as anchor from '@project-serum/anchor';
import {Keypair, PublicKey} from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import * as serumCmn from '@project-serum/common';
import {TokenInstructions} from '@project-serum/serum';
import {NodeWallet, SendTxRequest} from '@project-serum/common';
import {Balances, MemberAccount} from './types/member_account';

// Devnet
export const connection = new anchor.web3.Connection(
  'https://api.devnet.solana.com',
);
export const provider = new anchor.Provider(
  connection,
  NodeWallet.local(),
  anchor.Provider.defaultOptions(),
);

export const tokenMint = '5QhsyriyneDvoZCt9Cji5GyrXRZ1pfBoj372PQbZ3eVz';
export const tokenAccount = 'CFF4SPAaXYDYMnsQe1KFKbTm7zULD4i9SRA1y6X3VJUS';

// Local
// export const provider = anchor.Provider.local();
// export const tokenMint = 'GJ65oHuFLo3K48CU3MUJk4mjqDsBpNReKttnwptdTfX4';
// export const tokenAccount = 'FdsYvUaa61sYxMiDXHFGDyQLjHewppLRoLHaWEtR2HsF';

export const LOCKUP_Program_ID = 'HLVA2NmjGBsoKCwmGZg1zAYXFxMhKXRMf7V28RexGpcR';
export const REGISTRY_Program_ID =
  '4wcKkwjthmfHd7CZNsCxnyZoEiujBLbDvJ7jDFjqoiKm';

export async function initRegistryProgram(provider: anchor.Provider) {
  const registry = getRegistryProgram(provider);
  await registry.state.rpc.new({
    accounts: {
      lockupProgram: (await getLockupInfo(provider)).programId,
    },
  });
}

export async function createsVestingAccount(
  provider: anchor.Provider,
  account: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
): Promise<[anchor.web3.PublicKey, any, anchor.web3.PublicKey]> {
  console.log(`-----Start Creates Vesting Account-----`);

  const program = await getLockupInfo(provider);

  const vesting = anchor.web3.Keypair.generate();

  const startTs = new anchor.BN(Date.now() / 1000);
  const endTs = new anchor.BN(startTs.toNumber() + 5);
  const periodCount = new anchor.BN(2);
  const beneficiary = provider.wallet.publicKey;
  const depositAmount = new anchor.BN(100);

  const vault = anchor.web3.Keypair.generate();
  const [vestingSigner, nonce] = await anchor.web3.PublicKey.findProgramAddress(
    [vesting.publicKey.toBuffer()],
    program.programId,
  );

  await program.rpc.createVesting(
    beneficiary,
    depositAmount,
    nonce,
    startTs,
    endTs,
    periodCount,
    null,
    {
      accounts: {
        vesting: vesting.publicKey,
        vault: vault.publicKey,
        depositor: account,
        depositorAuthority: provider.wallet.publicKey,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
      signers: [vesting, vault],
      instructions: [
        await program.account.vesting.createInstruction(vesting),
        ...(await serumCmn.createTokenAccountInstrs(
          provider,
          vault.publicKey,
          mint,
          vestingSigner,
        )),
      ],
    },
  );

  await serumCmn.sleep(30000);

  const vestingAccount: any = await program.account.vesting.fetch(
    vesting.publicKey,
  );

  console.log(`Start: ${new Date(startTs.toNumber() * 1000).toISOString()}`);
  console.log(`End: ${new Date(endTs.toNumber() * 1000).toISOString()}`);
  console.log(`PeriodCount: ${periodCount.toNumber()}`);
  console.log(`Beneficiary: ${provider.wallet.publicKey.toString()}`);
  console.log(`Deposit Amount: ${depositAmount.toNumber()}`);
  console.log(`Depositor: ${account.toString()}`);
  console.log(`Depositor Authority: ${provider.wallet.publicKey.toString()}`);
  console.log(`Vesting PublicKey: ${vesting.publicKey.toString()}`);
  console.log(`VestingSigner: ${vestingSigner.toString()}`);

  console.log(`VestingAccount.beneficiary: ${vestingAccount.beneficiary}`);
  console.log(`VestingAccount.mint: ${vestingAccount.mint}`);
  console.log(`VestingAccount.grantor: ${vestingAccount.grantor}`);
  console.log(`VestingAccount.outstanding: ${vestingAccount.outstanding}`);
  console.log(`VestingAccount.startBalance: ${vestingAccount.startBalance}`);
  console.log(
    `VestingAccount.whitelistOwned: ${vestingAccount.whitelistOwned}`,
  );
  console.log(
    `VestingAccount.createdTs: ${new Date(
      vestingAccount.createdTs.toNumber() * 1000,
    ).toISOString()}`,
  );
  console.log(
    `VestingAccount.startTs: ${new Date(
      vestingAccount.startTs.toNumber() * 1000,
    ).toISOString()}`,
  );
  console.log(
    `VestingAccount.endTs: ${new Date(
      vestingAccount.endTs.toNumber() * 1000,
    ).toISOString()}`,
  );
  console.log(`VestingAccount.realizor: ${vestingAccount.realizor}`);

  const vaultAccount = await serumCmn.getTokenAccount(
    provider,
    vestingAccount.vault,
  );

  console.log(`Vault Account Amount: ${vaultAccount.amount.toNumber()}`);

  console.log(`-----End Creates Vesting Account-----`);

  return [vesting.publicKey, vestingAccount, vestingSigner];
}

export async function createsRegistryGenesis(
  provider: anchor.Provider,
): Promise<
  [anchor.web3.PublicKey, number, anchor.web3.Keypair, anchor.web3.PublicKey]
> {
  const registry = getRegistryProgram(provider);

  console.log(`-----Start Creates Registry Genesis-----`);

  const registrar = anchor.web3.Keypair.generate();

  const [
    registrarSigner,
    _nonce,
  ] = await anchor.web3.PublicKey.findProgramAddress(
    [registrar.publicKey.toBuffer()],
    registry.programId,
  );

  const poolMint = await serumCmn.createMint(provider, registrarSigner);
  console.log(`PoolMint: ${poolMint.toString()}`);
  console.log(`Registrar: ${registrar.publicKey.toString()}`);
  console.log(`RegistrarSigner: ${registrarSigner.toString()}`);
  console.log(`Nonce: ${_nonce}`);

  console.log(`-----End Creates Registry Genesis-----`);

  return [poolMint, _nonce, registrar, registrarSigner];
}

export async function initializesRegistrar(
  mint: PublicKey,
  nonce: number,
  registrar: Keypair,
  poolMint: PublicKey,
  provider: anchor.Provider,
): Promise<Keypair> {
  console.log(`-----Start Initializes Registrar-----`);

  const registry = getRegistryProgram(provider);

  const stakeRate = new anchor.BN(1);
  const rewardQLen = 170;
  const rewardQ = anchor.web3.Keypair.generate();

  const withdrawalTimelock = new anchor.BN(4);

  await registry.rpc.initialize(
    mint,
    provider.wallet.publicKey,
    nonce,
    withdrawalTimelock,
    stakeRate,
    rewardQLen,
    {
      accounts: {
        registrar: registrar.publicKey,
        poolMint,
        rewardEventQ: rewardQ.publicKey,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [registrar, rewardQ],
      instructions: [
        await registry.account.registrar.createInstruction(registrar),
        await registry.account.rewardQueue.createInstruction(rewardQ, 8250),
      ],
    },
  );

  await serumCmn.sleep(30000);

  const registrarAccount: any = await registry.account.registrar.fetch(
    registrar.publicKey,
  );

  console.log(`provider.wallet.publicKey: ${provider.wallet.publicKey}`);
  console.log(`RegistrarAccount Authority: ${registrarAccount.authority}`);
  console.log(`RegistrarAccount Nonce: ${nonce}`);
  console.log(`RegistrarAccount Mint: ${mint}`);
  console.log(`RegistrarAccount PoolMint: ${poolMint}`);
  console.log(`RegistrarAccount StakeRate: ${stakeRate}`);
  console.log(`RegistrarAccount RewardEventQ: ${rewardQ.publicKey}`);
  console.log(`RegistrarAccount WithdrawalTimelock: ${withdrawalTimelock}`);

  console.log(`-----End Initializes Registrar-----`);

  return rewardQ;
}

export async function createsMember(
  member: Keypair,
  registrar: PublicKey,
  provider: anchor.Provider,
  registry: anchor.Program,
): Promise<[MemberAccount, PublicKey]> {
  console.log(`-----Start Creates Member-----`);

  const registrarAccount: any = await registry.account.registrar.fetch(
    registrar,
  );

  const [memberSigner, nonce] = await anchor.web3.PublicKey.findProgramAddress(
    [registrar.toBuffer(), member.publicKey.toBuffer()],
    registry.programId,
  );

  const [mainTx, balances] = await createBalanceSandbox(
    provider,
    registrarAccount,
    memberSigner,
  );
  const [lockedTx, balancesLocked] = await createBalanceSandbox(
    provider,
    registrarAccount,
    memberSigner,
  );

  const tx = registry.transaction.createMember(nonce, {
    accounts: {
      registrar: registrar,
      member: member.publicKey,
      beneficiary: provider.wallet.publicKey,
      memberSigner,
      balances,
      balancesLocked,
      tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    },
    instructions: [await registry.account.member.createInstruction(member)],
  });

  const signers = [member, (provider.wallet as any).payer];

  const allTxs: SendTxRequest[] = [mainTx as any, lockedTx, {tx, signers}];

  const txSigs = await provider.sendAll(allTxs);

  const memberAccount: any = await registry.account.member.fetch(
    member.publicKey,
  );

  console.log(`memberAccount.registrar: ${memberAccount.registrar}`);
  console.log(`memberAccount.beneficiary: ${provider.wallet.publicKey}`);
  console.log(`memberAccount.registrar: ${registrar}`);
  console.log(`memberAccount.metadata: ${memberAccount.metadata}`);

  console.log(
    `memberAccount.balances: ${JSON.stringify(memberAccount.balances)}`,
  );
  console.log(`balances: ${JSON.stringify(balances)}`);

  console.log(
    `memberAccount.balancesLocked: ${JSON.stringify(
      memberAccount.balancesLocked,
    )}`,
  );
  console.log(`balances: ${JSON.stringify(balancesLocked)}`);

  console.log(`memberAccount.rewardsCursor: ${memberAccount.rewardsCursor}`);
  console.log(`memberAccount.lastStakeTs: ${memberAccount.lastStakeTs}`);

  console.log(`-----End Creates Member-----`);

  return [memberAccount, memberSigner];
}

async function createBalanceSandbox(
  provider: anchor.Provider,
  r: any,
  registrySigner: anchor.web3.PublicKey,
) {
  const spt = anchor.web3.Keypair.generate();
  const vault = anchor.web3.Keypair.generate();
  const vaultStake = anchor.web3.Keypair.generate();
  const vaultPw = anchor.web3.Keypair.generate();

  const lamports = await provider.connection.getMinimumBalanceForRentExemption(
    165,
  );

  const createSptIx = await serumCmn.createTokenAccountInstrs(
    provider,
    spt.publicKey,
    r.poolMint,
    registrySigner,
    lamports,
  );
  const createVaultIx = await serumCmn.createTokenAccountInstrs(
    provider,
    vault.publicKey,
    r.mint,
    registrySigner,
    lamports,
  );
  const createVaultStakeIx = await serumCmn.createTokenAccountInstrs(
    provider,
    vaultStake.publicKey,
    r.mint,
    registrySigner,
    lamports,
  );
  const createVaultPwIx = await serumCmn.createTokenAccountInstrs(
    provider,
    vaultPw.publicKey,
    r.mint,
    registrySigner,
    lamports,
  );
  const tx0 = new anchor.web3.Transaction();
  tx0.add(
    ...createSptIx,
    ...createVaultIx,
    ...createVaultStakeIx,
    ...createVaultPwIx,
  );
  const signers0 = [spt, vault, vaultStake, vaultPw];

  const tx = {tx: tx0, signers: signers0};

  return [
    tx,
    {
      spt: spt.publicKey,
      vault: vault.publicKey,
      vaultStake: vaultStake.publicKey,
      vaultPw: vaultPw.publicKey,
    },
  ];
}

async function depositsUnlockedMemberByUnlocked(
  memberPublicKey: PublicKey,
  memberAccount: MemberAccount,
  provider: anchor.Provider,
  program: anchor.Program,
) {
  console.log(`-----Start Deposits Unlocked Member By Unlocked-----`);

  const registry = getRegistryProgram(provider);

  const depositAmount = new anchor.BN(120);
  await registry.rpc.deposit(depositAmount, {
    accounts: {
      depositor: tokenAccount,
      depositorAuthority: provider.wallet.publicKey,
      tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      vault: memberAccount.balances.vault,
      beneficiary: provider.wallet.publicKey,
      member: memberPublicKey,
    },
  });

  const memberVault = await serumCmn.getTokenAccount(
    provider,
    memberAccount.balances.vault,
  );

  console.log(`Deposit Amount: ${memberVault.amount}`);

  console.log(`-----End Deposits Unlocked Member By Unlocked-----`);

  return;
}

export async function stakesFromMemberByUnlocked(
  registrar: PublicKey,
  rewardQ: PublicKey,
  poolMint: PublicKey,
  member: PublicKey,
  balances: Balances,
  balancesLocked: Balances,
  memberSigner: PublicKey,
  registrarSigner: PublicKey,
  provider: anchor.Provider,
  registry: anchor.Program,
) {
  console.log(`-----Start Stakes From Member By Unlocked-----`);

  const stakeAmount = new anchor.BN(10);
  await registry.rpc.stake(stakeAmount, false, {
    accounts: {
      // Stake instance.
      registrar: registrar,
      rewardEventQ: rewardQ,
      poolMint,
      // Member.
      member: member,
      beneficiary: provider.wallet.publicKey,
      balances,
      balancesLocked,
      // Program signers.
      memberSigner,
      registrarSigner,
      // Misc.
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
    },
  });

  console.log(`-----End Stakes From Member By Unlocked-----`);
}

export function getRegistryProgram(provider: anchor.Provider) {
  // Read the generated IDL.
  const idl = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '..', 'target/idl/staking_registry.json'),
      'utf8',
    ),
  );

  const registryProgramId = new anchor.web3.PublicKey(REGISTRY_Program_ID);
  // Generate the program client from IDL.
  const registry = new anchor.Program(idl, registryProgramId, provider);

  return registry;
}

export async function getLockupInfo(
  provider: anchor.Provider,
): Promise<anchor.Program> {
  // Read the generated IDL.
  const idl = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '..', 'target/idl/staking_lockup.json'),
      'utf8',
    ),
  );

  // Address of the deployed program.
  anchor.setProvider(provider);

  const programId = new anchor.web3.PublicKey(LOCKUP_Program_ID);
  // Generate the program client from IDL.
  const program = new anchor.Program(idl, programId, provider);

  const lockupAddress = program.state.address();
  console.log(`lockupAddress: ${lockupAddress.toString()}`);

  const lockupAccount: any = await program.state.fetch();
  console.log(
    `lockupAccount: ${(lockupAccount.authority as PublicKey).toString()}`,
  );

  lockupAccount.whitelist.forEach((e: any) => {
    console.log(`whitelist: ${JSON.stringify(e)}`);
  });

  return program;
}

export async function getChannelPoolRewardQueue(registrar: string) {
  const registry = getRegistryProgram(provider);

  const registrarPublickey = new PublicKey(registrar);

  const registrarData: any = await registry.account.registrar.fetch(
    registrarPublickey,
  );

  console.debug(registrarData.rewardEventQ.toString(), 'RewardEventQ');

  return registrarData.rewardEventQ as PublicKey;
}

export async function dropsUnlockedReward(
  registrar: string,
  rewardQ: string,
  poolMint: string,
) {
  const registry = getRegistryProgram(provider);

  const unlockedVendor = anchor.web3.Keypair.generate();
  const unlockedVendorVault = anchor.web3.Keypair.generate();

  console.log(`-----Start Drops an unlocked reward-----`);

  const rewardKind = {
    unlocked: {},
  };
  const rewardAmount = new anchor.BN(10000000);
  const expiry = new anchor.BN(Date.now() / 1000 + 60 * 60 * 24 * 30);
  const [
    unlockedVendorSigner,
    nonce,
  ] = await anchor.web3.PublicKey.findProgramAddress(
    [new PublicKey(registrar).toBuffer(), unlockedVendor.publicKey.toBuffer()],
    registry.programId,
  );

  await registry.rpc.dropReward(
    rewardKind,
    rewardAmount,
    expiry,
    provider.wallet.publicKey,
    nonce,
    {
      accounts: {
        registrar: new PublicKey(registrar),
        rewardEventQ: new PublicKey(rewardQ),
        poolMint: new PublicKey(poolMint),

        vendor: unlockedVendor.publicKey,
        vendorVault: unlockedVendorVault.publicKey,

        depositor: tokenAccount,
        depositorAuthority: provider.wallet.publicKey,

        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [unlockedVendorVault, unlockedVendor],
      instructions: [
        ...(await serumCmn.createTokenAccountInstrs(
          provider,
          unlockedVendorVault.publicKey,
          new PublicKey(tokenMint),
          unlockedVendorSigner,
        )),
        await registry.account.rewardVendor.createInstruction(unlockedVendor),
      ],
    },
  );

  const vendorAccount: any = await registry.account.rewardVendor.fetch(
    unlockedVendor.publicKey,
  );

  console.log(`vendorAccount.registrar: ${vendorAccount.registrar}`);
  console.log(`vendorAccount.vault: ${vendorAccount.vault}`);
  console.log(`vendorAccount.nonce: ${vendorAccount.nonce}`);
  console.log(
    `vendorAccount.poolTokenSupply: ${vendorAccount.poolTokenSupply}`,
  );
  console.log(
    `vendorAccount.expiryTs: ${new Date(vendorAccount.expiryTs * 1000)}`,
  );
  console.log(`vendorAccount.expiryReceiver: ${vendorAccount.expiryReceiver}`);
  console.log(`vendorAccount.total: ${vendorAccount.total}`);
  console.log(`vendorAccount.expired: ${vendorAccount.expired}`);
  console.log(
    `vendorAccount.rewardEventQCursor: ${vendorAccount.rewardEventQCursor}`,
  );
  console.log(`vendorAccount.kind: ${JSON.stringify(rewardKind)}`);

  const rewardQAccount: any = await registry.account.rewardQueue.fetch(rewardQ);

  console.log(`rewardQAccount.head: ${rewardQAccount.head}`);
  console.log(`rewardQAccount.tail: ${rewardQAccount.tail}`);
  const e = rewardQAccount.events[0];
  console.log(`e.vendor: ${e.vendor}`);
  console.log(`e.locked: ${e.locked}`);

  console.log(`-----End Drops an unlocked reward-----`);
}

export async function lockupInit() {
  // Read the generated IDL.
  const idl = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '..', 'target/idl/staking_lockup.json'),
      'utf8',
    ),
  );

  // Address of the deployed program.
  const programId = new anchor.web3.PublicKey(
    'HLVA2NmjGBsoKCwmGZg1zAYXFxMhKXRMf7V28RexGpcR',
  );

  anchor.setProvider(provider);

  // Generate the program client from IDL.
  const program = new anchor.Program(idl, programId, provider);

  // await program.state.rpc.new({
  //   accounts: {
  //     authority: provider.wallet.publicKey,
  //   },
  // });

  const lockupAddress = program.state.address();
  console.log(`lockupAddress: ${lockupAddress.toString()}`);

  const lockupAccount: any = await program.state.fetch();
  console.log(
    `lockupAccount: ${(lockupAccount.authority as PublicKey).toString()}`,
  );

  for (const e in lockupAccount.whitelist) {
    console.log(`whitelist: ${JSON.stringify(e)}`);
    await program.state.rpc.whitelistDelete(e, {
      accounts: {
        authority: provider.wallet.publicKey,
      },
    });
  }
}
