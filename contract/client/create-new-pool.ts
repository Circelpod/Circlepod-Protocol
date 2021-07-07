import * as anchor from '@project-serum/anchor';
import { createsRegistryGenesis, initializesRegistrar, provider, tokenAccount, tokenMint } from './app_utils';

async function main() {

    const mint = new anchor.web3.PublicKey(tokenMint);
    const account = new anchor.web3.PublicKey(tokenAccount);

    // New Pool
    const [poolMint, _nonce, registrar, registrarSigner] = await createsRegistryGenesis(provider);

    const rewardQ = await initializesRegistrar(mint, _nonce, registrar, poolMint, provider);
    // End New Pool

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