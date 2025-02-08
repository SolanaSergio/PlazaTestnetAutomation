import { ethers } from 'ethers';
import { State, Bid } from './core/types.js';

// Constants from docs
const AUCTION_DURATION = 10 * 24 * 60 * 60; // 10 days in seconds
const MINIMUM_BID_SLOTS = 1000; // From docs: "splits into 1,000 equal slots"

export class AuctionManager {
    private pool: ethers.Contract;
    private auction: ethers.Contract;
    private distributor: ethers.Contract;

    constructor(
        poolContract: ethers.Contract,
        auctionContract: ethers.Contract,
        distributorContract: ethers.Contract
    ) {
        this.pool = poolContract;
        this.auction = auctionContract;
        this.distributor = distributorContract;
    }

    async monitorAuction(): Promise<void> {
        const state = await this.auction.state();
        const endTime = await this.auction.endTime();
        const now = Math.floor(Date.now() / 1000);

        if (state === State.BIDDING && now > endTime) {
            await this.endAuction();
        }
    }

    async placeBid(buyReserveAmount: bigint, sellCouponAmount: bigint): Promise<void> {
        // Calculate slot size based on total amount needed
        const slotSize = await this.auction.slotSize();
        const totalSlots = MINIMUM_BID_SLOTS;

        // Validate amounts meet minimum slot requirements
        if (buyReserveAmount < slotSize) {
            throw new Error("Bid amount too low for minimum slot size");
        }

        // Place bid
        const tx = await this.auction.placeBid(buyReserveAmount, sellCouponAmount);
        await tx.wait();
    }

    async claimBid(bidIndex: number): Promise<void> {
        const state = await this.auction.state();
        
        if (state === State.SUCCEEDED) {
            await this.auction.claimBid(bidIndex);
        } else if (state === State.FAILED_UNDERSOLD || state === State.FAILED_LIQUIDATION) {
            await this.auction.claimRefund(bidIndex);
        }
    }

    async endAuction(): Promise<void> {
        const state = await this.auction.state();
        if (state === State.BIDDING) {
            const tx = await this.auction.endAuction();
            await tx.wait();

            // After auction ends, trigger distribution if successful
            const newState = await this.auction.state();
            if (newState === State.SUCCEEDED) {
                await this.triggerDistribution();
            }
        }
    }

    private async triggerDistribution(): Promise<void> {
        // Transfer auction proceeds to distributor for coupon payments
        const couponAmount = await this.auction.totalBuyCouponAmount();
        await this.distributor.updateIndexedUserAssets(this.pool.address, couponAmount);
    }

    // Helper to get auction status
    async getAuctionStatus(): Promise<{
        state: State,
        endTime: number,
        totalBids: number,
        liquidationThreshold: number
    }> {
        const [state, endTime, totalBuyCouponAmount, liquidationThreshold] = await Promise.all([
            this.auction.state(),
            this.auction.endTime(),
            this.auction.totalBuyCouponAmount(),
            this.auction.liquidationThreshold()
        ]);

        return {
            state,
            endTime: endTime.toNumber(),
            totalBids: totalBuyCouponAmount.toNumber(),
            liquidationThreshold: liquidationThreshold.toNumber()
        };
    }
}