import { Contract, ContractTransaction, Signer, JsonRpcSigner } from 'ethers';
import { formatUnits } from 'ethers';
import { TokenType } from './types.js';

export async function swapUsdcForBondEth(
    poolContract: Contract,
    usdcContract: Contract,
    usdcAmount: bigint,
    slippageTolerance: number
): Promise<ContractTransaction> {
    // 1. Get current vault state
    const collateralLevel = await poolContract.getCollateralLevel();
    const bondSupply = await poolContract.getBondSupply();
    
    // 2. Simulate creation to get exact output amount
    const expectedBondEth = await poolContract.simulateCreate(TokenType.BOND, usdcAmount);
    console.log(`Simulated bondETH output: ${formatUnits(expectedBondEth, 18)} bondETH`);
    
    // 3. Calculate minimum amount with slippage
    const minAmount = expectedBondEth * BigInt(Math.floor((1 - slippageTolerance) * 1e6)) / BigInt(1e6);
    
    // 4. Verify user has sufficient USDC balance
    const signer = poolContract.runner;
    if (!(signer instanceof JsonRpcSigner)) {
        throw new Error('No signer available');
    }
    const signerAddress = await signer.getAddress();
    const usdcBalance = await usdcContract.balanceOf(signerAddress);
    if (usdcBalance < usdcAmount) {
        throw new Error(`Insufficient USDC balance. Required: ${formatUnits(usdcAmount, 6)}, Available: ${formatUnits(usdcBalance, 6)}`);
    }
    
    // 5. Check and set allowance if needed
    const currentAllowance = await usdcContract.allowance(
        signerAddress,
        poolContract.target
    );
    if (currentAllowance < usdcAmount) {
        const approveTx = await usdcContract.approve(poolContract.target, usdcAmount);
        await approveTx.wait();
    }
    
    // 6. Execute creation with 1 hour deadline
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    console.log(`Creating ${formatUnits(expectedBondEth, 18)} bondETH for ${formatUnits(usdcAmount, 6)} USDC`);
    
    return poolContract.create(
        TokenType.BOND,
        usdcAmount,
        minAmount,
        deadline,
        signerAddress
    );
}

export async function swapUsdcForLevEth(
    poolContract: Contract,
    usdcContract: Contract,
    usdcAmount: bigint,
    slippageTolerance: number
): Promise<ContractTransaction> {
    // 1. Get current vault state
    const collateralLevel = await poolContract.getCollateralLevel();
    const leverageSupply = await poolContract.getLeverageSupply();
    
    // 2. Simulate creation to get exact output amount
    const expectedLevEth = await poolContract.simulateCreate(TokenType.LEVERAGE, usdcAmount);
    console.log(`Simulated levETH output: ${formatUnits(expectedLevEth, 18)} levETH`);
    
    // 3. Calculate minimum amount with slippage
    const minAmount = expectedLevEth * BigInt(Math.floor((1 - slippageTolerance) * 1e6)) / BigInt(1e6);
    
    // 4. Verify user has sufficient USDC balance
    const signer = poolContract.runner;
    if (!(signer instanceof JsonRpcSigner)) {
        throw new Error('No signer available');
    }
    const signerAddress = await signer.getAddress();
    const usdcBalance = await usdcContract.balanceOf(signerAddress);
    if (usdcBalance < usdcAmount) {
        throw new Error(`Insufficient USDC balance. Required: ${formatUnits(usdcAmount, 6)}, Available: ${formatUnits(usdcBalance, 6)}`);
    }
    
    // 5. Check and set allowance if needed
    const currentAllowance = await usdcContract.allowance(
        signerAddress,
        poolContract.target
    );
    if (currentAllowance < usdcAmount) {
        const approveTx = await usdcContract.approve(poolContract.target, usdcAmount);
        await approveTx.wait();
    }
    
    // 6. Execute creation with 1 hour deadline
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    console.log(`Creating ${formatUnits(expectedLevEth, 18)} levETH for ${formatUnits(usdcAmount, 6)} USDC`);
    
    return poolContract.create(
        TokenType.LEVERAGE,
        usdcAmount,
        minAmount,
        deadline,
        signerAddress
    );
} 