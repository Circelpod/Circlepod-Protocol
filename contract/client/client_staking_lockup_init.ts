import * as anchor from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

// if you deploy first, Pleace Run it with yarn start:devdapp:client:lockup:init
async function main() {

    await lockupInit();

    console.log('success!');
}

async function lockupInit() {

    // Read the generated IDL.
    const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'target/idl/staking_lockup.json'), 'utf8'));

    // Address of the deployed program.
    const programId = new anchor.web3.PublicKey('6eJH7ZoWui9wnvhTwDem2C2zMh6RZ9Dtc39EA9stYq8x');

    const provider = anchor.Provider.local();
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
    console.log(`lockupAccount: ${(lockupAccount.authority as PublicKey).toString()}`);

    for (const e in lockupAccount.whitelist) {
        console.log(`whitelist: ${JSON.stringify(e)}`);
        await program.state.rpc.whitelistDelete(e, {
            accounts: {
                authority: provider.wallet.publicKey,
            },
        });
    }
}

main().then(
    () => process.exit(),
    err => {
        console.error(err);
        process.exit(-1);
    },
);