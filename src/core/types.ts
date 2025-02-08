import { ethers } from 'ethers';

export enum TokenType {
    BOND = 0,
    LEVERAGE = 1
}

export enum State {
    BIDDING = 0,
    SUCCEEDED = 1,
    FAILED_UNDERSOLD = 2,
    FAILED_LIQUIDATION = 3
}

export interface Bid {
    bidder: string;
    buyReserveAmount: bigint;
    sellCouponAmount: bigint;
    claimed: boolean;
}

export interface Config {
    rpcUrl: string;
    privateKey: string;
    plazaPoolAddress: string;
    poolAbi: readonly string[];
    oracleAddress: string;
    oracleAbi: readonly string[];
    usdcAddress: string;
    bondEthAddress: string;
    levEthAddress: string;
    distributorAddress: string;
    wstethAddress: string;
    swapRouterAddress: string;
    erc20Abi: readonly string[];
    gasLimits: {
        CREATE: bigint;
        REDEEM: bigint;
        APPROVE: bigint;
    };
    slippageTolerance: number;
}

export interface PoolInfo {
    bondSupply: bigint;
    levSupply: bigint;
    poolReserves: bigint;
    oracleDecimals: number;
}

export interface VaultState {
    poolInfo: PoolInfo;
    totalValue: bigint;
    collateralLevel: number;
    periodProgress: number;
    distributionPeriod: bigint;
    lastDistribution: bigint;
}

export interface TransactionStatus {
    type: string;
    hash: string;
    success: boolean;
    timestamp: Date;
    gasUsed?: bigint;
    error?: string;
}

export interface TokenPrices {
    bondEthPrice: bigint;
    levEthPrice: bigint;
}

export interface EthersError extends Error {
    code?: string;
    reason?: string;
    transaction?: {
        to: string;
        from: string;
        data: string;
    };
}

export type ApprovalResult = ethers.TransactionReceipt | undefined;

export interface ContractTransactionWithWait extends ethers.ContractTransaction {
    wait(): Promise<ethers.TransactionReceipt>;
    hash: string;
} 