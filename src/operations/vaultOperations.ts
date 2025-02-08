import { ethers } from 'ethers';
import { handleError } from '../utils/helpers.js';
import { VaultState } from '../core/types.js';

const SECONDS_PER_DAY = BigInt(24 * 60 * 60);
const PRECISION = 1_000_000; // 1e6 for fixed-point calculations

export async function getVaultState(
    poolContract: ethers.Contract,
    ethPrice: bigint
): Promise<VaultState> {
    try {
        // Get individual state variables using the correct getters
        const [
            reserve,
            bondSupply,
            levSupply,
            collateralLevel,
            lastDistribution,
            distributionPeriod
        ] = await Promise.all([
            poolContract.reserve(),
            poolContract.bondSupply(),
            poolContract.levSupply(),
            poolContract.collateralLevel(),
            poolContract.lastDistribution(),
            poolContract.distributionPeriod()
        ]);

        // Calculate total value in USDC (6 decimals)
        const totalValue = (BigInt(reserve) * ethPrice) / ethers.parseEther('1');

        // Convert collateralLevel from PRECISION format to decimal
        const collateralLevelNum = Number(collateralLevel) / Number(PRECISION);

        return {
            totalValue,
            bondEthSupply: bondSupply,
            levEthSupply: levSupply,
            collateralLevel: collateralLevelNum,
            currentPeriod: BigInt(0), // Not used in this context
            lastDistribution,
            distributionPeriod // Keep as bigint
        };
    } catch (error) {
        throw handleError(error, 'get vault state');
    }
}

export function formatVaultStatus(vaultState: VaultState): string {
    const distributionPeriodDays = Number(BigInt(vaultState.distributionPeriod) / SECONDS_PER_DAY);
    
    return `
=== Vault Status ===
Total Value: ${ethers.formatUnits(vaultState.totalValue, 6)} USDC
bondETH Supply: ${ethers.formatEther(vaultState.bondEthSupply)} bondETH
levETH Supply: ${ethers.formatEther(vaultState.levEthSupply)} levETH
Collateral Level: ${(vaultState.collateralLevel * 100).toFixed(2)}%
Last Distribution: ${new Date(Number(vaultState.lastDistribution) * 1000).toLocaleString()}
Distribution Period: ${distributionPeriodDays.toFixed(2)} days
`;
}

export async function validateVaultHealth(
    poolContract: ethers.Contract,
    vaultState: VaultState
): Promise<void> {
    try {
        // Check if pool is paused
        const isPaused = await poolContract.paused();
        if (isPaused) {
            throw new Error('Pool is currently paused');
        }

        // Check collateral level
        if (vaultState.collateralLevel < 1.0) {
            throw new Error('Vault collateral level is below 1.0');
        }

        // Validate distribution period hasn't passed without distribution
        const currentTime = BigInt(Math.floor(Date.now() / 1000));
        const timeSinceLastDistribution = currentTime - vaultState.lastDistribution;
        if (timeSinceLastDistribution > vaultState.distributionPeriod) {
            throw new Error('Distribution period has passed without distribution');
        }
    } catch (error) {
        throw handleError(error, 'validate vault health');
    }
} 