import * as anchor from '@project-serum/anchor';
import fs from 'fs';
import path from 'path';
import {TokenInstructions} from '@project-serum/serum';
import * as spl from '@solana/spl-token';
import * as serumCmn from '@project-serum/common';
import {NodeWallet, sleep} from '@project-serum/common';

export const connection = new anchor.web3.Connection('http://localhost:8899');
export const provider = new anchor.Provider(
  connection,
  NodeWallet.local(),
  anchor.Provider.defaultOptions(),
);

export const IDOSALE_Program_ID =
  'BvQQDMTy9XunH3muJaz6sckwpjyEeEvUqUowpSXBGVW7';

async function main() {
  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  const program = getRegistryProgram(provider);

  // All mints default to 6 decimal places.
  const watermelonIdoAmount = new anchor.BN(5000000);

  // These are all of the variables we assume exist in the world already and
  // are available to the client.

  // 真實銷售不需要 initializes, 只是為了執行建制整體環境。實際上，應該都要先具備。
  const {
    usdcMintToken,
    watermelonMintToken,
    usdcMint,
    watermelonMint,
    creatorUsdc,
    creatorWatermelon,
  } = await initializes(watermelonIdoAmount);
  // initializes 結束

  // 初始化銷售開始
  // These are all variables the client will have to create to initialize the
  // IDO pool
  // We use the watermelon mint address as the seed, could use something else though.
  const {
    poolSigner,
    redeemableMintToken,
    redeemableMint,
    poolWatermelon,
    poolUsdc,
    poolAccount,
    startIdoTs,
    endDepositsTs,
    endIdoTs,
  } = await initIDOPool(
    watermelonMint,
    program,
    usdcMint,
    watermelonIdoAmount,
    creatorWatermelon,
  );

  console.log('success!');
}

async function initIDOPool(
  watermelonMint: anchor.web3.PublicKey,
  program: anchor.Program,
  usdcMint: anchor.web3.PublicKey,
  watermelonIdoAmount: anchor.BN,
  creatorWatermelon: anchor.web3.PublicKey,
) {
  const [_poolSigner, nonce] = await anchor.web3.PublicKey.findProgramAddress(
    [watermelonMint.toBuffer()],
    program.programId,
  );
  const poolSigner = _poolSigner;

  // Pool doesn't need a Redeemable SPL token account because it only
  // burns and mints redeemable tokens, it never stores them.
  const redeemableMintToken = await createMint(provider, poolSigner);
  const redeemableMint = redeemableMintToken.publicKey;

  const poolWatermelon = await createTokenAccount(
    provider,
    watermelonMint,
    poolSigner,
  );
  console.log(`Pool Watermelon Token Account: ${poolWatermelon.toString()}`);

  const poolUsdc = await createTokenAccount(provider, usdcMint, poolSigner);
  console.log(`Pool USDC Token Account: ${poolUsdc.toString()}`);

  const poolAccount = anchor.web3.Keypair.generate();
  console.log(`Pool Account: ${poolAccount.publicKey}`);

  const now = Date.now();
  console.log(`現在時間: ${now}`);

  const nowBn = new anchor.BN(Date.now() / 1000);

  const startIdoTs = nowBn.add(new anchor.BN(5));
  console.log(`Ido 開始時間: ${startIdoTs.toNumber()}`);

  const endDepositsTs = nowBn.add(new anchor.BN(10));
  console.log(`Ido 存入結束時間: ${endDepositsTs.toNumber()}`);

  const endIdoTs = nowBn.add(new anchor.BN(15));
  console.log(`Ido 結束時間: ${endIdoTs.toNumber()}`);

  // Atomically create the new account and initialize it with the program.
  // 注意 WatermelonIdoAmount 銷售數量
  await program.rpc.initializePool(
    watermelonIdoAmount,
    nonce,
    startIdoTs,
    endDepositsTs,
    endIdoTs,
    {
      accounts: {
        poolAccount: poolAccount.publicKey,
        poolSigner,
        distributionAuthority: provider.wallet.publicKey,
        creatorWatermelon,
        redeemableMint,
        usdcMint,
        poolWatermelon,
        poolUsdc,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
      signers: [poolAccount],
      instructions: [
        await program.account.poolAccount.createInstruction(poolAccount),
      ],
    },
  );

  await sleep(10000);
  const creators_watermelon_account = await getTokenAccount(
    provider,
    creatorWatermelon,
  );

  console.log(`此次 IDO 銷售數量為: ${watermelonIdoAmount.toNumber()}`);
  console.log(
    `Creator's Watermelon ${creatorWatermelon.toString()}, mint: ${
      creators_watermelon_account.mint
    } amount: ${creators_watermelon_account.amount.toNumber()}`,
  );
  return {
    poolSigner,
    redeemableMintToken,
    redeemableMint,
    poolWatermelon,
    poolUsdc,
    poolAccount,
    startIdoTs,
    endDepositsTs,
    endIdoTs,
  };
}

async function initializes(watermelonIdoAmount: anchor.BN) {
  // USDC 的 Token mint
  const usdcMintToken = await createMint(provider, undefined);
  console.log(`success mint usdc token: ${usdcMintToken.publicKey.toString()}`);

  // 即將銷售的幣別 Token mint
  const watermelonMintToken = await createMint(provider, undefined);
  console.log(
    `success mint watermelon token: ${watermelonMintToken.publicKey.toString()}`,
  );

  const usdcMint = usdcMintToken.publicKey;
  const watermelonMint = watermelonMintToken.publicKey;

  // 創建銷售者的 USDC's Token Account
  const creatorUsdc = await createTokenAccount(
    provider,
    usdcMint,
    provider.wallet.publicKey,
  );
  console.log(`success create creator's usdc token account: ${creatorUsdc}`);

  // 創建銷售者的 即將銷售的幣別's Token Account
  const creatorWatermelon = await createTokenAccount(
    provider,
    watermelonMint,
    provider.wallet.publicKey,
  );
  console.log(
    `success create creator's watermelon token account: ${creatorWatermelon}`,
  );

  // 即將銷售的幣別's Token 數量
  // Mint Watermelon tokens the will be distributed from the IDO pool.
  await watermelonMintToken.mintTo(
    creatorWatermelon,
    provider.wallet.publicKey,
    [],
    watermelonIdoAmount.toNumber(),
  );

  const creator_watermelon_account = await getTokenAccount(
    provider,
    creatorWatermelon,
  );

  console.log(
    creator_watermelon_account.amount.toNumber(),
    'creator_watermelon_account:amount',
  );

  console.log(watermelonIdoAmount.toNumber(), 'watermelonIdoAmount');
  return {
    usdcMintToken,
    watermelonMintToken,
    usdcMint,
    watermelonMint,
    creatorUsdc,
    creatorWatermelon,
  };
}

async function createMint(provider: anchor.Provider, authority: any) {
  if (authority === undefined) {
    authority = provider.wallet.publicKey;
  }
  const mint = await spl.Token.createMint(
    provider.connection,
    (provider.wallet as any).payer,
    authority,
    null,
    6,
    TokenInstructions.TOKEN_PROGRAM_ID,
  );

  return mint;
}

async function createTokenAccount(
  provider: anchor.Provider,
  mint: anchor.web3.PublicKey,
  owner: anchor.web3.PublicKey,
): Promise<anchor.web3.PublicKey> {
  const token = new spl.Token(
    provider.connection,
    mint,
    TokenInstructions.TOKEN_PROGRAM_ID,
    (provider.wallet as any).payer,
  );
  const vault = await token.createAccount(owner);
  return vault;
}

async function getTokenAccount(
  provider: anchor.Provider,
  addr: anchor.web3.PublicKey,
) {
  return await serumCmn.getTokenAccount(provider, addr);
}

export function getRegistryProgram(provider: anchor.Provider) {
  // Read the generated IDL.
  const idl = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '..', 'target/idl/ido_sale.json'),
      'utf8',
    ),
  );

  const registryProgramId = new anchor.web3.PublicKey(IDOSALE_Program_ID);
  // Generate the program client from IDL.
  const registry = new anchor.Program(idl, registryProgramId, provider);

  return registry;
}

main().then(
  () => process.exit(),
  err => {
    console.error(err);
    process.exit(-1);
  },
);
