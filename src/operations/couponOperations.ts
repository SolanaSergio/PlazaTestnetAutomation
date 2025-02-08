import { ethers } from 'ethers';
import { TransactionStatus } from '../core/types.js';
import { handleError } from '../utils/helpers.js';

export async function claimCoupons(
    distributorContract: ethers.Contract,
    walletAddress: string,
    gasLimit: bigint,
    txHistory: TransactionStatus[]
): Promise<TransactionStatus> {
    try {
        // Get claimable amount first
        const claimableAmount = await distributorContract.getClaimableAmount(walletAddress);
        
        if (claimableAmount <= BigInt(0)) {
            throw new Error('No coupons available to claim');
        }

        // Get unclaimed epochs
        const currentEpoch = await distributorContract.getCurrentEpoch();
        const unclaimedEpochs: number[] = [];
        
        // Check last 10 epochs
        for (let i = 0; i < 10; i++) {
            const epochId = Number(currentEpoch) - i;
            if (epochId < 0) break;
            
            const claimed = await distributorContract.isClaimed(epochId, walletAddress);
            if (!claimed) {
                const epochStart = await distributorContract.getEpochStart(epochId);
                const epochEnd = await distributorContract.getEpochEnd(epochId);
                const now = BigInt(Math.floor(Date.now() / 1000));
                
                // Only add epochs that have ended
                if (epochEnd < now) {
                    unclaimedEpochs.push(epochId);
                }
            }
        }

        if (unclaimedEpochs.length === 0) {
            throw new Error('No completed epochs to claim');
        }

        // Check if there are enough shares to distribute
        const totalShares = await distributorContract.getTotalShares();
        if (totalShares <= BigInt(0)) {
            throw new Error('Not enough shares to distribute');
        }

        // Check if there are enough coupon tokens in the contract
        const couponBalance = await distributorContract.getCouponBalance();
        if (couponBalance < claimableAmount) {
            throw new Error('Not enough coupon tokens in the distributor contract');
        }

        // Claim all unclaimed epochs
        console.log(`Claiming coupons for epochs: ${unclaimedEpochs.join(', ')}`);
        console.log(`Expected claim amount: ${ethers.formatUnits(claimableAmount, 6)} USDC`);
        
        const tx = await distributorContract.claimMany(unclaimedEpochs, {
            gasLimit
        });

        const receipt = await tx.wait();
        const status: TransactionStatus = {
            type: 'CLAIM_COUPONS',
            hash: tx.hash,
            success: true,
            timestamp: new Date(),
            gasUsed: receipt.gasUsed
        };

        txHistory.push(status);
        console.log(`Successfully claimed ${ethers.formatUnits(claimableAmount, 6)} USDC in coupons`);
        return status;

    } catch (error) {
        // Handle specific distributor errors
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        let userMessage = errorMessage;

        if (errorMessage.includes('NotEnoughSharesBalance')) {
            userMessage = 'Not enough shares in the distributor contract';
        } else if (errorMessage.includes('NotEnoughSharesToDistribute')) {
            userMessage = 'Not enough shares allocated for distribution';
        } else if (errorMessage.includes('NotEnoughCouponBalance')) {
            userMessage = 'Not enough coupon tokens in the distributor contract';
        } else if (errorMessage.includes('UnsupportedPool')) {
            userMessage = 'The pool is not supported by the distributor';
        } else if (errorMessage.includes('CallerIsNotPool')) {
            userMessage = 'Operation can only be called by the pool contract';
        }

        const status: TransactionStatus = {
            type: 'CLAIM_COUPONS',
            hash: '',
            success: false,
            timestamp: new Date(),
            error: userMessage
        };
        txHistory.push(status);
        throw handleError(error, 'coupon claim');
    }
}

export async function getUnclaimedEpochs(
    distributorContract: ethers.Contract,
    walletAddress: string
): Promise<number[]> {
    const currentEpoch = await distributorContract.getCurrentEpoch();
    const unclaimedEpochs: number[] = [];

    // Check last 10 epochs
    for (let i = 0; i < 10; i++) {
        const epochId = Number(currentEpoch) - i;
        if (epochId < 0) break;
        
        const claimed = await distributorContract.isClaimed(epochId, walletAddress);
        if (!claimed) {
            unclaimedEpochs.push(epochId);
        }
    }

    return unclaimedEpochs;
}

export async function getClaimableInfo(
    distributorContract: ethers.Contract,
    walletAddress: string
): Promise<{ epochs: number[]; amount: bigint }> {
    const epochs = await getUnclaimedEpochs(distributorContract, walletAddress);
    const claimableAmount = await distributorContract.getClaimableAmount(walletAddress);
    return {
        epochs,
        amount: claimableAmount
    };
} 