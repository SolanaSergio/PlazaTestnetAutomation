import { ethers } from 'ethers';
import { Config } from '../core/types.js';
import { handleError } from '../utils/helpers.js';
import { setupTokenContract } from '../operations/tokenOperations.js';

const POOL_FUNCTIONS = [
    // View functions
    'function getReserve() view returns (uint256)',
    'function getBondSupply() view returns (uint256)',
    'function getLeverageSupply() view returns (uint256)',
    'function getCollateralLevel() view returns (uint256)',
    'function getMinCreationAmount() view returns (uint256)',
    'function getMaxCreationAmount() view returns (uint256)',
    'function getMinRedemptionAmount() view returns (uint256)',
    'function getTokenPrice(uint8 tokenType) view returns (uint256)',
    'function getFeeAmount() view returns (uint256)',
    'function fee() view returns (uint256)',
    'function feeBeneficiary() view returns (address)',
    'function lastFeeClaimTime() view returns (uint256)',
    'function liquidationThreshold() view returns (uint256)',
    'function reserveToken() view returns (address)',
    'function bondToken() view returns (address)',
    'function lToken() view returns (address)',
    'function couponToken() view returns (address)',
    'function sharesPerToken() view returns (uint256)',
    'function distributionPeriod() view returns (uint256)',
    'function auctionPeriod() view returns (uint256)',
    'function lastDistribution() view returns (uint256)',
    'function auctions(uint256) view returns (address)',
    'function paused() view returns (bool)',
    
    // State-changing functions
    'function create(uint8 tokenType, uint256 depositAmount, uint256 minAmount, uint256 deadline, address onBehalfOf) returns (uint256)',
    'function redeem(uint8 tokenType, uint256 amount, uint256 minAmount, uint256 deadline, address onBehalfOf) returns (uint256)',
    'function setLiquidationThreshold(uint256 _liquidationThreshold)',
    'function claimFees()',
    
    // Events
    'event TokensCreated(address indexed caller, address indexed onBehalfOf, uint8 tokenType, uint256 depositedAmount, uint256 mintedAmount)',
    'event TokensRedeemed(address indexed caller, address indexed onBehalfOf, uint8 tokenType, uint256 depositedAmount, uint256 redeemedAmount)',
    'event SharesPerTokenChanged(uint256 sharesPerToken)',
    'event Distributed(uint256 amount, address distributor)',
    'event AuctionPeriodChanged(uint256 oldPeriod, uint256 newPeriod)',
    'event DistributionRollOver(uint256 period, uint256 sharesPerToken)',
    'event DistributionPeriodChanged(uint256 oldPeriod, uint256 newPeriod)'
];

export async function setupContracts(config: Config) {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(config.privateKey, provider);

    // Setup Pool contract
    const poolContract = new ethers.Contract(
        config.plazaPoolAddress,
        POOL_FUNCTIONS,
        wallet
    );

    // Setup Oracle contract
    const oracleContract = new ethers.Contract(
        config.oracleAddress,
        config.oracleAbi,
        wallet
    );

    // Setup token contracts
    const usdcContract = new ethers.Contract(
        config.usdcAddress,
        config.erc20Abi,
        wallet
    );

    // Setup token contracts with provider first, then connect with wallet
    const bondEthContract = (await setupTokenContract(provider, config.bondEthAddress, true)).connect(wallet);
    const levEthContract = (await setupTokenContract(provider, config.levEthAddress, false)).connect(wallet);

    return {
        provider,
        wallet,
        poolContract,
        oracleContract,
        usdcContract,
        bondEthContract,
        levEthContract
    };
}

export async function getEthPrice(oracleContract: ethers.Contract): Promise<bigint> {
    try {
        const price = await oracleContract.getLatestPrice();
        return price;
    } catch (error) {
        throw handleError(error, 'get ETH price');
    }
}

export async function getTokenBalance(
    tokenContract: ethers.Contract,
    address: string
): Promise<bigint> {
    try {
        const balance = await tokenContract.balanceOf(address);
        return balance;
    } catch (error) {
        throw handleError(error, 'get token balance');
    }
}

export async function approveToken(
    tokenContract: ethers.Contract,
    spenderAddress: string,
    amount: bigint
): Promise<void> {
    try {
        const tx = await tokenContract.approve(spenderAddress, amount);
        await tx.wait();
    } catch (error) {
        throw handleError(error, 'approve token');
    }
}

export async function setupTokenContracts(
    provider: ethers.Provider,
    config: Config
): Promise<{
    bondTokenContract: ethers.Contract;
    leverageTokenContract: ethers.Contract;
}> {
    try {
        const bondTokenContract = new ethers.Contract(
            config.bondEthAddress,
            [
                'function initialize(string memory name, string memory symbol, address minter, address governance)',
                'function hasRole(bytes32 role, address account) view returns (bool)',
                'function paused() view returns (bool)',
                'function balanceOf(address account) view returns (uint256)',
                'function updateIndexedUserAssets(address user, uint256 balance)',
                'function getIndexedUserAmount(address user, uint256 balance, uint256 period) view returns (uint256)',
                'function userAssets(address user) view returns (uint256 lastUpdatedPeriod, uint256 indexedAmountShares)',
                'function globalPool() view returns (uint256 currentPeriod, uint256 sharesPerToken, tuple(uint256 period, uint256 amount, uint256 sharesPerToken)[] previousPoolAmounts)'
            ],
            provider
        );

        const leverageTokenContract = new ethers.Contract(
            config.levEthAddress,
            [
                'function initialize(string memory name, string memory symbol, address minter, address governance)',
                'function hasRole(bytes32 role, address account) view returns (bool)',
                'function paused() view returns (bool)',
                'function balanceOf(address account) view returns (uint256)'
            ],
            provider
        );

        return {
            bondTokenContract,
            leverageTokenContract
        };
    } catch (error) {
        throw handleError(error, 'setup token contracts');
    }
} 