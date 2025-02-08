import { ethers } from 'ethers';
import { handleError } from '../utils/helpers.js';
import { TokenType } from '../core/types.js';

// Constants from pool contract
const PRECISION = 1_000_000; // 6 decimals precision
const MIN_LIQUIDATION_THRESHOLD = 90; // 90%
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60; // 365 days in seconds

export async function setLiquidationThreshold(
    poolContract: ethers.Contract,
    poolFactoryContract: ethers.Contract,
    threshold: number,
    callerAddress: string
): Promise<void> {
    try {
        // Check if caller has GOV_ROLE
        const govRole = ethers.id("GOV_ROLE");
        const hasGovRole = await poolFactoryContract.hasRole(govRole, callerAddress);
        if (!hasGovRole) {
            throw new Error('Caller does not have GOV_ROLE');
        }

        // Validate threshold
        if (threshold < MIN_LIQUIDATION_THRESHOLD) {
            throw new Error(`Liquidation threshold cannot be below ${MIN_LIQUIDATION_THRESHOLD}%`);
        }

        // Set threshold
        const tx = await poolContract.setLiquidationThreshold(threshold * PRECISION);
        await tx.wait();

    } catch (error) {
        throw handleError(error, 'set liquidation threshold');
    }
}

export async function claimFees(
    poolContract: ethers.Contract,
    feeBeneficiary: string
): Promise<void> {
    try {
        // Check if caller is fee beneficiary
        const currentBeneficiary = await poolContract.feeBeneficiary();
        if (currentBeneficiary.toLowerCase() !== feeBeneficiary.toLowerCase()) {
            throw new Error('Caller is not fee beneficiary');
        }

        // Claim fees
        const tx = await poolContract.claimFees();
        await tx.wait();

    } catch (error) {
        throw handleError(error, 'claim fees');
    }
}

export async function getPoolInfo(
    poolContract: ethers.Contract
): Promise<{
    fee: bigint;
    feeBeneficiary: string;
    lastFeeClaimTime: bigint;
    liquidationThreshold: bigint;
    reserveToken: string;
    bondToken: string;
    leverageToken: string;
    couponToken: string;
    sharesPerToken: bigint;
    distributionPeriod: bigint;
    auctionPeriod: bigint;
    lastDistribution: bigint;
}> {
    try {
        const [
            fee,
            feeBeneficiary,
            lastFeeClaimTime,
            liquidationThreshold,
            reserveToken,
            bondToken,
            leverageToken,
            couponToken,
            sharesPerToken,
            distributionPeriod,
            auctionPeriod,
            lastDistribution
        ] = await Promise.all([
            poolContract.fee(),
            poolContract.feeBeneficiary(),
            poolContract.lastFeeClaimTime(),
            poolContract.liquidationThreshold(),
            poolContract.reserveToken(),
            poolContract.bondToken(),
            poolContract.lToken(),
            poolContract.couponToken(),
            poolContract.sharesPerToken(),
            poolContract.distributionPeriod(),
            poolContract.auctionPeriod(),
            poolContract.lastDistribution()
        ]);

        return {
            fee,
            feeBeneficiary,
            lastFeeClaimTime,
            liquidationThreshold,
            reserveToken,
            bondToken,
            leverageToken,
            couponToken,
            sharesPerToken,
            distributionPeriod,
            auctionPeriod,
            lastDistribution
        };

    } catch (error) {
        throw handleError(error, 'get pool info');
    }
}

export async function getAuctionAddress(
    poolContract: ethers.Contract,
    auctionIndex: bigint
): Promise<string> {
    try {
        return await poolContract.auctions(auctionIndex);
    } catch (error) {
        throw handleError(error, 'get auction address');
    }
}

export async function validateCreateParameters(
    poolContract: ethers.Contract,
    tokenType: TokenType,
    depositAmount: bigint
): Promise<void> {
    try {
        // Check minimum and maximum creation amounts
        const [minCreation, maxCreation] = await Promise.all([
            poolContract.getMinCreationAmount(),
            poolContract.getMaxCreationAmount()
        ]);

        if (depositAmount < minCreation) {
            throw new Error(`Deposit amount below minimum: ${ethers.formatEther(minCreation)} required`);
        }

        if (depositAmount > maxCreation) {
            throw new Error(`Deposit amount above maximum: ${ethers.formatEther(maxCreation)} allowed`);
        }

        // Check if pool is paused
        const isPaused = await poolContract.paused();
        if (isPaused) {
            throw new Error('Pool is paused');
        }

        // Get collateral level
        const collateralLevel = await poolContract.getCollateralLevel();
        if (Number(collateralLevel) / PRECISION < 1.0) {
            throw new Error('Cannot create tokens when collateral level is below 1.0');
        }

    } catch (error) {
        throw handleError(error, 'validate create parameters');
    }
}

export async function validateRedeemParameters(
    poolContract: ethers.Contract,
    tokenType: TokenType,
    amount: bigint
): Promise<void> {
    try {
        // Check if pool is paused
        const isPaused = await poolContract.paused();
        if (isPaused) {
            throw new Error('Pool is paused');
        }

        // Get token contract
        const tokenAddress = tokenType === TokenType.BOND ? 
            await poolContract.bondToken() : 
            await poolContract.lToken();
        
        const tokenContract = new ethers.Contract(
            tokenAddress,
            ['function paused() view returns (bool)'],
            poolContract.runner
        );

        // Check if token contract is paused
        const isTokenPaused = await tokenContract.paused();
        if (isTokenPaused) {
            throw new Error(`${tokenType === TokenType.BOND ? 'BondToken' : 'LeverageToken'} contract is paused`);
        }

        // Check minimum redemption amount (if applicable)
        const minRedemption = await poolContract.getMinRedemptionAmount();
        if (amount < minRedemption) {
            throw new Error(`Redemption amount below minimum: ${ethers.formatEther(minRedemption)} required`);
        }

    } catch (error) {
        throw handleError(error, 'validate redeem parameters');
    }
} 