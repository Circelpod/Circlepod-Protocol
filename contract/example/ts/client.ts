import * as anchor from '@project-serum/anchor';
import fs from 'fs';
import path from 'path';

async function main() {
    // Read the generated IDL.
    const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'target/idl/circlepod_protocol.json'), 'utf8'));

    // Address of the deployed program.
    const programId = new anchor.web3.PublicKey('7cWcZ8gewKy7pGXRKYJfiAYNyMSdfCavCvuEeMH5sswM');

    // Generate the program client from IDL.
    const program = new anchor.Program(idl, programId);

    // Execute the RPC.
    await program.rpc.initialize();

    console.log('success!');
}

main().then(
    () => process.exit(),
    err => {
        console.error(err);
        process.exit(-1);
    },
);