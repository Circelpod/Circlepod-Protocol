import * as anchor from '@project-serum/anchor';
import { getLockupInfo, initLockupAccounts, deleteDefaultEntry, deleteAllWhitelist, setAuthority, createMintAndValut, createsVestingAccount, withdrawsFromVestingAccount, initializesRegistrar, createsMember, stakesFromMemberByUnlocked, dropsUnlockedReward, collectsUnlockedReward, unstakes, unstakeFinalizes, withdrawsDeposits } from './lockup_utils';

export const LOCKUP_Program_ID = '6eJH7ZoWui9wnvhTwDem2C2zMh6RZ9Dtc39EA9stYq8x';
export const REGISTRY_Program_ID = '2vR8HyXLWJDWi81rfh7AxPNi5auSA8ZSxRPiFjYEVc7x';

async function main() {

    const provider = anchor.Provider.local();

    const program = await getLockupInfo(provider);

    // // initialized!
    // await initLockupAccounts(program, provider);

    // // DefaultEntry WhitelistDelete 
    // await deleteDefaultEntry(program, provider);

    // // Selete All Whitelist
    // await deleteAllWhitelist(program, provider);

    // // SetAuthority
    // await setAuthority(program, provider);

    // await createMintAndValut(provider);

    // await createsVestingAccount(provider, program);

    // await withdrawsFromVestingAccount(provider, program);

    // await initializesRegistrar(provider, program);

    // await createsMember(provider, program);

    // await stakesFromMemberByUnlocked(provider, program);

    // await dropsUnlockedReward(provider, program);

    // await collectsUnlockedReward(provider, program);

    // await unstakes(provider, program);

    // await unstakeFinalizes(provider, program);

    await withdrawsDeposits(provider, program);

    console.log('success!');
}

main().then(
    () => process.exit(),
    err => {
        console.error(err);
        process.exit(-1);
    },
);