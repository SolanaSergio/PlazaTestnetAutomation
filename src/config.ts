import * as dotenv from 'dotenv';
import { Config } from './core/types.js';
import { ethers } from 'ethers';
import { POOL_ABI, ORACLE_ABI, TOKEN_ABI, DISTRIBUTOR_ABI, SWAP_ROUTER_ABI } from './abis.js';

dotenv.config();

// Verify RPC connection before creating config
async function verifyRpcConnection(rpcUrl: string): Promise<boolean> {
    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        await provider.getNetwork();
        return true;
    } catch (error) {
        console.error('RPC connection failed:', error);
        return false;
    }
}

// Validate required environment variables
function validateEnv() {
    const requiredEnvVars = ['PRIVATE_KEY', 'RPC_URL'];
    const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate private key format
    if (!/^[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY || '')) {
        throw new Error('Invalid PRIVATE_KEY format. Must be a 64-character hexadecimal string.');
    }
}

// Validate contract addresses
function validateAddress(address: string, name: string): string {
    if (!ethers.isAddress(address)) {
        throw new Error(`Invalid ${name} address: ${address}`);
    }
    return address;
}

// Initialize configuration with validation
validateEnv();

// Token configuration
export const TOKENS = {
    WSTETH: {
        decimals: 18,
        minAmount: parseFloat(process.env.MIN_WSTETH_AMOUNT || '0.1'),
        maxAmount: parseFloat(process.env.MAX_WSTETH_AMOUNT || '1.0'),
    },
    BONDETH: {
        decimals: 18,
        minAmount: parseFloat(process.env.MIN_BONDETH_AMOUNT || '0.1'),
        maxAmount: parseFloat(process.env.MAX_BONDETH_AMOUNT || '1.0'),
    },
    LEVETH: {
        decimals: 18,
        minAmount: parseFloat(process.env.MIN_LEVETH_AMOUNT || '0.1'),
        maxAmount: parseFloat(process.env.MAX_LEVETH_AMOUNT || '1.0'),
    },
    USDC: {
        decimals: 6
    }
} as const;

// Contract addresses for Base Sepolia testnet
const CONTRACT_ADDRESSES = {
    PLAZA_POOL: validateAddress('0xF39635F2adF40608255779ff742Afe13dE31f577', 'Plaza Pool'),
    PLAZA_FACTORY: validateAddress('0xb9b23c2b1dc99181402e4399a45404d368e864fc', 'Plaza Factory'),
    DISTRIBUTOR: validateAddress('0xb01866F195533dE16EB929b73f87280693CA0cB4', 'Distributor'),
    BOND_TOKEN: validateAddress('0x5Bd36745f6199CF32d2465Ef1F8D6c51dCA9BdEE', 'Bond Token'),
    LEVERAGE_TOKEN: validateAddress('0x98f665D98a046fB81147879eCBE9A6fF68BC276C', 'Leverage Token'),
    ORACLE: validateAddress('0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70', 'Oracle'),
    CHAINLINK_FEED: validateAddress('0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70', 'Chainlink Feed'),
    WSTETH: validateAddress('0x13e5fb0b6534bb22cbc59fae339dbbe0dc906871', 'wstETH'),
    USDC: validateAddress('0xf7464321de37bde4c03aaeef6b1e7b71379a9a64', 'USDC'),
    SWAP_ROUTER: validateAddress('0xad61d4e5a5c226298549632ffe9998b738865471', 'Swap Router')
} as const;

// Protocol parameters
export const PROTOCOL_PARAMS = {
    // Time between coupon distributions (in seconds)
    DISTRIBUTION_PERIOD: 7 * 24 * 60 * 60, // 7 days
    // Maximum slippage tolerance for trades
    MAX_SLIPPAGE: 500, // 5%
    // Gas limits for different operations based on actual txs
    GAS_LIMITS: {
        CREATE: 50000,    // Increased from actual 46,332 for safety margin
        REDEEM: 60000,    // Higher than create for more complex operation
        CLAIM_COUPON: 40000
    },
    // L1/L2 fee configuration
    L1_L2_FEES: {
        L1_GAS_USED: 1600,
        L1_FEE_SCALAR: 0,
        BASE_FEE_GWEI: 0.000000384,
        MAX_PRIORITY_FEE_GWEI: 0.000832971
    }
} as const;

export const config: Config = {
    rpcUrl: process.env.RPC_URL!,
    privateKey: process.env.PRIVATE_KEY!,
    plazaPoolAddress: CONTRACT_ADDRESSES.PLAZA_POOL,
    poolAbi: POOL_ABI,
    oracleAddress: CONTRACT_ADDRESSES.ORACLE,
    oracleAbi: ORACLE_ABI,
    usdcAddress: CONTRACT_ADDRESSES.USDC,
    bondEthAddress: CONTRACT_ADDRESSES.BOND_TOKEN,
    levEthAddress: CONTRACT_ADDRESSES.LEVERAGE_TOKEN,
    distributorAddress: CONTRACT_ADDRESSES.DISTRIBUTOR,
    wstethAddress: CONTRACT_ADDRESSES.WSTETH,
    swapRouterAddress: CONTRACT_ADDRESSES.SWAP_ROUTER,
    erc20Abi: TOKEN_ABI,
    gasLimits: {
        CREATE: BigInt(PROTOCOL_PARAMS.GAS_LIMITS.CREATE),
        REDEEM: BigInt(PROTOCOL_PARAMS.GAS_LIMITS.REDEEM),
        APPROVE: BigInt(PROTOCOL_PARAMS.GAS_LIMITS.CLAIM_COUPON)
    },
    slippageTolerance: parseInt(process.env.SLIPPAGE_TOLERANCE || '500')
}; 