import { ethers } from 'ethers';
import { TransactionStatus, TokenType, VaultState } from '../core/types.js';
import { handleError } from '../utils/helpers.js';
import { getVaultState } from './vaultOperations.js';
import { approveToken } from '../contracts/contractSetup.js';

export async function redeemBondEth(
    poolContract: ethers.Contract,
    bondEthContract: ethers.Contract,
    oracleContract: ethers.Contract,
    levEthContract: ethers.Contract,
    amount: bigint,
    walletAddress: string,
    slippageTolerance: number,
    gasLimit: bigint,
    txHistory: TransactionStatus[]
): Promise<TransactionStatus> {
    try {
        // Get ETH price from oracle using latestRoundData
        const { answer } = await oracleContract.latestRoundData();
        const ethPrice = BigInt(answer.toString());
        // Get current vault state
        const vaultState = await getVaultState(poolContract, ethPrice);
        
        // Calculate pro-forma collateral level
        const proFormaCollateralLevel = calculateProFormaCollateralLevel(
            vaultState,
            amount,
            true // isBondToken
        );

        // Calculate redemption price based on pro-forma collateral level
        let redemptionPrice: bigint;
        if (proFormaCollateralLevel > 1.2) {
            // Lesser of 100 USDC or market price
            const marketPrice = await poolContract.getTokenPrice(TokenType.BOND);
            redemptionPrice = marketPrice < ethers.parseUnits('100', 6) ? 
                marketPrice : ethers.parseUnits('100', 6);
        } else {
            // 80% of vault's collateral value or market price (whichever is lower)
            const collateralValue = (vaultState.totalValue * BigInt(80)) / 
                (vaultState.bondEthSupply * BigInt(100));
            const marketPrice = await poolContract.getTokenPrice(TokenType.BOND);
            redemptionPrice = collateralValue < marketPrice ? collateralValue : marketPrice;
        }

        // Calculate minimum amount out with slippage
        const minAmountOut = (amount * redemptionPrice * BigInt(10000 - slippageTolerance)) / BigInt(10000);

        // Check bondETH balance
        const bondBalance = await bondEthContract.balanceOf(walletAddress);
        if (bondBalance < amount) {
            throw new Error(`Insufficient bondETH balance. Required: ${ethers.formatEther(amount)}, Available: ${ethers.formatEther(bondBalance)}`);
        }

        // Approve bondETH spending if needed
        const poolAddress = await poolContract.getAddress();
        await approveToken(bondEthContract, poolAddress, amount);

        // Execute redemption
        console.log(`Redeeming ${ethers.formatEther(amount)} bondETH...`);
        console.log(`Pro-forma Collateral Level: ${(proFormaCollateralLevel * 100).toFixed(2)}%`);
        console.log(`Expected redemption price: ${ethers.formatUnits(redemptionPrice, 6)} USDC`);
        console.log(`Minimum output amount: ${ethers.formatUnits(minAmountOut, 6)} USDC`);
        
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour deadline
        const tx = await poolContract.redeem(
            TokenType.BOND,
            amount,
            minAmountOut,
            deadline,
            walletAddress,
            { gasLimit }
        );

        const receipt = await tx.wait();
        const status: TransactionStatus = {
            type: 'REDEEM_BONDETH',
            hash: tx.hash,
            success: true,
            timestamp: new Date(),
            gasUsed: receipt.gasUsed
        };

        txHistory.push(status);
        return status;

    } catch (error) {
        const status: TransactionStatus = {
            type: 'REDEEM_BONDETH',
            hash: '',
            success: false,
            timestamp: new Date(),
            error: error instanceof Error ? error.message : 'Unknown error'
        };
        txHistory.push(status);
        throw handleError(error, 'bondETH redemption');
    }
}

function calculateProFormaCollateralLevel(
    vaultState: VaultState,
    redeemAmount: bigint,
    isBondToken: boolean
): number {
    if (isBondToken) {
        // Calculate pro-forma collateral level for bondETH redemption
        const bondValueRedeemed = redeemAmount * ethers.parseUnits('100', 6);
        const remainingBondSupply = vaultState.bondEthSupply - redeemAmount;
        
        if (remainingBondSupply <= 0) return 999; // Max collateral level if no bonds left
        
        // ((ETH tokens × ETH price) - (bondETH redeemed × 100)) ÷ ((bondETH supply - bondETH redeemed) × 100)
        const proFormaCollateralLevel = Number(vaultState.totalValue - bondValueRedeemed) / 
            Number(remainingBondSupply * ethers.parseUnits('100', 6));
            
        return proFormaCollateralLevel;
    } else {
        // For levETH redemption, use current collateral level
        // This is correct as levETH redemptions don't affect the bond backing ratio
        return vaultState.collateralLevel;
    }
}

export async function redeemLevEth(
    poolContract: ethers.Contract,
    levEthContract: ethers.Contract,
    oracleContract: ethers.Contract,
    bondEthContract: ethers.Contract,
    amount: bigint,
    walletAddress: string,
    slippageTolerance: number,
    gasLimit: bigint,
    txHistory: TransactionStatus[]
): Promise<TransactionStatus> {
    try {
        // Get ETH price from oracle using latestRoundData
        const { answer } = await oracleContract.latestRoundData();
        const ethPrice = BigInt(answer.toString());
        // Get current vault state
        const vaultState = await getVaultState(poolContract, ethPrice);
        
        // Calculate redemption price based on collateral level
        let redemptionPrice: bigint;
        if (vaultState.collateralLevel > 1.2) {
            // (Total Value - (100 × bondETH supply)) ÷ levETH supply
            redemptionPrice = (vaultState.totalValue - (vaultState.bondEthSupply * BigInt(100))) / 
                vaultState.levEthSupply;
        } else {
            // 20% of vault's collateral value or market price (whichever is lower)
            const collateralValue = (vaultState.totalValue * BigInt(20)) / 
                (vaultState.levEthSupply * BigInt(100));
            const marketPrice = await poolContract.getTokenPrice(TokenType.LEVERAGE);
            redemptionPrice = collateralValue < marketPrice ? collateralValue : marketPrice;
        }

        // Calculate minimum amount out with slippage
        const minAmountOut = (amount * redemptionPrice * BigInt(10000 - slippageTolerance)) / BigInt(10000);

        // Check levETH balance
        const levBalance = await levEthContract.balanceOf(walletAddress);
        if (levBalance < amount) {
            throw new Error(`Insufficient levETH balance. Required: ${ethers.formatEther(amount)}, Available: ${ethers.formatEther(levBalance)}`);
        }

        // Approve levETH spending if needed
        const poolAddress = await poolContract.getAddress();
        await approveToken(levEthContract, poolAddress, amount);

        // Execute redemption
        console.log(`Redeeming ${ethers.formatEther(amount)} levETH...`);
        console.log(`Collateral Level: ${(vaultState.collateralLevel * 100).toFixed(2)}%`);
        console.log(`Expected redemption price: ${ethers.formatUnits(redemptionPrice, 6)} USDC`);
        console.log(`Minimum output amount: ${ethers.formatUnits(minAmountOut, 6)} USDC`);
        
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour deadline
        const tx = await poolContract.redeem(
            TokenType.LEVERAGE,
            amount,
            minAmountOut,
            deadline,
            walletAddress,
            { gasLimit }
        );

        const receipt = await tx.wait();
        const status: TransactionStatus = {
            type: 'REDEEM_LEVETH',
            hash: tx.hash,
            success: true,
            timestamp: new Date(),
            gasUsed: receipt.gasUsed
        };

        txHistory.push(status);
        return status;

    } catch (error) {
        const status: TransactionStatus = {
            type: 'REDEEM_LEVETH',
            hash: '',
            success: false,
            timestamp: new Date(),
            error: error instanceof Error ? error.message : 'Unknown error'
        };
        txHistory.push(status);
        throw handleError(error, 'levETH redemption');
    }
} 