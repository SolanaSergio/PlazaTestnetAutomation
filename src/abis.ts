export const SWAP_ROUTER_ABI = [
    "function swapCreate(address tokenIn, uint256 amountIn, address tokenOut, uint256 minAmountOut, address recipient, uint256 deadline) external returns (uint256)",
    "function swapRedeem(address pool, address outputToken, uint8 tokenType, uint256 amount, uint256 minAmount) external returns (uint256)",
    "function getAmountOut(address tokenIn, uint256 amountIn, address tokenOut) external view returns (uint256)",
    "function getAmountIn(address tokenIn, address tokenOut, uint256 amountOut) external view returns (uint256)",
    "function getReserves(address tokenA, address tokenB) external view returns (uint256 reserveA, uint256 reserveB)",
    "function factory() external view returns (address)",
    "function WETH() external view returns (address)"
] as const;

export const POOL_ABI = [
    // State variables
    "function reserveToken() view returns (address)",
    "function bondToken() view returns (address)",
    "function lToken() view returns (address)",
    "function couponToken() view returns (address)",
    "function poolFactory() view returns (address)",
    "function feeBeneficiary() view returns (address)",
    "function distributionPeriod() view returns (uint256)",
    "function lastDistribution() view returns (uint256)",
    "function reserve() view returns (uint256)",
    "function bondSupply() view returns (uint256)",
    "function levSupply() view returns (uint256)",
    "function collateralLevel() view returns (uint256)",
    
    // Create functions
    "function create(uint8 tokenType, uint256 depositAmount, uint256 minAmount) returns (uint256)",
    "function create(uint8 tokenType, uint256 depositAmount, uint256 minAmount, uint256 deadline, address onBehalfOf) returns (uint256)",
    
    // Redeem functions
    "function redeem(uint8 tokenType, uint256 amount, uint256 minAmount) returns (uint256)",
    "function redeem(uint8 tokenType, uint256 amount, uint256 minAmount, uint256 deadline, address onBehalfOf) returns (uint256)",
    
    // View functions
    "function getMinCreationAmount() view returns (uint256)",
    "function getMaxCreationAmount() view returns (uint256)",
    "function getTokenPrice(uint8 tokenType) view returns (uint256)",
    "function getFeeAmount() view returns (uint256)",
    "function paused() view returns (bool)",
    
    // Events
    "event TokensCreated(address indexed caller, address indexed onBehalfOf, uint8 tokenType, uint256 depositedAmount, uint256 mintedAmount)",
    "event TokensRedeemed(address indexed caller, address indexed onBehalfOf, uint8 tokenType, uint256 depositedAmount, uint256 redeemedAmount)",
    "event SharesPerTokenChanged(uint256 sharesPerToken)",
    "event Distributed(uint256 amount, address distributor)",
    "event AuctionPeriodChanged(uint256 oldPeriod, uint256 newPeriod)",
    "event DistributionRollOver(uint256 period, uint256 sharesPerToken)",
    "event DistributionPeriodChanged(uint256 oldPeriod, uint256 newPeriod)"
] as const;

export const DISTRIBUTOR_ABI = [
    // View functions
    "function getCurrentEpoch() view returns (uint256)",
    "function getEpochStart(uint256 epochId) view returns (uint256)",
    "function getEpochEnd(uint256 epochId) view returns (uint256)",
    "function getEpochReward(uint256 epochId) view returns (uint256)",
    "function getClaimableAmount(address account) view returns (uint256)",
    "function isClaimed(uint256 epochId, address account) view returns (bool)",
    "function epochDuration() view returns (uint256)",
    "function lastDistributionTime() view returns (uint256)",
    
    // State-changing functions
    "function claim() external returns (uint256)",
    "function claimMany(uint256[] calldata epochIds) external returns (uint256)",
    
    // Events
    "event RewardClaimed(address indexed user, uint256 indexed epochId, uint256 amount)",
    "event RewardDistributed(uint256 indexed epochId, uint256 amount)"
];

export const TOKEN_ABI = [
    // View functions
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    
    // State-changing functions
    "function transfer(address recipient, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transferFrom(address sender, address recipient, uint256 amount) returns (bool)",
    
    // Role management
    "function MINTER_ROLE() view returns (bytes32)",
    "function GOV_ROLE() view returns (bytes32)",
    "function DISTRIBUTOR_ROLE() view returns (bytes32)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
    
    // Pausable functions
    "function paused() view returns (bool)",
    
    // Events
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
    "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
    "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
    "event Paused(address account)",
    "event Unpaused(address account)"
];

export const BOND_TOKEN_ABI = [
    ...TOKEN_ABI,
    // Additional BondToken specific functions
    "function globalPool() view returns (tuple(uint256 currentPeriod, uint256 sharesPerToken, tuple(uint256 period, uint256 amount, uint256 sharesPerToken)[] previousPoolAmounts))",
    "function userAssets(address) view returns (tuple(uint256 lastUpdatedPeriod, uint256 indexedAmountShares))",
    "function SHARES_DECIMALS() view returns (uint8)",
    "function getIndexedUserAmount(address user, uint256 balance, uint256 period) view returns (uint256)",
    "function getPreviousPoolAmounts() view returns (tuple(uint256 period, uint256 amount, uint256 sharesPerToken)[])",
    
    // Events
    "event IncreasedAssetPeriod(uint256 currentPeriod, uint256 sharesPerToken)",
    "event UpdatedUserAssets(address user, uint256 lastUpdatedPeriod, uint256 indexedAmountShares)"
];

export const LEVERAGE_TOKEN_ABI = [
    ...TOKEN_ABI,
    // LeverageToken has no additional functions beyond the base token functionality
];

export const ORACLE_ABI = [
    "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    "function decimals() view returns (uint8)",
    "function description() view returns (string)",
    "function version() view returns (uint256)",
    "function getRoundData(uint80 _roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    "function poolAddress() view returns (address)",
    "function owner() view returns (address)"
] as const; 