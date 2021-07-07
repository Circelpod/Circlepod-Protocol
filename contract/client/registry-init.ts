import * as anchor from '@project-serum/anchor';
import { getLockupInfo, getRegistryProgram, provider } from './app_utils';

// if you deploy first, Pleace Run it with yarn start:devdapp:client:lockup:app:init

async function main() {

    // new contract must run
    await initRegistryProgram(provider);
    console.log('success!');
}

main().then(
    () => process.exit(),
    err => {
        console.error(err);
        process.exit(-1);
    },
);

async function initRegistryProgram(provider: anchor.Provider) {
    const registry = getRegistryProgram(provider);
    await registry.state.rpc.new({
        accounts: {
            lockupProgram: (await getLockupInfo(provider)).programId,
        }
    });
}