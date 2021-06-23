import * as anchor from '@project-serum/anchor';
import * as serumCmn from '@project-serum/common';
import {TokenInstructions} from '@project-serum/serum';
import {PublicKey} from '@solana/web3.js';
import {getRegistryProgram} from './lockup_utils';

// Devnet
// const connection = new anchor.web3.Connection('https://api.devnet.solana.com');
// const provider = new anchor.Provider(connection, NodeWallet.local(), anchor.Provider.defaultOptions());
// const tokenMint = '9mog4nr4remcLLbSzhxjJnT7XrgbgpZDuBYzXCwZYyVp';
// const tokenAccount = '3rrwsoCkkeFj2op7DSGWztGwmFwQwpJ2EAaredSqKMrA';

// Local
const provider = anchor.Provider.local();
const tokenMint = 'GJ65oHuFLo3K48CU3MUJk4mjqDsBpNReKttnwptdTfX4';
const tokenAccount = 'FdsYvUaa61sYxMiDXHFGDyQLjHewppLRoLHaWEtR2HsF';

const registrar = 'FpLS8UeEw9f7gW2XsK6dEY1CoQ7nzWGHafc8VmXdL5gA';
const poolMint = 'Ff1KvJ37pQrS6s9D1A9QUmGB1mPecHRoLesP8yZjKj2p';

async function main() {
  const rewardQ = await getChannelPoolRewardQueue(registrar);
  await dropsUnlockedReward(registrar, rewardQ.toString(), poolMint);
  console.log('success!');
}

main().then(
  () => process.exit(),
  err => {
    console.error(err);
    process.exit(-1);
  },
);

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
  const expiry = new anchor.BN((Date.now() / 1000) + 60 * 60 * 24 * 30);
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
