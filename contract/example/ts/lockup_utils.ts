import * as anchor from '@project-serum/anchor';
import { Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import * as serumCmn from "@project-serum/common";
import { TokenInstructions } from '@project-serum/serum';
import { NodeWallet, SendTxRequest } from '@project-serum/common';

// Devnet
export const connection = new anchor.web3.Connection('https://api.devnet.solana.com');
export const provider = new anchor.Provider(connection, NodeWallet.local(), anchor.Provider.defaultOptions());

export const tokenMint = '5QhsyriyneDvoZCt9Cji5GyrXRZ1pfBoj372PQbZ3eVz';
export const tokenAccount = 'CFF4SPAaXYDYMnsQe1KFKbTm7zULD4i9SRA1y6X3VJUS';

// Local
// export const provider = anchor.Provider.local();
// export const tokenMint = 'GJ65oHuFLo3K48CU3MUJk4mjqDsBpNReKttnwptdTfX4';
// export const tokenAccount = 'FdsYvUaa61sYxMiDXHFGDyQLjHewppLRoLHaWEtR2HsF';

export const LOCKUP_Program_ID = 'HLVA2NmjGBsoKCwmGZg1zAYXFxMhKXRMf7V28RexGpcR';
export const REGISTRY_Program_ID = '4wcKkwjthmfHd7CZNsCxnyZoEiujBLbDvJ7jDFjqoiKm';

export async function withdrawsDeposits(provider: anchor.Provider, program: anchor.Program) {
    const registry = getRegistryProgram(provider);

    const [mint, registrar, member, memberAccount, memberSigner] = await unstakeFinalizes(provider, program);

    console.log(`-----Start Withdraws deposits (unlocked)-----`);

    const token = await serumCmn.createTokenAccount(
        provider,
        mint,
        provider.wallet.publicKey
    );
    const withdrawAmount = new anchor.BN(100);
    await registry.rpc.withdraw(withdrawAmount, {
        accounts: {
            registrar: registrar.publicKey,
            member: member.publicKey,
            beneficiary: provider.wallet.publicKey,
            vault: memberAccount.balances.vault,
            memberSigner,
            depositor: token,
            tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        },
    });

    const tokenAccount = await serumCmn.getTokenAccount(provider, token);
    console.log(`tokenAccount: ${tokenAccount.amount}`);

    console.log(`-----End Withdraws deposits (unlocked)-----`);
}

export async function unstakeFinalizes(provider: anchor.Provider, program: anchor.Program): Promise<[PublicKey, Keypair, Keypair, any, PublicKey]> {
    const registry = getRegistryProgram(provider);

    const [registrar, member, pendingWithdrawal, balances, memberSigner, memberAccount, mint] = await unstakes(provider, program);

    await serumCmn.sleep(5000);

    console.log(`-----Start Unstake finalizes (unlocked)-----`);

    await registry.rpc.endUnstake({
        accounts: {
            registrar: registrar.publicKey,

            member: member.publicKey,
            beneficiary: provider.wallet.publicKey,
            pendingWithdrawal: pendingWithdrawal.publicKey,

            vault: balances.vault,
            vaultPw: balances.vaultPw,

            memberSigner,

            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        },
    });

    const vault = await serumCmn.getTokenAccount(
        provider,
        memberAccount.balances.vault
    );
    const vaultPw = await serumCmn.getTokenAccount(
        provider,
        memberAccount.balances.vaultPw
    );

    console.log(`vault.amount: ${vault.amount}`);
    console.log(`vaultPw.amount: ${vaultPw.amount}`);

    console.log(`-----End Unstake finalizes (unlocked)-----`);

    return [mint, registrar, member, memberAccount, memberSigner];
}

export async function unstakes(provider: anchor.Provider, program: anchor.Program): Promise<[Keypair, Keypair, Keypair, any, PublicKey, any, PublicKey]> {

    const [registrar, rewardQ, poolMint, member, balances, balancesLocked, memberSigner, memberAccount, mint] = await collectsUnlockedReward(provider, program);

    console.log(`-----Start Unstakes (unlocked)-----`);

    const registry = getRegistryProgram(provider);

    await collectsUnlockedReward(provider, program);

    const unstakeAmount = new anchor.BN(10);

    const pendingWithdrawal = anchor.web3.Keypair.generate();

    await registry.rpc.startUnstake(unstakeAmount, false, {
        accounts: {
            registrar: registrar.publicKey,
            rewardEventQ: rewardQ.publicKey,
            poolMint,

            pendingWithdrawal: pendingWithdrawal.publicKey,
            member: member.publicKey,
            beneficiary: provider.wallet.publicKey,
            balances,
            balancesLocked,

            memberSigner,

            tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [pendingWithdrawal],
        instructions: [
            await registry.account.pendingWithdrawal.createInstruction(
                pendingWithdrawal
            ),
        ],
    });

    const vaultPw = await serumCmn.getTokenAccount(
        provider,
        memberAccount.balances.vaultPw
    );
    const vaultStake = await serumCmn.getTokenAccount(
        provider,
        memberAccount.balances.vaultStake
    );
    const spt = await serumCmn.getTokenAccount(
        provider,
        memberAccount.balances.spt
    );

    console.log(`vaultPw.amount: ${vaultPw.amount}`);
    console.log(`vaultStake.amount: ${vaultStake.amount}`);
    console.log(`spt: ${spt.amount}`);

    console.log(`-----End Unstakes (unlocked)-----`);

    return [registrar, member, pendingWithdrawal, balances, memberSigner, memberAccount, mint];
}

export async function collectsUnlockedReward(provider: anchor.Provider, program: anchor.Program): Promise<[Keypair, Keypair, PublicKey, Keypair, any, any, PublicKey, any, PublicKey]> {
    const registry = getRegistryProgram(provider);

    const [mint, registrar, member, balances, balancesLocked, unlockedVendor, unlockedVendorVault, unlockedVendorSigner, rewardQ, poolMint, memberSigner] = await dropsUnlockedReward(provider, program);

    console.log(`-----Start Collects an unlocked reward-----`);

    const token = await serumCmn.createTokenAccount(
        provider,
        mint,
        provider.wallet.publicKey
    );
    await registry.rpc.claimReward({
        accounts: {
            to: token,
            cmn: {
                registrar: registrar.publicKey,

                member: member.publicKey,
                beneficiary: provider.wallet.publicKey,
                balances,
                balancesLocked,

                vendor: unlockedVendor.publicKey,
                vault: unlockedVendorVault.publicKey,
                vendorSigner: unlockedVendorSigner,

                tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            },
        },
    });

    const tokenAccount = await serumCmn.getTokenAccount(provider, token);
    console.log(`tokenAccount.amount: ${tokenAccount.amount}`);

    const memberAccount: any = await registry.account.member.fetch(member.publicKey);
    console.log(`memberAccount.rewardsCursor: ${memberAccount.rewardsCursor}`);

    console.log(`-----End Collects an unlocked reward-----`);

    return [registrar, rewardQ, poolMint, member, balances, balancesLocked, memberSigner, memberAccount, mint];
}

export async function dropsUnlockedReward(provider: anchor.Provider, program: anchor.Program): Promise<[PublicKey, Keypair, Keypair, any, any, Keypair, Keypair, PublicKey, Keypair, PublicKey, PublicKey]> {
    const registry = getRegistryProgram(provider);
    const unlockedVendor = anchor.web3.Keypair.generate();
    const unlockedVendorVault = anchor.web3.Keypair.generate();

    const [registrar, rewardQ, poolMint, tokenAccount, mint, member, balances, balancesLocked, memberSigner] = await stakesFromMemberByUnlocked(provider, program);

    console.log(`-----Start Drops an unlocked reward-----`);

    const rewardKind = {
        unlocked: {},
    };
    const rewardAmount = new anchor.BN(200);
    const expiry = new anchor.BN(Date.now() / 1000 + 5);
    const [
        unlockedVendorSigner,
        nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [registrar.publicKey.toBuffer(), unlockedVendor.publicKey.toBuffer()],
        registry.programId
    );

    await registry.rpc.dropReward(
        rewardKind,
        rewardAmount,
        expiry,
        provider.wallet.publicKey,
        nonce,
        {
            accounts: {
                registrar: registrar.publicKey,
                rewardEventQ: rewardQ.publicKey,
                poolMint,

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
                    mint,
                    unlockedVendorSigner
                )),
                await registry.account.rewardVendor.createInstruction(unlockedVendor),
            ],
        }
    );

    const vendorAccount: any = await registry.account.rewardVendor.fetch(
        unlockedVendor.publicKey
    );

    console.log(`vendorAccount.registrar: ${vendorAccount.registrar}`);
    console.log(`vendorAccount.vault: ${vendorAccount.vault}`);
    console.log(`vendorAccount.nonce: ${vendorAccount.nonce}`);
    console.log(`vendorAccount.poolTokenSupply: ${vendorAccount.poolTokenSupply}`);
    console.log(`vendorAccount.expiryTs: ${new Date(vendorAccount.expiryTs * 1000)}`);
    console.log(`vendorAccount.expiryReceiver: ${vendorAccount.expiryReceiver}`);
    console.log(`vendorAccount.total: ${vendorAccount.total}`);
    console.log(`vendorAccount.expired: ${vendorAccount.expired}`);
    console.log(`vendorAccount.rewardEventQCursor: ${vendorAccount.rewardEventQCursor}`);
    console.log(`vendorAccount.kind: ${JSON.stringify(rewardKind)}`);

    const rewardQAccount: any = await registry.account.rewardQueue.fetch(
        rewardQ.publicKey
    );

    console.log(`rewardQAccount.head: ${rewardQAccount.head}`);
    console.log(`rewardQAccount.tail: ${rewardQAccount.tail}`);
    const e = rewardQAccount.events[0];
    console.log(`e.vendor: ${e.vendor}`);
    console.log(`e.locked: ${e.locked}`);

    console.log(`-----End Drops an unlocked reward-----`);

    return [mint, registrar, member, balances, balancesLocked, unlockedVendor, unlockedVendorVault, unlockedVendorSigner, rewardQ, poolMint, memberSigner];
}

export async function stakesFromMemberByUnlocked(provider: anchor.Provider, program: anchor.Program): Promise<[Keypair, Keypair, PublicKey, PublicKey, PublicKey, Keypair, any, any, PublicKey]> {

    const [registrar, rewardQ, poolMint, member, balances, balancesLocked, memberSigner, registrarSigner, memberAccount, tokenAccount, mint] = await depositsUnlockedMemberByUnlocked(provider, program);

    console.log(`-----Start Stakes From Member By Unlocked-----`);

    const registry = getRegistryProgram(provider);
    const stakeAmount = new anchor.BN(10);
    await registry.rpc.stake(stakeAmount, false, {
        accounts: {
            // Stake instance.
            registrar: registrar.publicKey,
            rewardEventQ: rewardQ.publicKey,
            poolMint,
            // Member.
            member: member.publicKey,
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

    const vault = await serumCmn.getTokenAccount(
        provider,
        memberAccount.balances.vault
    );
    const vaultStake = await serumCmn.getTokenAccount(
        provider,
        memberAccount.balances.vaultStake
    );
    const spt = await serumCmn.getTokenAccount(
        provider,
        memberAccount.balances.spt
    );

    console.log(`vault.amount: ${vault.amount}`);
    console.log(`vaultStake.amount: ${vaultStake.amount}`);
    console.log(`spt.amount: ${spt.amount}`);

    console.log(`-----End Stakes From Member By Unlocked-----`);

    return [registrar, rewardQ, poolMint, tokenAccount, mint, member, balances, balancesLocked, memberSigner];
}

async function depositsUnlockedMemberByUnlocked(provider: anchor.Provider, program: anchor.Program): Promise<[Keypair, Keypair, PublicKey, Keypair, any, any, PublicKey, PublicKey, any, PublicKey, PublicKey]> {

    const [memberAccount, member, tokenAccount, registrar, rewardQ, poolMint, balances, balancesLocked, memberSigner, registrarSigner, mint] = await createsMember(provider, program);

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
            member: member.publicKey,
        },
    });

    const memberVault = await serumCmn.getTokenAccount(
        provider,
        memberAccount.balances.vault
    );

    console.log(`Deposit Amount: ${memberVault.amount}`);

    console.log(`-----End Deposits Unlocked Member By Unlocked-----`);

    return [registrar, rewardQ, poolMint, member, balances, balancesLocked, memberSigner, registrarSigner, memberAccount, tokenAccount, mint];
}

export async function createsMember(provider: anchor.Provider, program: anchor.Program): Promise<[any, Keypair, PublicKey, Keypair, Keypair, PublicKey, any, any, PublicKey, PublicKey, PublicKey]> {

    const registry = getRegistryProgram(provider);
    const [registrar, registrarAccount, tokenAccount, rewardQ, poolMint, registrarSigner, mint] = await initializesRegistrar(provider, program);

    console.log(`-----Start Creates Member-----`);

    const member = anchor.web3.Keypair.generate();

    const [
        memberSigner,
        nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [registrar.publicKey.toBuffer(), member.publicKey.toBuffer()],
        registry.programId
    );

    const [mainTx, balances] = await createBalanceSandbox(
        provider,
        registrarAccount,
        memberSigner
    );
    const [lockedTx, balancesLocked] = await createBalanceSandbox(
        provider,
        registrarAccount,
        memberSigner
    );

    const tx = registry.transaction.createMember(nonce, {
        accounts: {
            registrar: registrar.publicKey,
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

    const allTxs: SendTxRequest[] = [mainTx as any, lockedTx, { tx, signers }];

    const txSigs = await provider.sendAll(allTxs);

    const memberAccount: any = await registry.account.member.fetch(member.publicKey);

    console.log(`memberAccount.registrar: ${memberAccount.registrar}`);
    console.log(`memberAccount.beneficiary: ${provider.wallet.publicKey}`);
    console.log(`memberAccount.registrar: ${registrar.publicKey}`);
    console.log(`memberAccount.metadata: ${memberAccount.metadata}`);

    console.log(`memberAccount.balances: ${JSON.stringify(memberAccount.balances)}`);
    console.log(`balances: ${JSON.stringify(balances)}`);

    console.log(`memberAccount.balancesLocked: ${JSON.stringify(memberAccount.balancesLocked)}`);
    console.log(`balances: ${JSON.stringify(balancesLocked)}`);

    console.log(`memberAccount.rewardsCursor: ${memberAccount.rewardsCursor}`);
    console.log(`memberAccount.lastStakeTs: ${memberAccount.lastStakeTs}`);

    console.log(`-----End Creates Member-----`);

    return [memberAccount, member, tokenAccount, registrar, rewardQ, poolMint, balances, balancesLocked, memberSigner, registrarSigner, mint];
}

export async function initializesRegistrar(provider: anchor.Provider, program: anchor.Program): Promise<[Keypair, any, PublicKey, Keypair, PublicKey, PublicKey, PublicKey]> {

    const registry = getRegistryProgram(provider);

    const [mint, vesting, vestingAccount, vestingSigner, tokenAccount] = await createsVestingAccount(provider, program);

    const [poolMint, nonce, registrar, registrarSigner] = await createsRegistryGenesis(registry, provider);

    console.log(`-----Start Initializes Registrar-----`);

    const stakeRate = new anchor.BN(2);
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
        }
    );

    const registrarAccount: any = await registry.account.registrar.fetch(registrar.publicKey);

    console.log(`provider.wallet.publicKey: ${provider.wallet.publicKey}`);
    console.log(`RegistrarAccount Authority: ${registrarAccount.authority}`);
    console.log(`RegistrarAccount Nonce: ${nonce}`);
    console.log(`RegistrarAccount Mint: ${mint}`);
    console.log(`RegistrarAccount PoolMint: ${poolMint}`);
    console.log(`RegistrarAccount StakeRate: ${stakeRate}`);
    console.log(`RegistrarAccount RewardEventQ: ${rewardQ.publicKey}`);
    console.log(`RegistrarAccount WithdrawalTimelock: ${withdrawalTimelock}`);

    console.log(`-----End Initializes Registrar-----`);

    return [registrar, registrarAccount, tokenAccount, rewardQ, poolMint, registrarSigner, mint];
}

export function getRegistryProgram(provider: anchor.Provider) {

    // Read the generated IDL.
    const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'target/idl/staking_registry.json'), 'utf8'));

    const registryProgramId = new anchor.web3.PublicKey(REGISTRY_Program_ID);
    // Generate the program client from IDL.
    const registry = new anchor.Program(idl, registryProgramId, provider)

    return registry;
}

async function createsRegistryGenesis(registry: anchor.Program, provider: anchor.Provider): Promise<[anchor.web3.PublicKey, number, anchor.web3.Keypair, anchor.web3.PublicKey]> {

    console.log(`-----Start Creates Registry Genesis-----`);

    const registrar = anchor.web3.Keypair.generate();

    const [
        registrarSigner,
        _nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [registrar.publicKey.toBuffer()],
        registry.programId
    );

    const poolMint = await serumCmn.createMint(provider, registrarSigner);
    console.log(`PoolMint: ${poolMint.toString()}`);
    console.log(`RegistrarSigner: ${registrarSigner.toString()}`);
    console.log(`Nonce: ${_nonce}`);

    console.log(`-----End Creates Registry Genesis-----`);

    return [poolMint, _nonce, registrar, registrarSigner];
}

export async function withdrawsFromVestingAccount(provider: anchor.Provider, program: anchor.Program) {

    const [mint, vesting, vestingAccount, vestingSigner] = await createsVestingAccount(provider, program);

    console.log(`-----Start Withdraws From Vesting Account-----`);

    await serumCmn.sleep(10 * 1000);

    const token = await serumCmn.createTokenAccount(
        provider,
        mint,
        provider.wallet.publicKey
    );

    await program.rpc.withdraw(new anchor.BN(100), {
        accounts: {
            vesting: vesting,
            beneficiary: provider.wallet.publicKey,
            token,
            vault: vestingAccount.vault,
            vestingSigner,
            tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
            clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        },
    });

    const updateVestingAccount = await program.account.vesting.fetch(vesting);
    console.log(`Vesting Account Outstanding: ${JSON.stringify(updateVestingAccount)}`);

    const vaultAccount = await serumCmn.getTokenAccount(
        provider,
        vestingAccount.vault
    );

    console.log(`Vault Account Amount: ${vaultAccount.amount.toNumber()}`);

    const tokenAccount = await serumCmn.getTokenAccount(provider, token);
    console.log(`Token Account Amount: ${tokenAccount.amount.toNumber()}`);
}

// eslint-disable-next-line @typescript-eslint/ban-types
export async function createsVestingAccount(provider: anchor.Provider, program: anchor.Program): Promise<[anchor.web3.PublicKey, anchor.web3.PublicKey, any, anchor.web3.PublicKey, anchor.web3.PublicKey]> {

    const [mint, account] = await createMintAndValut(provider);

    console.log(`-----Start Creates Vesting Account-----`);

    const vesting = anchor.web3.Keypair.generate();

    const startTs = new anchor.BN(Date.now() / 1000);
    const endTs = new anchor.BN(startTs.toNumber() + 5);
    const periodCount = new anchor.BN(2);
    const beneficiary = provider.wallet.publicKey;
    const depositAmount = new anchor.BN(100);

    const vault = anchor.web3.Keypair.generate();
    const [
        vestingSigner,
        nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [vesting.publicKey.toBuffer()],
        program.programId
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
                    vestingSigner
                )),
            ],
        }
    );

    const vestingAccount: any = await program.account.vesting.fetch(vesting.publicKey);

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
    console.log(`VestingAccount.whitelistOwned: ${vestingAccount.whitelistOwned}`);
    console.log(`VestingAccount.createdTs: ${new Date(vestingAccount.createdTs.toNumber() * 1000).toISOString()}`);
    console.log(`VestingAccount.startTs: ${new Date(vestingAccount.startTs.toNumber() * 1000).toISOString()}`);
    console.log(`VestingAccount.endTs: ${new Date(vestingAccount.endTs.toNumber() * 1000).toISOString()}`);
    console.log(`VestingAccount.realizor: ${vestingAccount.realizor}`);

    const vaultAccount = await serumCmn.getTokenAccount(
        provider,
        vestingAccount.vault
    );

    console.log(`Vault Account Amount: ${vaultAccount.amount.toNumber()}`);

    console.log(`-----End Creates Vesting Account-----`);

    return [mint, vesting.publicKey, vestingAccount, vestingSigner, account];
}

export async function createMintAndValut(provider: anchor.Provider): Promise<[anchor.web3.PublicKey, anchor.web3.PublicKey]> {

    console.log(`-----Start Create Mint And Valut-----`);

    const [_mint, _account] = await serumCmn.createMintAndVault(
        provider,
        new anchor.BN(1000000)
    );

    console.log(`Token Mint: ${_mint.toString()}`);
    console.log(`Token Account: ${_account.toString()}`);

    console.log(`-----End Create Mint And Valut-----`);

    return [_mint, _account];
}

export async function getLockupInfo(provider: anchor.Provider): Promise<anchor.Program> {

    // Read the generated IDL.
    const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'target/idl/staking_lockup.json'), 'utf8'));

    // Address of the deployed program.
    anchor.setProvider(provider);

    const programId = new anchor.web3.PublicKey(LOCKUP_Program_ID);
    // Generate the program client from IDL.
    const program = new anchor.Program(idl, programId, provider);

    const lockupAddress = program.state.address();
    console.log(`lockupAddress: ${lockupAddress.toString()}`);

    const lockupAccount: any = await program.state.fetch();
    console.log(`lockupAccount: ${(lockupAccount.authority as PublicKey).toString()}`);

    lockupAccount.whitelist.forEach((e: any) => {
        console.log(`whitelist: ${JSON.stringify(e)}`);
    });

    return program;
}

export async function deleteAllWhitelist(program: anchor.Program, provider: anchor.Provider) {

    console.log(`-----Start Delete All Whitelist-----`);

    const lockupAccount: any = await program.state.fetch();
    for (const e of lockupAccount.whitelist) {
        await program.state.rpc.whitelistDelete(e, {
            accounts: {
                authority: provider.wallet.publicKey,
            },
        });
    }

    console.log(`-----End Delete All Whitelist-----`);
}

export async function setAuthority(program: anchor.Program, provider: anchor.Provider) {

    console.log(`-----Start Set Authority-----`);

    const newAuthority = anchor.web3.Keypair.generate();
    await program.state.rpc.setAuthority(newAuthority.publicKey, {
        accounts: {
            authority: provider.wallet.publicKey,
        },
    });
    let lockupAccount: any = await program.state.fetch();
    console.log(`After setAuthority lockupAccount: ${(lockupAccount.authority as PublicKey).toString()}`);

    // // 還原
    // await program.state.rpc.setAuthority(provider.wallet.publicKey, {
    //     accounts: {
    //         authority: newAuthority.publicKey,
    //     },
    //     signers: [newAuthority],
    // });
    // lockupAccount = await program.state.fetch();
    // console.log(`Undo setAuthority lockupAccount: ${(lockupAccount.authority as PublicKey).toString()}`);
    console.log(`-----End Set Authority-----`);
}

export async function deleteDefaultEntry(program: anchor.Program, provider: anchor.Provider) {

    console.log(`-----Start Delete Default Entry-----`);

    const defaultEntry = { programId: new anchor.web3.PublicKey(0) };
    await program.state.rpc.whitelistDelete(defaultEntry, {
        accounts: {
            authority: provider.wallet.publicKey,
        },
    });

    console.log(`-----End Delete Default Entry-----`);
}

export async function initLockupAccounts(program: anchor.Program, provider: anchor.Provider) {

    console.log(`-----Start Init Lockup Accounts-----`);

    await program.state.rpc.new({
        accounts: {
            authority: provider.wallet.publicKey,
        },
    });

    console.log(`-----End Init Lockup Accounts-----`);
}

async function createBalanceSandbox(provider: anchor.Provider, r: any, registrySigner: anchor.web3.PublicKey) {
    const spt = anchor.web3.Keypair.generate();
    const vault = anchor.web3.Keypair.generate();
    const vaultStake = anchor.web3.Keypair.generate();
    const vaultPw = anchor.web3.Keypair.generate();

    const lamports = await provider.connection.getMinimumBalanceForRentExemption(
        165
    );

    const createSptIx = await serumCmn.createTokenAccountInstrs(
        provider,
        spt.publicKey,
        r.poolMint,
        registrySigner,
        lamports
    );
    const createVaultIx = await serumCmn.createTokenAccountInstrs(
        provider,
        vault.publicKey,
        r.mint,
        registrySigner,
        lamports
    );
    const createVaultStakeIx = await serumCmn.createTokenAccountInstrs(
        provider,
        vaultStake.publicKey,
        r.mint,
        registrySigner,
        lamports
    );
    const createVaultPwIx = await serumCmn.createTokenAccountInstrs(
        provider,
        vaultPw.publicKey,
        r.mint,
        registrySigner,
        lamports
    );
    const tx0 = new anchor.web3.Transaction();
    tx0.add(
        ...createSptIx,
        ...createVaultIx,
        ...createVaultStakeIx,
        ...createVaultPwIx
    );
    const signers0 = [spt, vault, vaultStake, vaultPw];

    const tx = { tx: tx0, signers: signers0 };

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
