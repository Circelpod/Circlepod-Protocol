import * as anchor from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

async function main() {
    // Read the generated IDL.
    const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'target/idl/staking_lockup.json'), 'utf8'));

    // Address of the deployed program.
    const programId = new anchor.web3.PublicKey('DLePRXaXLQo3PDZVH6jV1mBzTvAfmry5kN7R8WKiDV9L');

    const provider = anchor.Provider.local();
    anchor.setProvider(provider);

    // Generate the program client from IDL.
    const program = new anchor.Program(idl, programId, provider);

    const lockupAddress = program.state.address();
    console.log(`lockupAddress: ${lockupAddress.toString()}`);

    let lockupAccount: any = await program.state.fetch();
    console.log(`lockupAccount: ${(lockupAccount.authority as PublicKey).toString()}`);

    lockupAccount.whitelist.forEach((e: any) => {
        console.log(`whitelist: ${JSON.stringify(e)}`);
    });


    // // initialized!
    // await program.state.rpc.new({
    //     accounts: {
    //         authority: provider.wallet.publicKey,
    //     },
    // });

    // // DefaultEntry WhitelistDelete 
    // const defaultEntry = { programId: new anchor.web3.PublicKey(0) };
    // await program.state.rpc.whitelistDelete(defaultEntry, {
    //   accounts: {
    //     authority: provider.wallet.publicKey,
    //   },
    // });

    // // SetAuthority
    // const newAuthority = anchor.web3.Keypair.generate();
    // await program.state.rpc.setAuthority(newAuthority.publicKey, {
    //     accounts: {
    //         authority: provider.wallet.publicKey,
    //     },
    // });

    // lockupAccount = await program.state.fetch();
    // console.log(`After setAuthority lockupAccount: ${(lockupAccount.authority as PublicKey).toString()}`);

    // // 還原
    // await program.state.rpc.setAuthority(provider.wallet.publicKey, {
    //     accounts: {
    //         authority: newAuthority.publicKey,
    //     },
    //     signers: [newAuthority],
    // });

    // lockupAccount = await program.state.fetch();
    // console.log(`Undo setAuthority lockupAccount: ${(lockupAccount.authority as PublicKey).toString()}`);

    for (const e of lockupAccount.whitelist) {
        await program.state.rpc.whitelistDelete(e, {
            accounts: {
                authority: provider.wallet.publicKey,
            },
        })
    }

    console.log('success!');
}

main().then(
    () => process.exit(),
    err => {
        console.error(err);
        process.exit(-1);
    },
);