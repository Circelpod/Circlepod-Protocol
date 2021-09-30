import * as anchor from '@project-serum/anchor';
import fs from 'fs';
import path from 'path';
import {TokenInstructions} from '@project-serum/serum';
import * as spl from '@solana/spl-token';
import * as serumCmn from '@project-serum/common';
import {
  endForEndIdo,
  idoAmount,
  IDOSALE_Program_ID,
  isProd,
  preSecForStartIdo,
  provider,
  saveSec,
  secTrans,
  watermelonMint,
  usdcMint,
  getTokenAccount,
  findTokenAccount,
  createTokenAccount,
  saleTime,
  getConnectionString,
} from './ido-config';

async function main() {
  console.log(`------------------------`);
  console.log(`RPC 連線位置: ${getConnectionString()}`);
  const creatorSaleTokenAccount = await findTokenAccount(
    provider.wallet.publicKey,
  );

  console.log(`銷售者錢包地址: ${provider.wallet.publicKey.toString()}`);
  console.log(
    `銷售者錢包 Token Account 地址: ${creatorSaleTokenAccount.toString()}`,
  );
  console.log(`------------------------`);
  console.log(`銷售開始基準時間: ${new Date(saleTime * 1000).toUTCString()}`);
  console.log(
    `銷售開始時間: ${new Date(
      (saleTime + preSecForStartIdo) * 1000,
    ).toUTCString()}`,
  );
  console.log(
    `最後存入時間: ${new Date(
      (saleTime + preSecForStartIdo + saveSec) * 1000,
    ).toUTCString()}`,
  );
  console.log(
    `銷售結束時間: ${new Date(
      (saleTime + preSecForStartIdo + endForEndIdo) * 1000,
    ).toUTCString()}`,
  );
  console.log(`銷售數量: ${idoAmount / Math.pow(10, 6)}`);
  console.log(`------------------------`);
  console.log(`銷售幣種 Mint: ${watermelonMint}`);
  console.log(`收款 USDC Mint: ${usdcMint}`);
  console.log(`------------------------`);
  console.log(`環境配置, 是否為正式環境: ${isProd}`);
  console.log(`交易間隔: ${secTrans}`);
  console.log(`------------------------`);
  console.log(`IDO 前置間隔: ${preSecForStartIdo}`);
  console.log(`IDO 存入期間 ${saveSec}`);
  console.log(`IDO 結束期間 ${endForEndIdo}`);

  console.log(`開始計時 30 秒，請確認資訊正確`);
  await serumCmn.sleep(27000);

  console.log(`3 秒後開始執行`);
  await serumCmn.sleep(1000);
  console.log(`2 秒後開始執行`);
  await serumCmn.sleep(1000);
  console.log(`1 秒後開始執行`);
  await serumCmn.sleep(1000);
  console.log(`開始執行`);

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  const program = getRegistryProgram(provider);

  // All mints default to 6 decimal places.
  const watermelonIdoAmount = new anchor.BN(idoAmount);

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
  } = await initIdoPool(
    watermelonMint,
    program,
    usdcMint,
    watermelonIdoAmount,
    creatorSaleTokenAccount,
  );

  await serumCmn.sleep(secTrans * 100);

  const poolAccountData = await program.account.poolAccount.fetch(
    poolAccount.publicKey,
  );
  console.log(
    `Redeemable Mint: " ${poolAccountData.redeemableMint.toString()}`,
  );
  console.log(
    `Pool Watermelon: " ${poolAccountData.poolWatermelon.toString()}`,
  );
  console.log(
    `Watermelon Mint: " ${poolAccountData.watermelonMint.toString()}`,
  );
  console.log(`Pool Usdc: " ${poolAccountData.poolUsdc.toString()}`);
  console.log(
    `Distribution Authority: " ${poolAccountData.distributionAuthority.toString()}`,
  );

  console.log(`Num Ido Tokens: " ${poolAccountData.numIdoTokens.toNumber()}`);
  console.log(`Start Ido Ts: " ${poolAccountData.startIdoTs.toNumber()}`);
  console.log(`End DepositsTs: " ${poolAccountData.endDepositsTs.toNumber()}`);
  console.log(`End Ido Ts: " ${poolAccountData.endIdoTs.toNumber()}`);

  console.log(`------------------------`);
  console.log('success!');
}

async function initIdoPool(
  watermelonMint: anchor.web3.PublicKey,
  program: anchor.Program,
  usdcMint: anchor.web3.PublicKey,
  watermelonIdoAmount: anchor.BN,
  creatorWatermelon: anchor.web3.PublicKey,
) {
  console.log(`------------------------`);

  const [_poolSigner, nonce] = await anchor.web3.PublicKey.findProgramAddress(
    [watermelonMint.toBuffer()],
    program.programId,
  );
  const poolSigner = _poolSigner;

  console.log(
    `與 IDO 合約交互的簽名地址(Pool Signer): ${poolSigner.toString()}`,
  );
  // Redeemable 是一種證明使用者將資金存入 IDO 池中的 TOKEN
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
  console.log(`Pool Account PublicKey: ${poolAccount.publicKey.toString()}`);
  console.log(`Pool Account SecretKey: ${poolAccount.secretKey.toString()}`);

  const nowBn = new anchor.BN(saleTime + secTrans);

  // 開始 IDO 時間 = 現在時間 + 緩衝時間
  const startIdoTs = nowBn.add(new anchor.BN(preSecForStartIdo));
  console.log(`Ido 開始時間: ${startIdoTs.toNumber()}`);

  // 結束存入時間 = 開始時間 + 存入期間
  const endDepositsTs = startIdoTs.add(new anchor.BN(saveSec));
  console.log(`Ido 存入結束時間: ${endDepositsTs.toNumber()}`);

  // 結束 IDO 時間 = 開始時間 + (整體活動時間 = 存入期間 * 2)
  const endIdoTs = startIdoTs.add(new anchor.BN(endForEndIdo));
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

  await serumCmn.sleep(secTrans * 1000);
  const pool_watermelon_account = await getTokenAccount(
    provider,
    poolWatermelon,
  );
  const creators_watermelon_account = await getTokenAccount(
    provider,
    creatorWatermelon,
  );

  console.log(
    `此次 IDO 銷售數量（pool）為: ${pool_watermelon_account.amount.toNumber()}`,
  );
  console.log(
    `銷售者的 Watermelon Token Account（因為提交了 IDO, 所以餘額應該減少）: ${creatorWatermelon.toString()}, mint: ${
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

export function getRegistryProgram(provider: anchor.Provider): anchor.Program {
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
