import { ethers } from 'ethers';
import chalk from 'chalk';
import { EthersError } from '../core/types.js';

export async function randomDelay(minSeconds: number = 30, maxSeconds: number = 300): Promise<void> {
    const min = minSeconds * 1000;
    const max = maxSeconds * 1000;
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    await new Promise(resolve => setTimeout(resolve, delay));
}

export function handleError(error: unknown, operation: string): never {
    if (error instanceof Error) {
        const ethersError = error as EthersError;
        
        // Handle specific error types
        if (ethersError.code) {
            switch (ethersError.code) {
                case 'INSUFFICIENT_FUNDS':
                    throw new Error(`Insufficient funds for ${operation}`);
                case 'UNPREDICTABLE_GAS_LIMIT':
                    throw new Error(`Unable to estimate gas for ${operation}. The transaction may fail.`);
                case 'CALL_EXCEPTION':
                    throw new Error(`Contract call failed for ${operation}: ${ethersError.reason || error.message}`);
                default:
                    throw new Error(`Error in ${operation}: ${error.message}`);
            }
        }

        // Handle transaction errors
        if (ethersError.transaction) {
            console.error(chalk.yellow('\nTransaction details:'));
            console.error('To:', ethersError.transaction.to);
            console.error('From:', ethersError.transaction.from);
            console.error('Data:', ethersError.transaction.data);
        }
        throw error;
    }
    throw new Error(`Unknown error in ${operation}`);
}

export function calculateOptimalGasPrice(
    baseFee: bigint | undefined,
    priorityFee: bigint | undefined,
    fallbackGasPrice: bigint | undefined
): bigint {
    try {
        if (!baseFee) throw new Error('Could not get base fee');
        
        // Calculate priority fee (tip)
        const actualPriorityFee = priorityFee || (baseFee / BigInt(10)); // 10% of base fee if not available
        
        // Calculate total gas price with dynamic adjustment
        const totalGasPrice = baseFee + actualPriorityFee;
        
        // Add a small buffer that scales with the gas price (5-15% based on network congestion)
        const congestionFactor = Number(baseFee) / Number(ethers.parseUnits("1", "gwei"));
        const bufferPercent = Math.min(Math.max(5 + Math.floor(congestionFactor), 5), 15);
        const buffer = (totalGasPrice * BigInt(bufferPercent)) / BigInt(100);
        
        return totalGasPrice + buffer;
    } catch (error) {
        console.log(chalk.yellow('Warning: Using fallback gas price estimation'));
        // Fallback to network's suggested gas price with 10% buffer
        const gasPrice = fallbackGasPrice || ethers.parseUnits("1", "gwei");
        return gasPrice + (gasPrice * BigInt(10)) / BigInt(100);
    }
}

export function minBigInt(a: bigint, b: bigint): bigint {
    return a < b ? a : b;
}

export function maxBigInt(a: bigint, b: bigint): bigint {
    return a > b ? a : b;
} 