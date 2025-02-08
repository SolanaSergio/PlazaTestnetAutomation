import { ethers } from 'ethers';
import { TransactionStatus, TokenType } from '../core/types.js';
import { handleError } from '../utils/helpers.js';
import { getVaultState } from './vaultOperations.js';
import { approveToken } from '../contracts/contractSetup.js';

export async function swapUsdcForLevEth(
    poolContract: ethers.Contract,
    usdcContract: ethers.Contract,
    swapRouterContract: ethers.Contract,
    oracleContract: ethers.Contract,
    bondEthContract: ethers.Contract,
    levEthContract: ethers.Contract,
    usdcAmount: bigint,
    walletAddress: string,
    slippageTolerance: number,
    gasLimit: bigint,
    txHistory: TransactionStatus[]
): Promise<TransactionStatus> {
    try {
        // 1. Check USDC balance
        const usdcBalance = await usdcContract.balanceOf(walletAddress);
        if (usdcBalance < usdcAmount) {
            throw new Error(`Insufficient USDC balance. Required: ${ethers.formatUnits(usdcAmount, 6)}, Available: ${ethers.formatUnits(usdcBalance, 6)}`);
        }

        // Get ETH price from oracle using latestRoundData
        const { answer } = await oracleContract.latestRoundData();
        const ethPrice = BigInt(answer.toString());
        // 2. Get vault state to check conditions
        const vaultState = await getVaultState(poolContract, ethPrice);
        if (vaultState.collateralLevel < 1.0) {
            throw new Error('Cannot create levETH when collateral level is below 1.0');
        }

        // 3. Calculate expected levETH output
        const levEthPrice = vaultState.collateralLevel > 1.2 ?
            (vaultState.totalValue - (vaultState.bondEthSupply * BigInt(100))) / vaultState.levEthSupply :
            (vaultState.totalValue * BigInt(20)) / (vaultState.levEthSupply * BigInt(100));

        const expectedLevEth = (usdcAmount * ethers.parseEther('1')) / levEthPrice;
        const minAmountOut = (expectedLevEth * BigInt(10000 - slippageTolerance)) / BigInt(10000);

        // 4. Check creation limits
        const minCreation = await poolContract.getMinCreationAmount();
        const maxCreation = await poolContract.getMaxCreationAmount();
        if (minAmountOut < minCreation) {
            throw new Error(`Amount too small. Minimum creation amount: ${ethers.formatEther(minCreation)} levETH`);
        }
        if (minAmountOut > maxCreation) {
            throw new Error(`Amount too large. Maximum creation amount: ${ethers.formatEther(maxCreation)} levETH`);
        }

        // 5. Approve USDC spending if needed
        const poolAddress = await poolContract.getAddress();
        await approveToken(usdcContract, poolAddress, usdcAmount);

        // 6. Execute swap
        console.log(`Swapping ${ethers.formatUnits(usdcAmount, 6)} USDC for levETH...`);
        console.log(`Expected minimum output: ${ethers.formatEther(minAmountOut)} levETH`);
        console.log(`Current collateral level: ${(vaultState.collateralLevel * 100).toFixed(2)}%`);
        console.log(`Current levETH price: ${ethers.formatUnits(levEthPrice, 6)} USDC`);

        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour deadline
        const tx = await poolContract.create(
            TokenType.LEVERAGE,
            usdcAmount,
            minAmountOut,
            deadline,
            walletAddress,
            { gasLimit }
        );

        const receipt = await tx.wait();
        const status: TransactionStatus = {
            type: 'SWAP_USDC_TO_LEVETH',
            hash: tx.hash,
            success: true,
            timestamp: new Date(),
            gasUsed: receipt.gasUsed
        };

        txHistory.push(status);
        return status;

    } catch (error) {
        const status: TransactionStatus = {
            type: 'SWAP_USDC_TO_LEVETH',
            hash: '',
            success: false,
            timestamp: new Date(),
            error: error instanceof Error ? error.message : 'Unknown error'
        };
        txHistory.push(status);
        throw handleError(error, 'USDC to levETH swap');
    }
}

export async function swapUsdcForBondEth(
    poolContract: ethers.Contract,
    usdcContract: ethers.Contract,
    swapRouterContract: ethers.Contract,
    oracleContract: ethers.Contract,
    bondEthContract: ethers.Contract,
    levEthContract: ethers.Contract,
    usdcAmount: bigint,
    walletAddress: string,
    slippageTolerance: number,
    gasLimit: bigint,
    txHistory: TransactionStatus[]
): Promise<TransactionStatus> {
    try {
        // 1. Check USDC balance
        const usdcBalance = await usdcContract.balanceOf(walletAddress);
        if (usdcBalance < usdcAmount) {
            throw new Error(`Insufficient USDC balance. Required: ${ethers.formatUnits(usdcAmount, 6)}, Available: ${ethers.formatUnits(usdcBalance, 6)}`);
        }

        // Get ETH price from oracle using latestRoundData
        const { answer } = await oracleContract.latestRoundData();
        const ethPrice = BigInt(answer.toString());
        // 2. Get vault state to check conditions
        const vaultState = await getVaultState(poolContract, ethPrice);
        if (vaultState.collateralLevel < 1.0) {
            throw new Error('Cannot create bondETH when collateral level is below 1.0');
        }

        // 3. Calculate expected bondETH output based on collateral level
        const bondEthPrice = vaultState.collateralLevel > 1.2 ?
            BigInt(100) * ethers.parseUnits('1', 6) : // Fixed at 100 USDC if collateral level > 1.2
            (vaultState.totalValue * BigInt(80)) / (vaultState.bondEthSupply * BigInt(100)); // 80% of collateral value
        const expectedBondEth = (usdcAmount * ethers.parseEther('1')) / bondEthPrice;
        const minAmountOut = (expectedBondEth * BigInt(10000 - slippageTolerance)) / BigInt(10000);

        // 4. Check creation limits
        const minCreation = await poolContract.getMinCreationAmount();
        const maxCreation = await poolContract.getMaxCreationAmount();
        if (minAmountOut < minCreation) {
            throw new Error(`Amount too small. Minimum creation amount: ${ethers.formatEther(minCreation)} bondETH`);
        }
        if (minAmountOut > maxCreation) {
            throw new Error(`Amount too large. Maximum creation amount: ${ethers.formatEther(maxCreation)} bondETH`);
        }

        // 5. Approve USDC spending if needed
        const poolAddress = await poolContract.getAddress();
        await approveToken(usdcContract, poolAddress, usdcAmount);

        // 6. Execute swap
        console.log(`Swapping ${ethers.formatUnits(usdcAmount, 6)} USDC for bondETH...`);
        console.log(`Expected minimum output: ${ethers.formatEther(minAmountOut)} bondETH`);
        console.log(`Current collateral level: ${(vaultState.collateralLevel * 100).toFixed(2)}%`);
        console.log(`Current bondETH price: ${ethers.formatUnits(bondEthPrice, 6)} USDC`);

        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour deadline
        const tx = await poolContract.create(
            TokenType.BOND,
            usdcAmount,
            minAmountOut,
            deadline,
            walletAddress,
            { gasLimit }
        );

        const receipt = await tx.wait();
        const status: TransactionStatus = {
            type: 'SWAP_USDC_TO_BONDETH',
            hash: tx.hash,
            success: true,
            timestamp: new Date(),
            gasUsed: receipt.gasUsed
        };

        txHistory.push(status);
        return status;

    } catch (error) {
        const status: TransactionStatus = {
            type: 'SWAP_USDC_TO_BONDETH',
            hash: '',
            success: false,
            timestamp: new Date(),
            error: error instanceof Error ? error.message : 'Unknown error'
        };
        txHistory.push(status);
        throw handleError(error, 'USDC to bondETH swap');
    }
}

export async function swapWstethForLevEth(
    poolContract: ethers.Contract,
    wstethContract: ethers.Contract,
    oracleContract: ethers.Contract,
    bondEthContract: ethers.Contract,
    levEthContract: ethers.Contract,
    amountIn: bigint,
    walletAddress: string,
    slippageTolerance: number,
    gasLimit: bigint,
    txHistory: TransactionStatus[]
): Promise<TransactionStatus> {
    try {
        // 1. Check wstETH balance
        const wstethBalance = await wstethContract.balanceOf(walletAddress);
        if (wstethBalance < amountIn) {
            throw new Error(`Insufficient wstETH balance. Required: ${ethers.formatEther(amountIn)}, Available: ${ethers.formatEther(wstethBalance)}`);
        }

        // Get ETH price from oracle using latestRoundData
        const { answer } = await oracleContract.latestRoundData();
        const ethPrice = BigInt(answer.toString());
        // 2. Get vault state to check conditions
        const vaultState = await getVaultState(poolContract, ethPrice);
        if (vaultState.collateralLevel < 1.0) {
            throw new Error('Cannot create levETH when collateral level is below 1.0');
        }

        // 3. Calculate expected levETH output using oracle price
        const { answer: wstethAnswer } = await oracleContract.latestRoundData();
        const wstethPrice = BigInt(wstethAnswer.toString());
        const wstethValue = (amountIn * wstethPrice) / ethers.parseEther('1');
        
        const levEthPrice = vaultState.collateralLevel > 1.2 ?
            (vaultState.totalValue - (vaultState.bondEthSupply * BigInt(100))) / vaultState.levEthSupply :
            (vaultState.totalValue * BigInt(20)) / (vaultState.levEthSupply * BigInt(100));

        const expectedLevEth = (wstethValue * ethers.parseEther('1')) / levEthPrice;
        const minAmountOut = (expectedLevEth * BigInt(10000 - slippageTolerance)) / BigInt(10000);

        // 4. Check creation limits
        const minCreation = await poolContract.getMinCreationAmount();
        const maxCreation = await poolContract.getMaxCreationAmount();
        if (minAmountOut < minCreation) {
            throw new Error(`Amount too small. Minimum creation amount: ${ethers.formatEther(minCreation)} levETH`);
        }
        if (minAmountOut > maxCreation) {
            throw new Error(`Amount too large. Maximum creation amount: ${ethers.formatEther(maxCreation)} levETH`);
        }

        // 5. Approve wstETH spending if needed
        const poolAddress = await poolContract.getAddress();
        await approveToken(wstethContract, poolAddress, amountIn);

        // 6. Execute swap
        console.log(`Swapping ${ethers.formatEther(amountIn)} wstETH for levETH...`);
        console.log(`Expected minimum output: ${ethers.formatEther(minAmountOut)} levETH`);
        console.log(`Current collateral level: ${(vaultState.collateralLevel * 100).toFixed(2)}%`);
        console.log(`Current levETH price: ${ethers.formatUnits(levEthPrice, 6)} USDC`);

        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour deadline
        const tx = await poolContract.create(
            TokenType.LEVERAGE,
            amountIn,
            minAmountOut,
            deadline,
            walletAddress,
            { gasLimit }
        );

        const receipt = await tx.wait();
        const status: TransactionStatus = {
            type: 'SWAP_WSTETH_TO_LEVETH',
            hash: tx.hash,
            success: true,
            timestamp: new Date(),
            gasUsed: receipt.gasUsed
        };

        txHistory.push(status);
        return status;

    } catch (error) {
        const status: TransactionStatus = {
            type: 'SWAP_WSTETH_TO_LEVETH',
            hash: '',
            success: false,
            timestamp: new Date(),
            error: error instanceof Error ? error.message : 'Unknown error'
        };
        txHistory.push(status);
        throw handleError(error, 'wstETH to levETH swap');
    }
} 