# Plaza Pool Operations

## Core Concepts

### State Variables
- `PRECISION`: 1,000,000 (1e6) - Base unit for fixed-point calculations
- `COLLATERAL_THRESHOLD`: 1,200,000 (120%) - Threshold for price calculation changes
- `BOND_TARGET_PRICE`: 100 USDC - Fixed price for bondETH when collateral is healthy
- `COMMON_DECIMALS`: 18 - Standard decimals for ETH-based tokens

### Collateral Level
The core metric that determines token pricing:
```
Collateral Level = (ETH tokens × ETH price) ÷ (bondETH supply × 100)
```

## Token Creation

### BondETH Creation
Price determination:
- If Collateral Level > 120%:
  - Fixed price at 100 USDC per bondETH
- If Collateral Level ≤ 120%:
  - Price = 80% of vault's collateral value per bondETH

### LevETH Creation
Price determination:
- If Collateral Level > 120%:
  - Price = (Total Value - (100 × bondETH supply)) ÷ levETH supply
- If Collateral Level ≤ 120%:
  - Price = 20% of vault's collateral value per levETH

## Creation Process

1. **State Validation**
   - Check if pool is paused
   - Verify collateral level
   - Check user balances

2. **Price Calculation**
   - Get current ETH price from oracle
   - Calculate collateral level
   - Determine token price based on conditions

3. **Creation Simulation**
   - Use `simulateCreate()` to get exact output amount
   - Apply slippage tolerance
   - Verify against min/max creation limits

4. **Execution**
   - Approve token spending
   - Set reasonable deadline (e.g., 1 hour)
   - Execute creation with proper parameters

## Important Functions

### View Functions
```solidity
function getReserve() view returns (uint256)
function getBondSupply() view returns (uint256)
function getLeverageSupply() view returns (uint256)
function getCollateralLevel() view returns (uint256)
function simulateCreate(TokenType, uint256) view returns (uint256)
```

### State-Changing Functions
```solidity
function create(
    TokenType tokenType,
    uint256 depositAmount,
    uint256 minAmount,
    uint256 deadline,
    address onBehalfOf
) returns (uint256)
```

## Error Handling

1. **Pre-creation Checks**
   - Insufficient balance
   - Below minimum creation amount
   - Above maximum creation amount
   - Pool paused
   - Low collateral level

2. **Slippage Protection**
   - Calculate minimum output with slippage tolerance
   - Set reasonable deadline
   - Verify simulated output

3. **Transaction Monitoring**
   - Track transaction status
   - Log important parameters
   - Handle revert cases 