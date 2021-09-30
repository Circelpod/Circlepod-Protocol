import * as anchor from '@project-serum/anchor';
import fs from 'fs';
import path from 'path';
import {TokenInstructions} from '@project-serum/serum';
import * as spl from '@solana/spl-token';
import * as serumCmn from '@project-serum/common';
import {NodeWallet, sleep} from '@project-serum/common';

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const idoAmount = 5 * Math.pow(10, 6);

console.log(`銷售數量: ${idoAmount / Math.pow(10, 6)}`);

const secTrans = isProd ? 20 : 20;
const preSecForStartIdo = isProd ? 60 * 5 : 5; // 60 * 5 5Min;
const saveSec = isProd ? 60 * 60 * 24 : 60 * 3; // 60 * 60 * 24 24H
const endForEndIdo = isProd ? saveSec * 2 : saveSec * 1.25; // 60 * 60 * 24 * 2

console.log(`環境配置, 是否為正式環境: ${isProd}`);
console.log(`交易間隔: ${secTrans}`);
console.log(`IDO 前置間隔: ${preSecForStartIdo}`);
console.log(`IDO 存入期間 ${saveSec}`);
console.log(`IDO 結束期間 ${endForEndIdo}`);

let connectionString = isProd
  ? 'https://api.mainnet-beta.solana.com'
  : 'http://localhost:8899';
connectionString = isTest ? 'https://api.devnet.solana.com' : connectionString;

export const connection = new anchor.web3.Connection(connectionString);
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
  const watermelonIdoAmount = new anchor.BN(idoAmount);

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
  } = await initIdoPool(
    watermelonMint,
    program,
    usdcMint,
    watermelonIdoAmount,
    creatorWatermelon,
  );

  await sleep(secTrans * 100);

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

  const {firstDeposit, userUsdc, userRedeemable} = await user1PayUSDCJoinIDO(
    startIdoTs,
    usdcMint,
    usdcMintToken,
    redeemableMint,
    program,
    poolAccount,
    poolSigner,
    poolUsdc,
  );

  const {totalPoolUsdc, secondDeposit, secondUserRedeemable} =
    await user2PayUSDCJoinIDO(
      usdcMint,
      usdcMintToken,
      redeemableMint,
      program,
      poolAccount,
      poolSigner,
      poolUsdc,
      firstDeposit,
    );

  const {firstWithdrawal, newTotalPoolUsdc} = await userExchangeBackToUSDC(
    program,
    poolAccount,
    poolSigner,
    redeemableMint,
    poolUsdc,
    userUsdc,
    userRedeemable,
    totalPoolUsdc,
  );

  await user1GetPurchasedToken(
    endIdoTs,
    firstDeposit,
    firstWithdrawal,
    watermelonMint,
    program,
    poolAccount,
    poolSigner,
    redeemableMint,
    poolWatermelon,
    userRedeemable,
    watermelonIdoAmount,
    newTotalPoolUsdc,
  );

  console.log(`------------------------`);
  console.log(`使用者 2 進行取出購買的 Token, 並且銷毀 Redeemable Token`);

  const secondUserWatermelon = await createTokenAccount(
    provider,
    watermelonMint,
    provider.wallet.publicKey,
  );

  await program.rpc.exchangeRedeemableForWatermelon(secondDeposit, {
    accounts: {
      poolAccount: poolAccount.publicKey,
      poolSigner,
      redeemableMint,
      poolWatermelon,
      userAuthority: provider.wallet.publicKey,
      userWatermelon: secondUserWatermelon,
      userRedeemable: secondUserRedeemable,
      tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    },
  });

  await sleep(secTrans * 1000);

  const poolWatermelonAccount = await getTokenAccount(provider, poolWatermelon);
  console.log(
    `所有使用者都取得購買的 Token, 所以 Pool 銷售 Token 餘額應該為零: ${poolWatermelonAccount.amount}`,
  );

  console.log(`------------------------`);
  console.log(`項目方快樂拿錢`);

  await program.rpc.withdrawPoolUsdc({
    accounts: {
      poolAccount: poolAccount.publicKey,
      poolSigner,
      distributionAuthority: provider.wallet.publicKey,
      creatorUsdc,
      poolUsdc,
      tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    },
  });

  await sleep(secTrans * 1000);

  const poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
  console.log(`銷售池裡的 USDC 應該全數被領出: ${poolUsdcAccount.amount}`);

  const creatorUsdcAccount = await getTokenAccount(provider, creatorUsdc);
  console.log(`銷售者預期提款金額: ${newTotalPoolUsdc}`);
  console.log(`銷售者實際提款金額: ${creatorUsdcAccount.amount}`);

  console.log(`------------------------`);
  console.log('success!');
}

async function user1GetPurchasedToken(
  endIdoTs: anchor.BN,
  firstDeposit: anchor.BN,
  firstWithdrawal: anchor.BN,
  watermelonMint: anchor.web3.PublicKey,
  program: anchor.Program,
  poolAccount: anchor.web3.Keypair,
  poolSigner: anchor.web3.PublicKey,
  redeemableMint: anchor.web3.PublicKey,
  poolWatermelon: anchor.web3.PublicKey,
  userRedeemable: anchor.web3.PublicKey,
  watermelonIdoAmount: anchor.BN,
  newTotalPoolUsdc: anchor.BN,
) {
  console.log(`------------------------`);
  console.log(`使用者 1 進行取出購買的 Token, 並且銷毀 Redeemable Token`);

  // Wait until the IDO has opened.
  console.log(`現在時間: ${Date.now() / 1000}`);
  console.log(`IDO 結束時間: ${endIdoTs.toNumber()}`);
  console.log(
    `需等待 ${
      Date.now() < endIdoTs.toNumber() * 1000
        ? (endIdoTs.toNumber() * 1000 - Date.now() + 2000) / 1000
        : 0
    } 秒`,
  );
  // Wait until the IDO has opened.
  if (Date.now() < endIdoTs.toNumber() * 1000) {
    await sleep(endIdoTs.toNumber() * 1000 - Date.now() + 2000);
  }

  const firstUserRedeemable = firstDeposit.sub(firstWithdrawal);
  const userWatermelon = await createTokenAccount(
    provider,
    watermelonMint,
    provider.wallet.publicKey,
  );

  await program.rpc.exchangeRedeemableForWatermelon(firstUserRedeemable, {
    accounts: {
      poolAccount: poolAccount.publicKey,
      poolSigner,
      redeemableMint,
      poolWatermelon,
      userAuthority: provider.wallet.publicKey,
      userWatermelon,
      userRedeemable,
      tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    },
  });

  console.log(
    `預期 User1 Redeemable: ${firstUserRedeemable}, 總銷售量:${watermelonIdoAmount}, 最新 Pool USDC: ${newTotalPoolUsdc}`,
  );

  await sleep(secTrans * 1000);

  const poolWatermelonAccount = await getTokenAccount(provider, poolWatermelon);

  const redeemedWatermelon = firstUserRedeemable
    .mul(watermelonIdoAmount)
    .div(newTotalPoolUsdc);

  console.log(`預期中 User 預期取得銷售數量: ${redeemedWatermelon}`);

  const userWatermelonAccount = await getTokenAccount(provider, userWatermelon);
  console.log(
    `實際上 User 中取得銷售 Token 數量: ${userWatermelonAccount.amount}`,
  );

  const remainingWatermelon = watermelonIdoAmount.sub(
    userWatermelonAccount.amount,
  );
  console.log(`預期中 Pool 中剩下的銷售 Token 數量: ${remainingWatermelon}`);
  console.log(`IDO 總銷售數量: ${poolWatermelonAccount.amount}`);
}

async function userExchangeBackToUSDC(
  program: anchor.Program,
  poolAccount: anchor.web3.Keypair,
  poolSigner: anchor.web3.PublicKey,
  redeemableMint: anchor.web3.PublicKey,
  poolUsdc: anchor.web3.PublicKey,
  userUsdc: anchor.web3.PublicKey,
  userRedeemable: anchor.web3.PublicKey,
  totalPoolUsdc: anchor.BN,
) {
  console.log(`------------------------`);
  console.log(`使用者 1 進行取出 USDC, 並且銷毀 Redeemable Token`);
  const firstWithdrawal = new anchor.BN(2000000);
  console.log(`使用者 1 取出: ${firstWithdrawal} USDC`);

  await program.rpc.exchangeRedeemableForUsdc(firstWithdrawal, {
    accounts: {
      poolAccount: poolAccount.publicKey,
      poolSigner,
      redeemableMint,
      poolUsdc,
      userAuthority: provider.wallet.publicKey,
      userUsdc,
      userRedeemable,
      tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    },
  });

  await sleep(secTrans * 1000);

  const userUsdcAccount = await getTokenAccount(provider, userUsdc);
  console.log(
    `實際上的 User 1 總 USDC 存款: ${userUsdcAccount.amount.toNumber()}`,
  );

  const nowTotalPoolUsdc = totalPoolUsdc.sub(firstWithdrawal);
  console.log(`預期的 IDO Pool 總 USDC 存款應該為: ${nowTotalPoolUsdc}`);

  const poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
  console.log(
    `實際上的 IDO Pool 總 USDC 存款: ${poolUsdcAccount.amount.toNumber()}`,
  );

  return {firstWithdrawal, newTotalPoolUsdc: nowTotalPoolUsdc};
}

async function user2PayUSDCJoinIDO(
  usdcMint: anchor.web3.PublicKey,
  usdcMintToken: spl.Token,
  redeemableMint: anchor.web3.PublicKey,
  program: anchor.Program,
  poolAccount: anchor.web3.Keypair,
  poolSigner: anchor.web3.PublicKey,
  poolUsdc: anchor.web3.PublicKey,
  firstDeposit: anchor.BN,
) {
  console.log(`------------------------`);
  console.log(`使用者 2 進行存入 USDC, 並且取得 Redeemable Token`);

  // 23 usdc
  const secondDeposit = new anchor.BN(23000672);
  console.log(`使用者 2 存入: ${secondDeposit} USDC`);

  const secondUserUsdc = await createTokenAccount(
    provider,
    usdcMint,
    provider.wallet.publicKey,
  );
  console.log(`使用者 2 USDC Token Account: ${secondUserUsdc.toString()}`);
  await usdcMintToken.mintTo(
    secondUserUsdc,
    provider.wallet.publicKey,
    [],
    secondDeposit.toNumber(),
  );
  const secondUserRedeemable = await createTokenAccount(
    provider,
    redeemableMint,
    provider.wallet.publicKey,
  );
  console.log(
    `使用者 2 Redeemable Token Account: ${secondUserUsdc.toString()}`,
  );

  await program.rpc.exchangeUsdcForRedeemable(secondDeposit, {
    accounts: {
      poolAccount: poolAccount.publicKey,
      poolSigner,
      redeemableMint,
      poolUsdc,
      userAuthority: provider.wallet.publicKey,
      userUsdc: secondUserUsdc,
      userRedeemable: secondUserRedeemable,
      tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    },
  });

  const totalPoolUsdc = firstDeposit.add(secondDeposit);
  console.log(`預期的 IDO Pool 總 USDC 存款應該為: ${totalPoolUsdc}`);

  await sleep(secTrans * 1000);
  const poolUsdcAccount = await getTokenAccount(provider, poolUsdc);

  console.log(
    `實際上的 IDO Pool 總 USDC 存款: ${poolUsdcAccount.amount.toNumber()}`,
  );

  return {totalPoolUsdc, secondDeposit, secondUserRedeemable};
}

async function user1PayUSDCJoinIDO(
  startIdoTs: anchor.BN,
  usdcMint: anchor.web3.PublicKey,
  usdcMintToken: spl.Token,
  redeemableMint: anchor.web3.PublicKey,
  program: anchor.Program,
  poolAccount: anchor.web3.Keypair,
  poolSigner: anchor.web3.PublicKey,
  poolUsdc: anchor.web3.PublicKey,
) {
  console.log(`------------------------`);
  console.log(`使用者 1 進行存入 USDC, 並且取得 Redeemable Token`);

  // Wait until the IDO has opened.
  console.log(`現在時間: ${Date.now() / 1000}`);
  console.log(`IDO 開始時間: ${startIdoTs.toNumber()}`);
  console.log(
    `需等待 ${
      Date.now() < startIdoTs.toNumber() * 1000
        ? (startIdoTs.toNumber() * 1000 - Date.now() + 1000) / 1000
        : 0
    } 秒`,
  );

  if (Date.now() < startIdoTs.toNumber() * 1000) {
    await sleep(startIdoTs.toNumber() * 1000 - Date.now() + 1000);
  }

  // 10 usdc
  const firstDeposit = new anchor.BN(10000349);
  console.log(`使用者 1 存入: ${firstDeposit} USDC`);

  const userUsdc = await createTokenAccount(
    provider,
    usdcMint,
    provider.wallet.publicKey,
  );
  console.log(`使用者 2 USDC Token Account: ${userUsdc.toString()}`);
  await usdcMintToken.mintTo(
    userUsdc,
    provider.wallet.publicKey,
    [],
    firstDeposit.toNumber(),
  );
  const userRedeemable = await createTokenAccount(
    provider,
    redeemableMint,
    provider.wallet.publicKey,
  );
  console.log(
    `使用者 2 Redeemable Token Account: ${userRedeemable.toString()}`,
  );

  try {
    const tx = await program.rpc.exchangeUsdcForRedeemable(firstDeposit, {
      accounts: {
        poolAccount: poolAccount.publicKey,
        poolSigner,
        redeemableMint,
        poolUsdc,
        userAuthority: provider.wallet.publicKey,
        userUsdc,
        userRedeemable,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
    });
  } catch (err: any) {
    console.log('This is the error message', err.toString());
  }

  await sleep(secTrans * 1000);

  const poolUsdcAccount = await getTokenAccount(provider, poolUsdc);

  const userRedeemableAccount = await getTokenAccount(provider, userRedeemable);

  console.log(
    `Pool USDC 數量（因為使用者 1 提交了 IDO 申請, 支付 USDC, 所以餘額應該為 ${firstDeposit.toNumber()}）: ${poolUsdcAccount.amount.toNumber()}`,
  );
  console.log(
    `User Redeemable（因為使用者 1 提交了 IDO 申請, 支付 USDC, 所以餘額該為 ${firstDeposit.toNumber()}）數量: ${userRedeemableAccount.amount.toNumber()}`,
  );

  return {firstDeposit, userUsdc, userRedeemable};
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

  console.log(`與 IDO 合約交互的簽名地址: ${poolSigner.toString()}`);
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
  console.log(`Pool Account: ${poolAccount.publicKey}`);

  const now = Date.now() / 1000;
  console.log(`現在時間: ${now}`);

  const nowBn = new anchor.BN(now + secTrans);

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

  await sleep(secTrans * 1000);
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
    `銷售者的 Watermelon Token Account（因為提交了 IDO, 所以餘額應該為 0）: ${creatorWatermelon.toString()}, mint: ${
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
  console.log(`------------------------`);
  // USDC 的 Token mint
  const usdcMintToken = await createMint(provider, undefined);
  console.log(`成功 mint usdc token: ${usdcMintToken.publicKey.toString()}`);

  // 即將銷售的幣別 Token mint
  const watermelonMintToken = await createMint(provider, undefined);
  console.log(
    `成功 mint watermelon token: ${watermelonMintToken.publicKey.toString()}`,
  );

  const usdcMint = usdcMintToken.publicKey;
  const watermelonMint = watermelonMintToken.publicKey;

  // 創建銷售者的 USDC's Token Account
  const creatorUsdc = await createTokenAccount(
    provider,
    usdcMint,
    provider.wallet.publicKey,
  );
  console.log(`成功創建銷售者的 usdc token account: ${creatorUsdc}`);

  // 創建銷售者的 即將銷售的幣別's Token Account
  const creatorWatermelon = await createTokenAccount(
    provider,
    watermelonMint,
    provider.wallet.publicKey,
  );
  console.log(
    `成功創建銷售者的 watermelon token account: ${creatorWatermelon}`,
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
    `獲取創建者的 watermelon 數量: ${creator_watermelon_account.amount.toNumber()}`,
  );

  console.log(`本次 IDO 數量: ${watermelonIdoAmount.toNumber()}`);
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
