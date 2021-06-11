import { PublicKey } from '@solana/web3.js';

export interface MemberAccount {
    registrar: PublicKey;
    beneficiary: PublicKey;
    metadata: PublicKey;
    balances: Balances;
    balancesLocked: Balances;
    rewardsCursor: number;
    lastStakeTs: string;
    nonce: number;
}

export interface Balances {
    spt: PublicKey;
    vault: PublicKey;
    vaultStake: PublicKey;
    vaultPw: PublicKey;
}
