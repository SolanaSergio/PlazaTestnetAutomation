import { ethers } from 'ethers';
import { handleError } from '../utils/helpers.js';

// Constants
const PRECISION = 1_000_000; // 6 decimals precision
const MIN_BID_INCREASE = 50_000; // 5% with 6 decimals precision
const MAX_AUCTION_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

interface AuctionInfo {
    startTime: bigint;
    endTime: bigint;
    highestBid: bigint;
    highestBidder: string;
    reservePrice: bigint;
    tokenAmount: bigint;
    settled: boolean;
}

async function validateAuctionParameters(
    startTime: bigint,
    endTime: bigint,
    reservePrice: bigint
): Promise<void> {
    const now = BigInt(Math.floor(Date.now() / 1000));
    
    if (startTime < now) {
        throw new Error('Auction start time must be in the future');
    }
    
    if (endTime <= startTime) {
        throw new Error('Auction end time must be after start time');
    }
    
    const duration = endTime - startTime;
    if (duration > BigInt(MAX_AUCTION_DURATION)) {
        throw new Error('Auction duration exceeds maximum allowed');
    }
    
    if (reservePrice <= 0) {
        throw new Error('Reserve price must be greater than 0');
    }
}

export async function getAuctionInfo(
    auctionContract: ethers.Contract
): Promise<AuctionInfo> {
    try {
        const [
            startTime,
            endTime,
            highestBid,
            highestBidder,
            reservePrice,
            tokenAmount,
            settled
        ] = await Promise.all([
            auctionContract.startTime(),
            auctionContract.endTime(),
            auctionContract.highestBid(),
            auctionContract.highestBidder(),
            auctionContract.reservePrice(),
            auctionContract.tokenAmount(),
            auctionContract.settled()
        ]);

        return {
            startTime,
            endTime,
            highestBid,
            highestBidder,
            reservePrice,
            tokenAmount,
            settled
        };
    } catch (error) {
        throw handleError(error, 'get auction info');
    }
}

export async function placeBid(
    auctionContract: ethers.Contract,
    bidAmount: bigint,
    bidder: string
): Promise<void> {
    try {
        const [currentBid, minIncrease] = await Promise.all([
            auctionContract.highestBid(),
            auctionContract.minBidIncrease()
        ]);

        // Calculate minimum required bid
        const minRequiredBid = currentBid + ((currentBid * minIncrease) / PRECISION);

        if (bidAmount <= minRequiredBid) {
            throw new Error(`Bid amount must be at least ${ethers.formatUnits(minRequiredBid, 6)} USDC`);
        }

        // Place bid
        const tx = await auctionContract.placeBid(bidAmount, bidder);
        await tx.wait();

    } catch (error) {
        throw handleError(error, 'place bid');
    }
}

export async function settleAuction(
    auctionContract: ethers.Contract
): Promise<void> {
    try {
        const [endTime, settled] = await Promise.all([
            auctionContract.endTime(),
            auctionContract.settled()
        ]);

        const now = BigInt(Math.floor(Date.now() / 1000));
        if (now <= endTime) {
            throw new Error('Auction has not ended yet');
        }

        if (settled) {
            throw new Error('Auction has already been settled');
        }

        // Settle auction
        const tx = await auctionContract.settle();
        await tx.wait();

    } catch (error) {
        throw handleError(error, 'settle auction');
    }
}

export async function formatAuctionStatus(auctionInfo: AuctionInfo): Promise<string> {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const status = now < auctionInfo.startTime ? 'Not Started' :
                  now > auctionInfo.endTime ? 'Ended' :
                  'Active';

    return `Auction Status:
    Status: ${status}
    Token Amount: ${ethers.formatEther(auctionInfo.tokenAmount)} ETH
    Reserve Price: ${ethers.formatUnits(auctionInfo.reservePrice, 6)} USDC
    Highest Bid: ${ethers.formatUnits(auctionInfo.highestBid, 6)} USDC
    Highest Bidder: ${auctionInfo.highestBidder}
    Start Time: ${new Date(Number(auctionInfo.startTime) * 1000).toLocaleString()}
    End Time: ${new Date(Number(auctionInfo.endTime) * 1000).toLocaleString()}
    Settled: ${auctionInfo.settled ? 'Yes' : 'No'}`;
} 