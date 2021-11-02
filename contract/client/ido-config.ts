import * as anchor from '@project-serum/anchor';
import {NodeWallet} from '@project-serum/common';
import * as serumCmn from '@project-serum/common';
import {AccountInfo, Token, TOKEN_PROGRAM_ID} from '@solana/spl-token';
import crypto from 'crypto';
import {TokenInstructions} from '@project-serum/serum';

export class Bumps {
  idoAccount: number | undefined;
  redeemableMint: number | undefined;
  poolWatermelon: number | undefined;
  poolUsdc: number | undefined;
}

export class IdoTimes {
  startIdo: anchor.BN | undefined;
  endDeposits: anchor.BN | undefined;
  endIdo: anchor.BN | undefined;
  endEscrow: anchor.BN | undefined;
}

export const isProd = process.env.NODE_ENV === 'production';
export const isTest = process.env.NODE_ENV === 'test';

const niceDay = 1636676100; // 2021/11/12 08:15 AM +0800

export const saleTime = isProd ? niceDay : Date.now() / 1000;

// TODO: 如果是正式環境，請確認這是正確的銷售數量
export const idoAmount = isProd
  ? 26424295.15 * Math.pow(10, 6)
  : 5 * Math.pow(10, 6);

// TODO: 如果是正式環境，請確認這是正確的銷售目標
const watermelonMintString = isProd
  ? 'CPXDs2uhNwDKAt9V3vXvtspv9U7rsQ2fVr1qAUDmuCaq'
  : 'CPXDs2uhNwDKAt9V3vXvtspv9U7rsQ2fVr1qAUDmuCaq';
export const watermelonMint = new anchor.web3.PublicKey(watermelonMintString);

// TODO: 如果是正式環境，請確認這是正確的 USDC
const usdcMintString = isProd
  ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC on main-beta
  : 'USDJcm54FNVW2VfqNwAFnHv1BTRFoFr9zCzfrtQbHxX'; // USDC on devnet
export const usdcMint = new anchor.web3.PublicKey(usdcMintString);

export const secTrans = isProd ? 20 : 20;
export const preSecForStartIdo = isProd ? 0 : 60 * 12; // 60 * 10 10Min;
export const saveSec = isProd ? 60 * 60 * 48 : 60 * 60 * 0.6; // 60 * 60 * 48 48H
export const endForEndIdo = isProd ? saveSec * 1.5 : saveSec * 1.2; // 60 * 60 * 24 * 1.5 72H
export const endForEndIdoEsc = isProd ? saveSec * 1.6 : saveSec * 1.25; // 60 * 60 * 24 * 1.6 76.8H

export async function getTokenAccount(
  provider: anchor.Provider,
  addr: anchor.web3.PublicKey,
): Promise<AccountInfo> {
  return await serumCmn.getTokenAccount(provider, addr);
}

export async function createMint(
  provider: anchor.Provider,
  authority: any,
): Promise<Token> {
  if (authority === undefined) {
    authority = provider.wallet.publicKey;
  }
  const mint = await Token.createMint(
    provider.connection,
    (provider.wallet as any).payer,
    authority,
    null,
    6,
    TokenInstructions.TOKEN_PROGRAM_ID,
  );

  return mint;
}

export async function createTokenAccount(
  provider: anchor.Provider,
  mint: anchor.web3.PublicKey,
  owner: anchor.web3.PublicKey,
): Promise<anchor.web3.PublicKey> {
  const token = new Token(
    provider.connection,
    mint,
    TokenInstructions.TOKEN_PROGRAM_ID,
    (provider.wallet as any).payer,
  );
  const vault = await token.createAccount(owner);
  return vault;
}

export function getConnectionString(): string {
  let connectionString = isProd
    ? 'https://api.mainnet-beta.solana.com'
    : 'http://localhost:8899';
  connectionString = isTest
    ? 'https://api.devnet.solana.com'
    : connectionString;

  return connectionString;
}

export function getIdoName(): string {
  const idoName = crypto
    .createHash('sha256')
    .update(Date.now().toString())
    .digest('hex')
    .substring(0, 10);

  return idoName;
}

export const connection = new anchor.web3.Connection(getConnectionString());
export const provider = new anchor.Provider(
  connection,
  NodeWallet.local(),
  anchor.Provider.defaultOptions(),
);

export const IDOSALE_Program_ID =
  'BvQQDMTy9XunH3muJaz6sckwpjyEeEvUqUowpSXBGVW7';
