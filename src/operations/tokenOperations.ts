import { ethers } from 'ethers';
import chalk from 'chalk';
import { TokenType, TransactionStatus, VaultState } from '../core/types.js';
import { handleError } from '../utils/helpers.js';
import { validateCreateParameters, validateRedeemParameters } from './poolOperations.js';

// Constants from pool contract documentation
const PRECISION = 1_000_000; // 1e6 for fixed-point calculations
const COLLATERAL_THRESHOLD = 1_200_000; // 120% in PRECISION format
const BOND_TARGET_PRICE = ethers.parseUnits('100', 6); // 100 USDC
const SHARES_DECIMALS = 6;

export async function getIndexedUserAmount(
    bondTokenContract: ethers.Contract,
    userAddress: string,
    balance: bigint,
    period: bigint
): Promise<bigint> {
    try {
        return await bondTokenContract.getIndexedUserAmount(userAddress, balance, period);
    } catch (error) {
        throw handleError(error, 'get indexed user amount');
    }
}

export async function getUserAssets(
    bondTokenContract: ethers.Contract,
    userAddress: string
): Promise<{ lastUpdatedPeriod: bigint; indexedAmountShares: bigint }> {
    try {
        const assets = await bondTokenContract.userAssets(userAddress);
        return {
            lastUpdatedPeriod: assets.lastUpdatedPeriod,
            indexedAmountShares: assets.indexedAmountShares
        };
    } catch (error) {
        throw handleError(error, 'get user assets');
    }
}

export async function getGlobalPool(
    bondTokenContract: ethers.Contract
): Promise<{
    currentPeriod: bigint;
    sharesPerToken: bigint;
    previousPoolAmounts: Array<{
        period: bigint;
        amount: bigint;
        sharesPerToken: bigint;
    }>;
}> {
    try {
        const pool = await bondTokenContract.globalPool();
        return {
            currentPeriod: pool.currentPeriod,
            sharesPerToken: pool.sharesPerToken,
            previousPoolAmounts: pool.previousPoolAmounts
        };
    } catch (error) {
        throw handleError(error, 'get global pool');
    }
}

export async function createToken(
    poolContract: ethers.Contract,
    tokenType: TokenType,
    depositAmount: bigint,
    minAmount: bigint,
    deadline: bigint,
    walletAddress: string,
    gasLimit: bigint,
    txHistory: TransactionStatus[]
): Promise<TransactionStatus> {
    try {
        // Validate parameters
        await validateCreateParameters(poolContract, tokenType, depositAmount);

        // Execute the create transaction
        const tx = await poolContract.create(
            tokenType,
            depositAmount,
            minAmount,
            deadline,
            walletAddress,
            {
                gasLimit
            }
        );

        const receipt = await tx.wait();
        const tokenName = tokenType === TokenType.BOND ? 'bondETH' : 'levETH';

        // For bondETH, update indexed user assets
        if (tokenType === TokenType.BOND) {
            const bondTokenContract = new ethers.Contract(
                await poolContract.bondToken(),
                [
                    'function balanceOf(address account) view returns (uint256)',
                    'function updateIndexedUserAssets(address user, uint256 balance)',
                    'function SHARES_DECIMALS() view returns (uint8)'
                ],
                poolContract.runner
            );
            
            // Get new balance after minting
            const newBalance = await bondTokenContract.balanceOf(walletAddress);
            await updateUserAssets(bondTokenContract, walletAddress, newBalance);
        }

        const status: TransactionStatus = {
            type: `CREATE_${tokenName.toUpperCase()}`,
            hash: tx.hash,
            success: true,
            timestamp: new Date(),
            gasUsed: receipt.gasUsed
        };

        txHistory.push(status);
        console.log(chalk.green(`Successfully created ${tokenName}. Hash: ${tx.hash}`));
        return status;
    } catch (error) {
        const tokenName = tokenType === TokenType.BOND ? 'bondETH' : 'levETH';
        const status: TransactionStatus = {
            type: `CREATE_${tokenName.toUpperCase()}`,
            hash: '',
            success: false,
            timestamp: new Date(),
            error: error instanceof Error ? error.message : 'Unknown error'
        };
        txHistory.push(status);
        throw handleError(error, `create ${tokenName}`);
    }
}

export async function isPaused(
    tokenContract: ethers.Contract
): Promise<boolean> {
    try {
        return await tokenContract.paused();
    } catch (error) {
        throw handleError(error, 'check paused status');
    }
}

export async function hasRole(
    tokenContract: ethers.Contract,
    role: string,
    account: string
): Promise<boolean> {
    try {
        const roleHash = ethers.id(role);
        return await tokenContract.hasRole(roleHash, account);
    } catch (error) {
        throw handleError(error, 'check role');
    }
}

export async function redeemToken(
    poolContract: ethers.Contract,
    tokenType: TokenType,
    amount: bigint,
    minAmount: bigint,
    deadline: bigint,
    walletAddress: string,
    gasLimit: bigint,
    txHistory: TransactionStatus[]
): Promise<TransactionStatus> {
    try {
        // Validate parameters
        await validateRedeemParameters(poolContract, tokenType, amount);

        // Execute the redeem transaction
        const tx = await poolContract.redeem(
            tokenType,
            amount,
            minAmount,
            deadline,
            walletAddress,
            {
                gasLimit
            }
        );

        const receipt = await tx.wait();
        const tokenName = tokenType === TokenType.BOND ? 'bondETH' : 'levETH';

        // For bondETH, update indexed user assets after redemption
        if (tokenType === TokenType.BOND) {
            const bondTokenContract = new ethers.Contract(
                await poolContract.bondToken(),
                [
                    'function balanceOf(address account) view returns (uint256)',
                    'function updateIndexedUserAssets(address user, uint256 balance)'
                ],
                poolContract.runner
            );
            
            // Get new balance after redemption
            const newBalance = await bondTokenContract.balanceOf(walletAddress);
            await updateUserAssets(bondTokenContract, walletAddress, newBalance);
        }

        const status: TransactionStatus = {
            type: `REDEEM_${tokenName.toUpperCase()}`,
            hash: tx.hash,
            success: true,
            timestamp: new Date(),
            gasUsed: receipt.gasUsed
        };

        txHistory.push(status);
        console.log(chalk.green(`Successfully redeemed ${tokenName}. Hash: ${tx.hash}`));
        return status;
    } catch (error) {
        const tokenName = tokenType === TokenType.BOND ? 'bondETH' : 'levETH';
        const status: TransactionStatus = {
            type: `REDEEM_${tokenName.toUpperCase()}`,
            hash: '',
            success: false,
            timestamp: new Date(),
            error: error instanceof Error ? error.message : 'Unknown error'
        };
        txHistory.push(status);
        throw handleError(error, `redeem ${tokenName}`);
    }
}

export async function calculateBondEthPrice(
    poolContract: ethers.Contract,
    vaultState: VaultState,
    ethPrice: bigint
): Promise<bigint> {
    const collateralLevel = vaultState.collateralLevel;
    const totalValue = vaultState.totalValue;
    
    if (collateralLevel > 1.2) {
        // Fixed at 100 USDC if collateral level > 1.2
        return BOND_TARGET_PRICE;
    } else {
        // 80% of vault's collateral value per bondETH
        const collateralValuePerBond = (totalValue * BigInt(80)) / 
            (vaultState.poolInfo.bondSupply * BigInt(100));
        
        // Get market price for comparison
        const marketPrice = await poolContract.getTokenPrice(0); // 0 for bondETH
        
        // Return the lower of the two prices
        return collateralValuePerBond < marketPrice ? collateralValuePerBond : marketPrice;
    }
}

export async function calculateLevEthPrice(
    poolContract: ethers.Contract,
    vaultState: VaultState,
    ethPrice: bigint
): Promise<bigint> {
    const collateralLevel = vaultState.collateralLevel;
    const totalValue = vaultState.totalValue;
    
    if (collateralLevel > 1.2) {
        // (Total Value - (100 × bondETH supply)) ÷ levETH supply
        const bondValue = vaultState.poolInfo.bondSupply * BOND_TARGET_PRICE;
        const calculatedPrice = (totalValue - bondValue) / vaultState.poolInfo.levSupply;
        
        // Get market price for comparison
        const marketPrice = await poolContract.getTokenPrice(1); // 1 for levETH
        
        // Return the calculated price (no need to compare with market price in this case)
        return calculatedPrice;
    } else {
        // 20% of vault's collateral value per levETH
        const collateralValuePerLev = (totalValue * BigInt(20)) / 
            (vaultState.poolInfo.levSupply * BigInt(100));
        
        // Get market price for comparison
        const marketPrice = await poolContract.getTokenPrice(1); // 1 for levETH
        
        // Return the lower of the two prices
        return collateralValuePerLev < marketPrice ? collateralValuePerLev : marketPrice;
    }
}

export async function calculateProFormaCollateralLevel(
    vaultState: VaultState,
    redeemAmount: bigint,
    ethPrice: bigint,
    isBondToken: boolean
): Promise<number> {
    const totalCollateralValue = vaultState.totalValue;
    
    if (isBondToken) {
        // Calculate pro-forma collateral level for bondETH redemption
        const bondValueRedeemed = redeemAmount * BOND_TARGET_PRICE;
        const remainingBondSupply = vaultState.poolInfo.bondSupply - redeemAmount;
        
        if (remainingBondSupply <= 0) return 999; // Max collateral level if no bonds left
        
        // ((ETH tokens × ETH price) - (bondETH redeemed × 100)) ÷ ((bondETH supply - bondETH redeemed) × 100)
        const proFormaCollateralLevel = Number(totalCollateralValue - bondValueRedeemed) / 
            Number(remainingBondSupply * BOND_TARGET_PRICE);
            
        return proFormaCollateralLevel;
    } else {
        // For levETH redemption, use current collateral level
        // This is correct as levETH redemptions don't affect the bond backing ratio
        return vaultState.collateralLevel;
    }
}

export async function resetIndexedUserAssets(
    bondTokenContract: ethers.Contract,
    userAddress: string
): Promise<void> {
    try {
        // Check if caller has DISTRIBUTOR_ROLE
        const distributorRole = ethers.id("DISTRIBUTOR_ROLE");
        const hasDistributorRole = await bondTokenContract.hasRole(distributorRole, userAddress);
        if (!hasDistributorRole) {
            throw new Error('Caller does not have DISTRIBUTOR_ROLE');
        }

        // Check if contract is paused
        if (await isPaused(bondTokenContract)) {
            throw new Error('Contract is paused');
        }

        // Reset indexed user assets
        const tx = await bondTokenContract.resetIndexedUserAssets(userAddress);
        await tx.wait();

    } catch (error) {
        throw handleError(error, 'reset indexed user assets');
    }
}

export async function updateUserAssets(
    bondTokenContract: ethers.Contract,
    userAddress: string,
    balance: bigint
): Promise<void> {
    try {
        // Check if contract is paused
        if (await isPaused(bondTokenContract)) {
            throw new Error('Contract is paused');
        }

        // Update user assets
        const tx = await bondTokenContract.updateIndexedUserAssets(userAddress, balance);
        await tx.wait();

    } catch (error) {
        throw handleError(error, 'update user assets');
    }
}

export async function getSharesDecimals(
    bondTokenContract: ethers.Contract
): Promise<number> {
    try {
        return await bondTokenContract.SHARES_DECIMALS();
    } catch (error) {
        throw handleError(error, 'get shares decimals');
    }
}

export async function grantRole(
    tokenContract: ethers.Contract,
    role: string,
    account: string,
    callerAddress: string
): Promise<void> {
    try {
        // Check if caller has GOV_ROLE
        const govRole = ethers.id("GOV_ROLE");
        const hasGovRole = await tokenContract.hasRole(govRole, callerAddress);
        if (!hasGovRole) {
            throw new Error('Caller does not have GOV_ROLE');
        }

        // Grant role
        const roleHash = ethers.id(role);
        const tx = await tokenContract.grantRole(roleHash, account);
        await tx.wait();

    } catch (error) {
        throw handleError(error, 'grant role');
    }
}

export async function revokeRole(
    tokenContract: ethers.Contract,
    role: string,
    account: string,
    callerAddress: string
): Promise<void> {
    try {
        // Check if caller has GOV_ROLE
        const govRole = ethers.id("GOV_ROLE");
        const hasGovRole = await tokenContract.hasRole(govRole, callerAddress);
        if (!hasGovRole) {
            throw new Error('Caller does not have GOV_ROLE');
        }

        // Revoke role
        const roleHash = ethers.id(role);
        const tx = await tokenContract.revokeRole(roleHash, account);
        await tx.wait();

    } catch (error) {
        throw handleError(error, 'revoke role');
    }
}

export async function pauseToken(
    tokenContract: ethers.Contract,
    callerAddress: string
): Promise<void> {
    try {
        // Check if caller has GOV_ROLE
        const govRole = ethers.id("GOV_ROLE");
        const hasGovRole = await tokenContract.hasRole(govRole, callerAddress);
        if (!hasGovRole) {
            throw new Error('Caller does not have GOV_ROLE');
        }

        // Pause token
        const tx = await tokenContract.pause();
        await tx.wait();

    } catch (error) {
        throw handleError(error, 'pause token');
    }
}

export async function unpauseToken(
    tokenContract: ethers.Contract,
    callerAddress: string
): Promise<void> {
    try {
        // Check if caller has GOV_ROLE
        const govRole = ethers.id("GOV_ROLE");
        const hasGovRole = await tokenContract.hasRole(govRole, callerAddress);
        if (!hasGovRole) {
            throw new Error('Caller does not have GOV_ROLE');
        }

        // Unpause token
        const tx = await tokenContract.unpause();
        await tx.wait();

    } catch (error) {
        throw handleError(error, 'unpause token');
    }
}

// Update contract setup to include governance functions
export async function setupTokenContract(
    provider: ethers.Provider,
    address: string,
    isBondToken: boolean
): Promise<ethers.Contract> {
    const abi = [
        // Base token functions
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
        'function totalSupply() view returns (uint256)',
        'function balanceOf(address account) view returns (uint256)',
        'function transfer(address recipient, uint256 amount) returns (bool)',
        'function allowance(address owner, address spender) view returns (uint256)',
        'function approve(address spender, uint256 amount) returns (bool)',
        'function transferFrom(address sender, address recipient, uint256 amount) returns (bool)',
        
        // Role management
        'function MINTER_ROLE() view returns (bytes32)',
        'function GOV_ROLE() view returns (bytes32)',
        'function hasRole(bytes32 role, address account) view returns (bool)',
        'function grantRole(bytes32 role, address account)',
        'function revokeRole(bytes32 role, address account)',
        
        // Pausable functions
        'function paused() view returns (bool)',
        'function pause()',
        'function unpause()',
        
        // Events
        'event Transfer(address indexed from, address indexed to, uint256 value)',
        'event Approval(address indexed owner, address indexed spender, uint256 value)',
        'event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
        'event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)',
        'event Paused(address account)',
        'event Unpaused(address account)'
    ];

    // Add bond token specific functions if needed
    if (isBondToken) {
        abi.push(
            'function DISTRIBUTOR_ROLE() view returns (bytes32)',
            'function SHARES_DECIMALS() view returns (uint8)',
            'function globalPool() view returns (tuple(uint256 currentPeriod, uint256 sharesPerToken, tuple(uint256 period, uint256 amount, uint256 sharesPerToken)[] previousPoolAmounts))',
            'function userAssets(address) view returns (tuple(uint256 lastUpdatedPeriod, uint256 indexedAmountShares))',
            'function getIndexedUserAmount(address user, uint256 balance, uint256 period) view returns (uint256)',
            'function updateIndexedUserAssets(address user, uint256 balance)',
            'function resetIndexedUserAssets(address user)',
            'event IncreasedAssetPeriod(uint256 currentPeriod, uint256 sharesPerToken)',
            'event UpdatedUserAssets(address user, uint256 lastUpdatedPeriod, uint256 indexedAmountShares)'
        );
    }

    return new ethers.Contract(address, abi, provider);
} 