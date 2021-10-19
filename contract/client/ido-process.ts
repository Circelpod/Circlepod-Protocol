import * as anchor from '@project-serum/anchor';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {NodeWallet, sleep, getTokenAccount} from '@project-serum/common';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {createTokenAccount, createMint, IdoTimes, Bumps} from './ido-config';
import {Transaction} from '@solana/web3.js';

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const idoAmount = 5 * Math.pow(10, 6);

console.log(`銷售數量: ${idoAmount / Math.pow(10, 6)}`);

const secTrans = isProd ? 20 : 20;
const preSecForStartIdo = isProd ? 60 * 5 : 5; // 60 * 5 5Min;
const saveSec = isProd ? 60 * 60 * 24 : 60 * 3; // 60 * 60 * 24 24H
const endForEndIdo = isProd ? saveSec * 2 : saveSec * 1.05; // 60 * 60 * 24 * 2
const endForEndIdoEsc = isProd ? saveSec * 4 : saveSec * 1.2; // 60 * 60 * 24 * 4

const idoName = crypto
  .createHash('sha256')
  .update(Date.now().toString())
  .digest('hex')
  .substring(0, 10);

console.log(`IDO 名稱: ${idoName}`);

console.log(`環境配置, 是否為正式環境: ${isProd}`);
console.log(`交易間隔: ${secTrans}`);
console.log(`IDO 前置間隔: ${preSecForStartIdo}`);
console.log(`IDO 存入期間 ${saveSec}`);
console.log(`IDO 結束期間 ${endForEndIdo}`);
console.log(`IDO USDC 延遲取出時間 ${endForEndIdoEsc}`);

let connectionString = isProd
  ? 'https://api.mainnet-beta.solana.com'
  : 'http://localhost:8899';
connectionString = isTest ? 'https://api.devnet.solana.com' : connectionString;

console.log(`Connection String: ${connectionString}`);

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

  // 真實銷售不需要 initializes, 只是為了執行建制整體環境。實際上，應該都要先具備。
  // These are all of the variables we assume exist in the world already and
  // are available to the client.
  const {
    usdcMintAccount,
    watermelonMintAccount,
    usdcMint,
    watermelonMint,
    idoAuthorityUsdc,
    idoAuthorityWatermelon,
  } = await initializes(watermelonIdoAmount);

  // 初始化銷售開始
  // These are all variables the client will have to create to initialize the
  // IDO pool
  // We use the watermelon mint address as the seed, could use something else though.
  const {
    redeemableMint,
    poolWatermelon,
    poolUsdc,
    startIdoTs,
    endDepositsTs,
    endIdoTs,
    endIdoEscTs,
  } = await initIdoPool(
    idoName,
    watermelonMint,
    program,
    usdcMint,
    watermelonIdoAmount,
    idoAuthorityWatermelon,
  );

  await sleep(secTrans * 100);

  const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(idoName)],
    program.programId,
  );

  // 列印一下 ido 帳戶資訊
  await printIdoAccountInfo(idoAccount, program);

  // 使用者 1 參與 ido
  const {firstDeposit, userUsdc} = await user1PayUSDCJoinIDO(
    idoName,
    startIdoTs,
    usdcMint,
    usdcMintAccount,
    program,
    watermelonMint,
  );

  // 使用者 2 參與 ido
  const {
    totalPoolUsdc,
    secondDeposit,
    secondUserRedeemable,
    secondUserKeypair,
  } = await user2PayUSDCJoinIDO(
    idoName,
    usdcMint,
    usdcMintAccount,
    program,
    firstDeposit,
    watermelonMint,
  );

  // 使用者 1 申請退回正在 ido 的部分金額
  const {firstWithdrawal, newTotalPoolUsdc, userRedeemable} =
    await userExchangeBackToUSDC(
      idoName,
      program,
      userUsdc,
      totalPoolUsdc,
      usdcMint,
      watermelonMint,
      idoAccount,
      redeemableMint,
      poolUsdc,
    );

  // 使用者 1 取得已經購買的 Token
  await user1GetPurchasedToken(
    idoName,
    endIdoTs,
    firstDeposit,
    firstWithdrawal,
    watermelonMint,
    program,
    watermelonIdoAmount,
    newTotalPoolUsdc,
    idoAccount,
    redeemableMint,
    poolWatermelon,
    userRedeemable,
  );

  // 使用者 2 取得已經購買的 Token
  await user2GetPurchasedToken(
    watermelonMint,
    program,
    secondDeposit,
    secondUserKeypair,
    secondUserRedeemable,
    idoAccount,
    redeemableMint,
    poolWatermelon,
  );

  console.log(`------------------------`);
  console.log(`項目方快樂拿錢`);

  // 項目方提款
  await idoAuthorityWithdrawUSDC(
    program,
    idoAuthorityUsdc,
    idoAccount,
    usdcMint,
    watermelonMint,
    poolUsdc,
    newTotalPoolUsdc,
  );

  console.log(`------------------------`);

  // 退出 ido 部分開始退款
  // Wait until the escrow period is over.
  await withdrawUSDCAfterIdoEnd(
    endIdoEscTs,
    program,
    firstWithdrawal,
    userUsdc,
    idoAccount,
    usdcMint,
  );

  console.log(`------------------------`);
  console.log('success!');
}

async function printIdoAccountInfo(
  idoAccount: anchor.web3.PublicKey,
  program: anchor.Program,
) {
  console.log(`Ido Account: ${idoAccount.toString()}`);

  const poolAccountData = await program.account.idoAccount.fetch(idoAccount);

  const buffer = Buffer.from(poolAccountData.idoName as ArrayBuffer);
  console.log(`Ido Name: ${buffer.toString()}`);
  console.log(`Bumps: ${JSON.stringify(poolAccountData.bumps)}`);
  console.log(`USDC Mint: ${poolAccountData.usdcMint.toString()}`);
  console.log(`Redeemable Mint: ${poolAccountData.redeemableMint.toString()}`);
  console.log(`Watermelon Mint: ${poolAccountData.watermelonMint.toString()}`);
  console.log(`Pool Usdc: ${poolAccountData.poolUsdc.toString()}`);
  console.log(`Pool Watermelon: ${poolAccountData.poolWatermelon.toString()}`);
  console.log(`Watermelon Mint: ${poolAccountData.watermelonMint.toString()}`);
  console.log(`ido Authority: ${poolAccountData.idoAuthority.toString()}`);

  console.log(`Num Ido Tokens: ${poolAccountData.numIdoTokens.toNumber()}`);
  console.log(`Start Ido Ts: ${poolAccountData.idoTimes.startIdo.toNumber()}`);
  console.log(
    `End DepositsTs: ${poolAccountData.idoTimes.endDeposits.toNumber()}`,
  );
  console.log(`End Ido Ts: ${poolAccountData.idoTimes.endIdo.toNumber()}`);
  console.log(
    `End Escrow Ts: ${poolAccountData.idoTimes.endEscrow.toNumber()}`,
  );
}

async function user2GetPurchasedToken(
  watermelonMint: anchor.web3.PublicKey,
  program: anchor.Program,
  secondDeposit: anchor.BN,
  secondUserKeypair: anchor.web3.Keypair,
  secondUserRedeemable: anchor.web3.PublicKey,
  idoAccount: anchor.web3.PublicKey,
  redeemableMint: anchor.web3.PublicKey,
  poolWatermelon: anchor.web3.PublicKey,
) {
  console.log(`------------------------`);
  console.log(`使用者 2 進行取出購買的 Token, 並且銷毀 Redeemable Token`);

  const secondUserWatermelon = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    watermelonMint,
    secondUserKeypair.publicKey,
  );

  // Get the instructions to add to the RPC call
  const createUserWatermelonInstr =
    Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      watermelonMint,
      secondUserWatermelon,
      secondUserKeypair.publicKey,
      program.provider.wallet.publicKey,
    );
  const createUserWatermelonTrns = new anchor.web3.Transaction().add(
    createUserWatermelonInstr,
  );
  await provider.send(createUserWatermelonTrns);

  console.log(`User2 Watermelon: ${secondUserWatermelon.toString()}`);
  await sleep(secTrans * 3000);

  await program.rpc.exchangeRedeemableForWatermelon(secondDeposit, {
    accounts: {
      payer: provider.wallet.publicKey,
      userAuthority: secondUserKeypair.publicKey,
      userWatermelon: secondUserWatermelon,
      userRedeemable: secondUserRedeemable,
      idoAccount,
      watermelonMint,
      redeemableMint,
      poolWatermelon,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
  });

  await sleep(secTrans * 1000);

  const poolWatermelonAccount = await getTokenAccount(provider, poolWatermelon);
  console.log(
    `所有使用者都取得購買的 Token, 所以 Pool 銷售 Token 餘額應該為零: ${poolWatermelonAccount.amount}`,
  );
}

async function idoAuthorityWithdrawUSDC(
  program: anchor.Program,
  idoAuthorityUsdc: anchor.web3.PublicKey,
  idoAccount: anchor.web3.PublicKey,
  usdcMint: anchor.web3.PublicKey,
  watermelonMint: anchor.web3.PublicKey,
  poolUsdc: anchor.web3.PublicKey,
  newTotalPoolUsdc: anchor.BN,
) {
  await program.rpc.withdrawPoolUsdc({
    accounts: {
      idoAuthority: provider.wallet.publicKey,
      idoAuthorityUsdc,
      idoAccount,
      usdcMint,
      watermelonMint,
      poolUsdc,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
  });

  await sleep(secTrans * 1000);

  const poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
  console.log(`銷售池裡的 USDC 應該全數被領出: ${poolUsdcAccount.amount}`);

  const creatorUsdcAccount = await getTokenAccount(provider, idoAuthorityUsdc);
  console.log(`銷售者預期提款金額: ${newTotalPoolUsdc}`);
  console.log(`銷售者實際提款金額: ${creatorUsdcAccount.amount}`);
}

async function withdrawUSDCAfterIdoEnd(
  endIdoEscTs: anchor.BN,
  program: anchor.Program,
  firstWithdrawal: anchor.BN,
  userUsdc: anchor.web3.PublicKey,
  idoAccount: anchor.web3.PublicKey,
  usdcMint: anchor.web3.PublicKey,
) {
  console.log(`現在時間: ${Date.now() / 1000}`);
  console.log(`USDC 釋放時間: ${endIdoEscTs.toNumber()}`);
  console.log(
    `需等待 ${
      Date.now() < endIdoEscTs.toNumber() * 1000
        ? (endIdoEscTs.toNumber() * 1000 - Date.now() + 2000) / 1000
        : 0
    } 秒`,
  );

  if (Date.now() < endIdoEscTs.toNumber() * 1000 + 1000) {
    await sleep(endIdoEscTs.toNumber() * 1000 - Date.now() + 2000);
  }

  const [escrowUsdc] = await anchor.web3.PublicKey.findProgramAddress(
    [
      provider.wallet.publicKey.toBuffer(),
      Buffer.from(idoName),
      Buffer.from('escrow_usdc'),
    ],
    program.programId,
  );

  await program.rpc.withdrawFromEscrow(firstWithdrawal, {
    accounts: {
      payer: provider.wallet.publicKey,
      userAuthority: provider.wallet.publicKey,
      userUsdc,
      escrowUsdc,
      idoAccount,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
  });

  await sleep(secTrans * 1000);

  const userUsdcAccount = await getTokenAccount(provider, userUsdc);
  console.log(
    `User 1 順利拿回 ${firstWithdrawal}: ${userUsdcAccount.amount.toNumber()}`,
  );
}

async function user1GetPurchasedToken(
  idoName: string,
  endIdoTs: anchor.BN,
  firstDeposit: anchor.BN,
  firstWithdrawal: anchor.BN,
  watermelonMint: anchor.web3.PublicKey,
  program: anchor.Program,
  watermelonIdoAmount: anchor.BN,
  newTotalPoolUsdc: anchor.BN,
  idoAccount: anchor.web3.PublicKey,
  redeemableMint: anchor.web3.PublicKey,
  poolWatermelon: anchor.web3.PublicKey,
  userRedeemable: anchor.web3.PublicKey,
) {
  console.log(`------------------------`);
  console.log(`使用者 1 進行取出購買的 Token, 並且銷毀 Redeemable Token`);

  console.log(`Watermelon Mint: ${watermelonMint.toString()}`);

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

  const userWatermelon = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    watermelonMint,
    provider.wallet.publicKey,
  );

  const instruction = Token.createAssociatedTokenAccountInstruction(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    watermelonMint,
    userWatermelon,
    provider.wallet.publicKey,
    provider.wallet.publicKey,
  );

  const transaction = new Transaction().add(instruction);

  const {blockhash} = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = provider.wallet.publicKey;

  const signed = await provider.wallet.signTransaction(transaction);
  const txid = await connection.sendRawTransaction(signed.serialize());
  const result = await connection.confirmTransaction(txid);

  console.log(`User Watermelon: ${userWatermelon.toString()}`);
  await sleep(secTrans * 1000);

  await program.rpc.exchangeRedeemableForWatermelon(firstUserRedeemable, {
    accounts: {
      payer: provider.wallet.publicKey,
      userAuthority: provider.wallet.publicKey,
      userWatermelon: userWatermelon,
      userRedeemable: userRedeemable,
      idoAccount: idoAccount,
      watermelonMint: watermelonMint,
      redeemableMint: redeemableMint,
      poolWatermelon: poolWatermelon,
      tokenProgram: TOKEN_PROGRAM_ID,
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
  idoName: string,
  program: anchor.Program,
  userUsdc: anchor.web3.PublicKey,
  totalPoolUsdc: anchor.BN,
  usdcMint: anchor.web3.PublicKey,
  watermelonMint: anchor.web3.PublicKey,
  idoAccount: anchor.web3.PublicKey,
  redeemableMint: anchor.web3.PublicKey,
  poolUsdc: anchor.web3.PublicKey,
) {
  console.log(`------------------------`);
  console.log(`使用者 1 進行取出 USDC, 並且銷毀 Redeemable Token`);
  const firstWithdrawal = new anchor.BN(2000000);
  console.log(`使用者 1 取出: ${firstWithdrawal} USDC`);

  const [userRedeemable] = await anchor.web3.PublicKey.findProgramAddress(
    [
      provider.wallet.publicKey.toBuffer(),
      Buffer.from(idoName),
      Buffer.from('user_redeemable'),
    ],
    program.programId,
  );

  const [escrowUsdc] = await anchor.web3.PublicKey.findProgramAddress(
    [
      provider.wallet.publicKey.toBuffer(),
      Buffer.from(idoName),
      Buffer.from('escrow_usdc'),
    ],
    program.programId,
  );

  await program.rpc.exchangeRedeemableForUsdc(firstWithdrawal, {
    accounts: {
      userAuthority: provider.wallet.publicKey,
      escrowUsdc,
      userRedeemable,
      idoAccount,
      usdcMint,
      redeemableMint,
      watermelonMint,
      poolUsdc,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    instructions: [
      program.instruction.initEscrowUsdc({
        accounts: {
          userAuthority: provider.wallet.publicKey,
          escrowUsdc,
          idoAccount,
          usdcMint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      }),
    ],
  });

  await sleep(secTrans * 1000);

  const userUsdcAccount = await getTokenAccount(provider, userUsdc);
  console.log(
    `實際上的 User 1 總 USDC 存款(因為有延遲限制，所以應該為 0) ${userUsdc.toString()}: ${userUsdcAccount.amount.toNumber()}`,
  );

  const nowTotalPoolUsdc = totalPoolUsdc.sub(firstWithdrawal);
  console.log(`預期的 IDO Pool 總 USDC 存款應該為: ${nowTotalPoolUsdc}`);

  const poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
  console.log(
    `實際上的 IDO Pool 總 USDC 存款: ${poolUsdcAccount.amount.toNumber()}`,
  );

  return {firstWithdrawal, newTotalPoolUsdc: nowTotalPoolUsdc, userRedeemable};
}

async function user2PayUSDCJoinIDO(
  idoName: string,
  usdcMint: anchor.web3.PublicKey,
  usdcMintAccount: Token,
  program: anchor.Program,
  firstDeposit: anchor.BN,
  watermelonMint: anchor.web3.PublicKey,
) {
  console.log(`------------------------`);
  console.log(`使用者 2 進行存入 USDC, 並且取得 Redeemable Token`);

  // 23 usdc
  const secondDeposit = new anchor.BN(23000672);
  console.log(`使用者 2 存入: ${secondDeposit} USDC`);

  const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(idoName)],
    program.programId,
  );

  const [redeemableMint] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(idoName), Buffer.from('redeemable_mint')],
    program.programId,
  );

  const [poolUsdc] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(idoName), Buffer.from('pool_usdc')],
    program.programId,
  );

  const secondUserKeypair = anchor.web3.Keypair.generate();
  console.log(
    `使用者 2 Wallet Address: ${secondUserKeypair.publicKey.toString()}`,
  );

  const transferSolInstr = anchor.web3.SystemProgram.transfer({
    fromPubkey: provider.wallet.publicKey,
    lamports: 500_000_000, // 5 sol
    toPubkey: secondUserKeypair.publicKey,
  });

  const secondUserUsdc = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    usdcMint,
    secondUserKeypair.publicKey,
  );
  console.log(`使用者 2 USDC Token Account: ${secondUserUsdc.toString()}`);

  const createSecondUserUsdcInstr =
    Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      usdcMint,
      secondUserUsdc,
      secondUserKeypair.publicKey,
      provider.wallet.publicKey,
    );

  const createSecondUserUsdcTrns = new anchor.web3.Transaction();
  createSecondUserUsdcTrns.add(transferSolInstr);
  createSecondUserUsdcTrns.add(createSecondUserUsdcInstr);
  await provider.send(createSecondUserUsdcTrns);

  await sleep(secTrans * 1000);

  await usdcMintAccount.mintTo(
    secondUserUsdc,
    provider.wallet.publicKey,
    [],
    secondDeposit.toNumber(),
  );

  await sleep(secTrans * 500);

  const secondUserUsdcAccount = await getTokenAccount(provider, secondUserUsdc);
  console.log(
    `用戶應該擁有 ${secondDeposit} USDC: ${secondUserUsdcAccount.amount.toNumber()}`,
  );

  const [secondUserRedeemable] = await anchor.web3.PublicKey.findProgramAddress(
    [
      secondUserKeypair.publicKey.toBuffer(),
      Buffer.from(idoName),
      Buffer.from('user_redeemable'),
    ],
    program.programId,
  );

  console.log(
    `使用者 2 Redeemable Token Account: ${secondUserRedeemable.toString()}`,
  );

  await program.rpc.exchangeUsdcForRedeemable(secondDeposit, {
    accounts: {
      userAuthority: secondUserKeypair.publicKey,
      userUsdc: secondUserUsdc,
      userRedeemable: secondUserRedeemable,
      idoAccount,
      usdcMint,
      redeemableMint,
      watermelonMint,
      poolUsdc,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    instructions: [
      program.instruction.initUserRedeemable({
        accounts: {
          userAuthority: secondUserKeypair.publicKey,
          userRedeemable: secondUserRedeemable,
          idoAccount,
          redeemableMint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      }),
    ],
    signers: [secondUserKeypair],
  });

  await sleep(secTrans * 1000);

  const secondUserRedeemableAccount = await getTokenAccount(
    provider,
    secondUserRedeemable,
  );

  console.log(
    `用戶 2 的 RedeemableAccount 應該為 23x10^6: ${secondUserRedeemableAccount.amount.toNumber()}`,
  );

  const totalPoolUsdc = firstDeposit.add(secondDeposit);
  console.log(`預期的 IDO Pool 總 USDC 存款應該為: ${totalPoolUsdc}`);

  await sleep(secTrans * 1000);
  const poolUsdcAccount = await getTokenAccount(provider, poolUsdc);

  console.log(
    `實際上的 IDO Pool 總 USDC 存款: ${poolUsdcAccount.amount.toNumber()}`,
  );

  return {
    totalPoolUsdc,
    secondDeposit,
    secondUserRedeemable,
    secondUserKeypair,
  };
}

async function user1PayUSDCJoinIDO(
  idoName: string,
  startIdoTs: anchor.BN,
  usdcMint: anchor.web3.PublicKey,
  usdcMintAccount: Token,
  program: anchor.Program,
  watermelonMint: anchor.web3.PublicKey,
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

  const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(idoName)],
    program.programId,
  );

  const [redeemableMint] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(idoName), Buffer.from('redeemable_mint')],
    program.programId,
  );

  const [poolUsdc] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(idoName), Buffer.from('pool_usdc')],
    program.programId,
  );

  const userUsdc = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    usdcMint,
    program.provider.wallet.publicKey,
  );

  // Get the instructions to add to the RPC call
  const createUserUsdcInstr = Token.createAssociatedTokenAccountInstruction(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    usdcMint,
    userUsdc,
    program.provider.wallet.publicKey,
    program.provider.wallet.publicKey,
  );
  const createUserUsdcTrns = new anchor.web3.Transaction().add(
    createUserUsdcInstr,
  );
  await provider.send(createUserUsdcTrns);

  await sleep(secTrans * 1000);

  await usdcMintAccount.mintTo(
    userUsdc,
    provider.wallet.publicKey,
    [],
    firstDeposit.toNumber(),
  );

  await sleep(secTrans * 500);

  // Check if we inited correctly
  const userUsdcAccount = await getTokenAccount(provider, userUsdc);
  console.log(
    `User USDC 數量 餘額應該為 ${firstDeposit.toNumber()}）: ${userUsdcAccount.amount.toNumber()}`,
  );

  const [userRedeemable] = await anchor.web3.PublicKey.findProgramAddress(
    [
      provider.wallet.publicKey.toBuffer(),
      Buffer.from(idoName),
      Buffer.from('user_redeemable'),
    ],
    program.programId,
  );

  console.log(`使用者 1 USDC Token Account: ${userUsdc.toString()}`);
  console.log(
    `使用者 1 Redeemable Token Account: ${userRedeemable.toString()}`,
  );

  try {
    const tx = await program.rpc.exchangeUsdcForRedeemable(firstDeposit, {
      accounts: {
        userAuthority: provider.wallet.publicKey,
        userUsdc,
        userRedeemable,
        idoAccount,
        usdcMint,
        redeemableMint,
        watermelonMint,
        poolUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      instructions: [
        program.instruction.initUserRedeemable({
          accounts: {
            userAuthority: provider.wallet.publicKey,
            userRedeemable,
            idoAccount,
            redeemableMint,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          },
        }),
      ],
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
  idoName: string,
  watermelonMint: anchor.web3.PublicKey,
  program: anchor.Program,
  usdcMint: anchor.web3.PublicKey,
  watermelonIdoAmount: anchor.BN,
  idoAuthorityWatermelon: anchor.web3.PublicKey,
) {
  console.log(`------------------------`);

  const bumps = new Bumps();

  const [idoAccount, idoAccountBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName)],
      program.programId,
    );
  bumps.idoAccount = idoAccountBump;

  const [redeemableMint, redeemableMintBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from('redeemable_mint')],
      program.programId,
    );
  bumps.redeemableMint = redeemableMintBump;

  const [poolWatermelon, poolWatermelonBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from('pool_watermelon')],
      program.programId,
    );
  bumps.poolWatermelon = poolWatermelonBump;

  const [poolUsdc, poolUsdcBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from('pool_usdc')],
      program.programId,
    );
  bumps.poolUsdc = poolUsdcBump;

  console.log(`Pool Watermelon Token Account: ${poolWatermelon.toString()}`);
  console.log(`Pool USDC Token Account: ${poolUsdc.toString()}`);

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

  const endIdoEscTs = startIdoTs.add(new anchor.BN(endForEndIdoEsc));
  console.log(`USDC 延遲取出結束時間: ${endIdoEscTs.toNumber()}`);

  const idoTimes = new IdoTimes();

  idoTimes.startIdo = startIdoTs;
  idoTimes.endDeposits = endDepositsTs;
  idoTimes.endIdo = endIdoTs;
  idoTimes.endEscrow = endIdoEscTs;

  // Atomically create the new account and initialize it with the program.
  // 注意 WatermelonIdoAmount 銷售數量
  try {
    await program.rpc.initializePool(
      idoName,
      bumps,
      watermelonIdoAmount,
      idoTimes,
      {
        accounts: {
          idoAuthority: provider.wallet.publicKey,
          idoAuthorityWatermelon,
          idoAccount,
          watermelonMint,
          usdcMint,
          redeemableMint,
          poolWatermelon,
          poolUsdc,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      },
    );
  } catch (e) {
    console.error(e);
    throw e;
  }

  await sleep(secTrans * 1000);

  const pool_watermelon_account = await getTokenAccount(
    provider,
    poolWatermelon,
  );
  const idoAuthority_watermelon_account = await getTokenAccount(
    provider,
    idoAuthorityWatermelon,
  );

  console.log(
    `此次 IDO 銷售數量（pool）為: ${pool_watermelon_account.amount.toNumber()}`,
  );
  console.log(
    `銷售者的 Watermelon Token Account（因為提交了 IDO, 所以餘額應該為 0）: ${idoAuthorityWatermelon.toString()}, mint: ${
      idoAuthority_watermelon_account.mint
    } amount: ${idoAuthority_watermelon_account.amount.toNumber()}`,
  );
  return {
    redeemableMint,
    poolWatermelon,
    poolUsdc,
    startIdoTs,
    endDepositsTs,
    endIdoTs,
    endIdoEscTs,
  };
}

async function initializes(watermelonIdoAmount: anchor.BN) {
  console.log(`------------------------`);
  // USDC 的 Token mint
  const usdcMintAccount = await createMint(provider, undefined);
  console.log(`成功 mint usdc token: ${usdcMintAccount.publicKey.toString()}`);

  // 即將銷售的幣別 Token mint
  const watermelonMintAccount = await createMint(provider, undefined);
  console.log(
    `成功 mint watermelon token: ${watermelonMintAccount.publicKey.toString()}`,
  );

  const usdcMint = usdcMintAccount.publicKey;
  const watermelonMint = watermelonMintAccount.publicKey;

  // 創建銷售者的 USDC's Token Account
  const idoAuthorityUsdc = await createTokenAccount(
    provider,
    usdcMint,
    provider.wallet.publicKey,
  );
  console.log(`成功創建銷售者的 usdc token account: ${idoAuthorityUsdc}`);

  // 創建銷售者的 即將銷售的幣別's Token Account
  const idoAuthorityWatermelon = await createTokenAccount(
    provider,
    watermelonMint,
    provider.wallet.publicKey,
  );
  console.log(
    `成功創建銷售者的 watermelon token account: ${idoAuthorityWatermelon}`,
  );

  // 即將銷售的幣別's Token 數量
  // Mint Watermelon tokens the will be distributed from the IDO pool.
  await watermelonMintAccount.mintTo(
    idoAuthorityWatermelon,
    provider.wallet.publicKey,
    [],
    watermelonIdoAmount.toNumber(),
  );

  await sleep(secTrans * 1000);

  const idoAuthority_watermelon_account = await getTokenAccount(
    provider,
    idoAuthorityWatermelon,
  );

  console.log(
    `獲取創建者的 watermelon 數量: ${idoAuthority_watermelon_account.amount.toNumber()}`,
  );

  console.log(`本次 IDO 數量: ${watermelonIdoAmount.toNumber()}`);
  return {
    usdcMintAccount,
    watermelonMintAccount,
    usdcMint,
    watermelonMint,
    idoAuthorityUsdc,
    idoAuthorityWatermelon,
  };
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
