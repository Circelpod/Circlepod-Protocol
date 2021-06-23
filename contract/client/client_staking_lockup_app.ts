import * as anchor from '@project-serum/anchor';
import * as serumCmn from "@project-serum/common";
import { TokenInstructions } from '@project-serum/serum';
import { Keypair, PublicKey } from '@solana/web3.js';
import { getLockupInfo, getRegistryProgram } from './lockup_utils';
import fs from 'mz/fs';
import { NodeWallet, SendTxRequest } from '@project-serum/common';
import path from 'path';
import { Balances, MemberAccount } from './types/member_account';

// Devnet
const connection = new anchor.web3.Connection('https://api.devnet.solana.com');
const provider = new anchor.Provider(connection, NodeWallet.local(), anchor.Provider.defaultOptions());
const tokenMint = '5QhsyriyneDvoZCt9Cji5GyrXRZ1pfBoj372PQbZ3eVz';
const tokenAccount = 'CFF4SPAaXYDYMnsQe1KFKbTm7zULD4i9SRA1y6X3VJUS';

// Local
// const provider = anchor.Provider.local();
// const tokenMint = 'GJ65oHuFLo3K48CU3MUJk4mjqDsBpNReKttnwptdTfX4';
// const tokenAccount = 'FdsYvUaa61sYxMiDXHFGDyQLjHewppLRoLHaWEtR2HsF';

async function main() {

    const mint = new anchor.web3.PublicKey(tokenMint);
    const account = new anchor.web3.PublicKey(tokenAccount);

    const registry = getRegistryProgram(provider);

    const [vestingPublicKey, vestingAccount, vestingSigner] = await createsVestingAccount(provider, account, mint);

    // await initRegistryProgram();

    const [poolMint, _nonce, registrar, registrarSigner] = await createsRegistryGenesis(provider);

    const rewardQ = await initializesRegistrar(mint, _nonce, registrar, poolMint, provider);

    // const member = anchor.web3.Keypair.generate();

    // const [memberAccount, memberSigner] = await createsMember(member, registrar.publicKey, provider, registry);

    // await depositsUnlockedMemberByUnlocked(member.publicKey, memberAccount, provider, registry);

    // await stakesFromMemberByUnlocked(registrar.publicKey, rewardQ.publicKey, poolMint, member.publicKey, memberAccount.balances, memberAccount.balancesLocked, memberSigner, registrarSigner, provider, registry);

    // const vault = await serumCmn.getTokenAccount(
    //     provider,
    //     memberAccount.balances.vault
    // );
    // const vaultStake = await serumCmn.getTokenAccount(
    //     provider,
    //     memberAccount.balances.vaultStake
    // );
    // const spt = await serumCmn.getTokenAccount(
    //     provider,
    //     memberAccount.balances.spt
    // );

    // console.log(`vault.amount: ${vault.amount}`);
    // console.log(`vaultStake.amount: ${vaultStake.amount}`);
    // console.log(`spt.amount: ${spt.amount}`);

    console.log('success!');
}

main().then(
    () => process.exit(),
    err => {
        console.error(err);
        process.exit(-1);
    },
);

async function createsVestingAccount(provider: anchor.Provider, account: anchor.web3.PublicKey, mint: anchor.web3.PublicKey): Promise<[anchor.web3.PublicKey, any, anchor.web3.PublicKey]> {
    console.log(`-----Start Creates Vesting Account-----`);

    const program = await getLockupInfo(provider);

    const vesting = anchor.web3.Keypair.generate();

    const startTs = new anchor.BN(Date.now() / 1000);
    const endTs = new anchor.BN(startTs.toNumber() + 5);
    const periodCount = new anchor.BN(2);
    const beneficiary = provider.wallet.publicKey;
    const depositAmount = new anchor.BN(100);

    const vault = anchor.web3.Keypair.generate();
    const [
        vestingSigner, nonce,
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

    await serumCmn.sleep(30000);

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

    return [vesting.publicKey, vestingAccount, vestingSigner];
}

async function createsRegistryGenesis(provider: anchor.Provider): Promise<[anchor.web3.PublicKey, number, anchor.web3.Keypair, anchor.web3.PublicKey]> {

    const registry = getRegistryProgram(provider);

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
    console.log(`Registrar: ${registrar.publicKey.toString()}`);
    console.log(`RegistrarSigner: ${registrarSigner.toString()}`);
    console.log(`Nonce: ${_nonce}`);

    console.log(`-----End Creates Registry Genesis-----`);

    return [poolMint, _nonce, registrar, registrarSigner];
}

export async function initializesRegistrar(mint: PublicKey, nonce: number, registrar: Keypair, poolMint: PublicKey, provider: anchor.Provider): Promise<Keypair> {

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
        }
    );

    await serumCmn.sleep(30000);

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

    return rewardQ;
}

export async function createsMember(member: Keypair, registrar: PublicKey, provider: anchor.Provider, registry: anchor.Program): Promise<[MemberAccount, PublicKey]> {

    console.log(`-----Start Creates Member-----`);

    const registrarAccount: any = await registry.account.registrar.fetch(registrar);

    const [
        memberSigner,
        nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [registrar.toBuffer(), member.publicKey.toBuffer()],
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

    const allTxs: SendTxRequest[] = [mainTx as any, lockedTx, { tx, signers }];

    const txSigs = await provider.sendAll(allTxs);

    const memberAccount: any = await registry.account.member.fetch(member.publicKey);

    console.log(`memberAccount.registrar: ${memberAccount.registrar}`);
    console.log(`memberAccount.beneficiary: ${provider.wallet.publicKey}`);
    console.log(`memberAccount.registrar: ${registrar}`);
    console.log(`memberAccount.metadata: ${memberAccount.metadata}`);

    console.log(`memberAccount.balances: ${JSON.stringify(memberAccount.balances)}`);
    console.log(`balances: ${JSON.stringify(balances)}`);

    console.log(`memberAccount.balancesLocked: ${JSON.stringify(memberAccount.balancesLocked)}`);
    console.log(`balances: ${JSON.stringify(balancesLocked)}`);

    console.log(`memberAccount.rewardsCursor: ${memberAccount.rewardsCursor}`);
    console.log(`memberAccount.lastStakeTs: ${memberAccount.lastStakeTs}`);

    console.log(`-----End Creates Member-----`);

    return [memberAccount, memberSigner];
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

async function depositsUnlockedMemberByUnlocked(memberPublicKey: PublicKey, memberAccount: MemberAccount, provider: anchor.Provider, program: anchor.Program) {

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
        memberAccount.balances.vault
    );

    console.log(`Deposit Amount: ${memberVault.amount}`);

    console.log(`-----End Deposits Unlocked Member By Unlocked-----`);

    return
}

export async function stakesFromMemberByUnlocked(registrar: PublicKey, rewardQ: PublicKey, poolMint: PublicKey, member: PublicKey, balances: Balances, balancesLocked: Balances, memberSigner: PublicKey, registrarSigner: PublicKey, provider: anchor.Provider, registry: anchor.Program) {

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

/**
 * Create an Account from a keypair file
 */
export async function readAccountFromFile(filePath: string): Promise<Buffer> {
    const keypairString = await fs.readFile(filePath, { encoding: 'utf8' });
    const keypairBuffer = Buffer.from(JSON.parse(keypairString));
    return keypairBuffer;
}