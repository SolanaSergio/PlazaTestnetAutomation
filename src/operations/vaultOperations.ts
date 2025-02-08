import { ethers } from 'ethers';
import { handleError } from '../utils/helpers.js';
import { VaultState, TokenType, PoolInfo } from '../core/types.js';

// Constants from pool contract documentation
const PRECISION = 1_000_000; // 1e6 for fixed-point calculations
const SECONDS_PER_DAY = BigInt(24 * 60 * 60);
const COLLATERAL_THRESHOLD = 1_200_000; // 120% in PRECISION format
const BOND_TARGET_PRICE = ethers.parseUnits('100', 6); // 100 USDC

/**
 * Gets the current state of the vault including collateral levels, token supplies, and prices
 * @param poolContract The pool contract instance
 * @param ethPrice The current ETH price from oracle
 * @returns VaultState object with current vault metrics
 */
export async function getVaultState(
    poolContract: ethers.Contract,
    ethPrice: bigint
): Promise<VaultState> {
    try {
        // Get pool state using individual view functions
        const [
            bondSupply,
            levSupply,
            poolReserves,
            lastDistribution,
            distributionPeriod
        ] = await Promise.all([
            poolContract.getBondSupply(),
            poolContract.getLeverageSupply(),
            poolContract.getReserve(),
            poolContract.lastDistribution(),
            poolContract.distributionPeriod()
        ]);
        
        // Calculate total value in the vault
        const totalValue = (poolReserves * ethPrice) / ethers.parseEther('1');
        
        // Calculate collateral level
        const bondValue = bondSupply * BOND_TARGET_PRICE;
        const collateralLevel = bondValue > 0 ? 
            Number(totalValue * BigInt(PRECISION)) / Number(bondValue) : 
            999; // Max collateral level if no bonds

        // Calculate period progress
        const currentTime = BigInt(Math.floor(Date.now() / 1000));
        const periodProgress = Number((currentTime - lastDistribution) * BigInt(100)) / Number(distributionPeriod);

        return {
            poolInfo: {
                bondSupply,
                levSupply,
                poolReserves,
                oracleDecimals: 18 // ETH oracle uses 18 decimals
            },
            totalValue,
            collateralLevel,
            periodProgress,
            distributionPeriod,
            lastDistribution
        };
    } catch (error) {
        throw handleError(error, 'get vault state');
    }
}

/**
 * Formats the vault status into a human-readable string
 * @param vaultState Current state of the vault
 * @returns Formatted status string
 */
export function formatVaultStatus(vaultState: VaultState): string {
    const collateralPercent = (vaultState.collateralLevel * 100).toFixed(2);
    const periodProgressPercent = vaultState.periodProgress.toFixed(2);
    const timeUntilDistribution = Number(vaultState.distributionPeriod) - 
        (Math.floor(Date.now() / 1000) - Number(vaultState.lastDistribution));
    
    return `Vault Status:
    Collateral Level: ${collateralPercent}%
    Bond Supply: ${ethers.formatEther(vaultState.poolInfo.bondSupply)} bondETH
    Leverage Supply: ${ethers.formatEther(vaultState.poolInfo.levSupply)} levETH
    Pool Reserves: ${ethers.formatEther(vaultState.poolInfo.poolReserves)} ETH
    Total Value: ${ethers.formatUnits(vaultState.totalValue, 6)} USDC
    Period Progress: ${periodProgressPercent}%
    Time Until Distribution: ${Math.max(0, timeUntilDistribution)} seconds`;
}

/**
 * Validates the health of the vault based on current state
 * @param vaultState Current state of the vault
 * @returns True if vault is healthy, throws error if not
 */
export function validateVaultHealth(vaultState: VaultState): boolean {
    // Check if vault is properly collateralized
    if (vaultState.collateralLevel < 1.0) {
        throw new Error(`Vault is undercollateralized. Current level: ${(vaultState.collateralLevel * 100).toFixed(2)}%`);
    }

    // Check if there are sufficient reserves
    if (vaultState.poolInfo.poolReserves <= 0) {
        throw new Error('No reserves in vault');
    }

    // Check if bond supply is within reasonable limits
    if (vaultState.poolInfo.bondSupply > ethers.parseEther('1000000')) {
        throw new Error('Bond supply exceeds safe limits');
    }

    return true;
} 