import { lockupInit } from './app_utils';

// if you deploy first, Pleace Run it with yarn start:devdapp:client:lockup:init

async function main() {

    await lockupInit();

    console.log('success!');
}

main().then(
    () => process.exit(),
    err => {
        console.error(err);
        process.exit(-1);
    },
);