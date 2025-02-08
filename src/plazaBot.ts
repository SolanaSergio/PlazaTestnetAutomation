import { ethers } from 'ethers';
import chalk from 'chalk';
import ora from 'ora';
import { Config, TokenPrices, VaultState, TransactionStatus, EthersError } from './core/types.js';
import { POOL_ABI, DISTRIBUTOR_ABI, TOKEN_ABI, ORACLE_ABI, SWAP_ROUTER_ABI } from './abis.js';
import { getVaultState, formatVaultStatus, validateVaultHealth } from './operations/vaultOperations.js';
import { swapUsdcForLevEth, swapUsdcForBondEth, swapWstethForLevEth } from './operations/swapOperations.js';
import { redeemBondEth, redeemLevEth } from './operations/redeemOperations.js';
import { claimCoupons, getClaimableInfo } from './operations/couponOperations.js';
import { handleError, randomDelay } from './utils/helpers.js';

class PlazaBot {
    private provider: ethers.Provider;
    private wallet: ethers.Wallet;
    private config: Config;
    private poolContract: ethers.Contract;
    private distributorContract: ethers.Contract;
    private oracleContract: ethers.Contract;
    private wstethContract: ethers.Contract;
    private bondTokenContract: ethers.Contract;
    private leverageTokenContract: ethers.Contract;
    private usdcContract: ethers.Contract;
    private swapRouterContract: ethers.Contract;
    private txHistory: TransactionStatus[] = [];

    constructor(config: Config) {
        this.config = config;
        this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
        this.wallet = new ethers.Wallet(config.privateKey, this.provider);
        
        // Initialize contracts with correct ABIs
        this.poolContract = new ethers.Contract(config.plazaPoolAddress, POOL_ABI, this.wallet);
        this.distributorContract = new ethers.Contract(config.distributorAddress, DISTRIBUTOR_ABI, this.wallet);
        this.oracleContract = new ethers.Contract(config.oracleAddress, ORACLE_ABI, this.wallet);
        this.wstethContract = new ethers.Contract(config.wstethAddress, TOKEN_ABI, this.wallet);
        this.bondTokenContract = new ethers.Contract(config.bondEthAddress, TOKEN_ABI, this.wallet);
        this.leverageTokenContract = new ethers.Contract(config.levEthAddress, TOKEN_ABI, this.wallet);
        this.usdcContract = new ethers.Contract(config.usdcAddress, TOKEN_ABI, this.wallet);
        this.swapRouterContract = new ethers.Contract(config.swapRouterAddress, SWAP_ROUTER_ABI, this.wallet);
    }

    async getVaultState(): Promise<VaultState> {
        try {
            // Try to get ETH price from oracle
            let ethPrice: bigint;
            try {
                const { answer } = await this.oracleContract.latestRoundData();
                ethPrice = BigInt(answer.toString());
            } catch (oracleError) {
                // Fallback: Use getTokenPrice from pool contract
                console.log('Oracle error, using pool price as fallback');
                ethPrice = await this.poolContract.getTokenPrice(0); // 0 for bondETH type
            }

            return await getVaultState(
                this.poolContract,
                ethPrice
            );
        } catch (error) {
            throw handleError(error, 'get vault state');
        }
    }

    async checkStatus(): Promise<void> {
        try {
            // Get vault state
            const vaultState = await this.getVaultState();

            // Get token balances
            const [bondEthBalance, levEthBalance] = await Promise.all([
                this.bondTokenContract.balanceOf(this.wallet.address),
                this.leverageTokenContract.balanceOf(this.wallet.address)
            ]);

            // Validate vault health
            validateVaultHealth(vaultState);

            // Format and display status
            const status = await formatVaultStatus(vaultState);
            console.log(status);

            // Add wallet balances
            console.log('\nWallet Balances:');
            console.log(`bondETH: ${ethers.formatEther(bondEthBalance)} bondETH`);
            console.log(`levETH: ${ethers.formatEther(levEthBalance)} levETH`);

            // Show recent transactions
            if (this.txHistory.length > 0) {
                console.log(chalk.cyan('\nRecent Transactions:'));
                this.txHistory.slice(-5).forEach(tx => {
                    const status = tx.success ? chalk.green('✓') : chalk.red('✗');
                    console.log(`${status} ${tx.type}: ${tx.hash} (${tx.timestamp.toLocaleString()})`);
                });
            }
        } catch (error) {
            throw handleError(error, 'check status');
        }
    }

    async swapUsdcForLevEth(usdcAmount: bigint): Promise<TransactionStatus> {
        return await swapUsdcForLevEth(
            this.poolContract,
            this.usdcContract,
            this.swapRouterContract,
            this.oracleContract,
            this.bondTokenContract,
            this.leverageTokenContract,
            usdcAmount,
            this.wallet.address,
            this.config.slippageTolerance,
            this.config.gasLimits.CREATE,
            this.txHistory
        );
    }

    async swapUsdcForBondEth(usdcAmount: bigint): Promise<TransactionStatus> {
        return await swapUsdcForBondEth(
            this.poolContract,
            this.usdcContract,
            this.swapRouterContract,
            this.oracleContract,
            this.bondTokenContract,
            this.leverageTokenContract,
            usdcAmount,
            this.wallet.address,
            this.config.slippageTolerance,
            this.config.gasLimits.CREATE,
            this.txHistory
        );
    }

    async swapWstethForLevEth(amountIn: bigint): Promise<TransactionStatus> {
        return await swapWstethForLevEth(
            this.poolContract,
            this.wstethContract,
            this.oracleContract,
            this.bondTokenContract,
            this.leverageTokenContract,
            amountIn,
            this.wallet.address,
            this.config.slippageTolerance,
            this.config.gasLimits.CREATE,
            this.txHistory
        );
    }

    async redeemBondEth(amount: bigint): Promise<TransactionStatus> {
        return await redeemBondEth(
            this.poolContract,
            this.bondTokenContract,
            this.oracleContract,
            this.leverageTokenContract,
            amount,
            this.wallet.address,
            this.config.slippageTolerance,
            this.config.gasLimits.REDEEM,
            this.txHistory
        );
    }

    async redeemLevEth(amount: bigint): Promise<TransactionStatus> {
        return await redeemLevEth(
            this.poolContract,
            this.leverageTokenContract,
            this.oracleContract,
            this.bondTokenContract,
            amount,
            this.wallet.address,
            this.config.slippageTolerance,
            this.config.gasLimits.REDEEM,
            this.txHistory
        );
    }

    async claimCoupons(): Promise<TransactionStatus> {
        return await claimCoupons(
            this.distributorContract,
            this.wallet.address,
            this.config.gasLimits.APPROVE,
            this.txHistory
        );
    }

    async start(options: { dryRun?: boolean; interval?: number } = {}) {
        const spinner = ora('Initializing bot...').start();
        
        try {
            // Check ETH balance
            const ethBalance = await this.provider.getBalance(this.wallet.address);
            const minEthRequired = ethers.parseEther('0.01'); // Minimum 0.01 ETH for operations
            
            if (ethBalance < minEthRequired) {
                spinner.fail(`Insufficient ETH balance. Minimum required: 0.01 ETH, Current: ${ethers.formatEther(ethBalance)} ETH`);
                return;
            }
            
            // Check initial status
            await this.checkStatus();
            spinner.succeed('Bot initialized successfully');

            console.log(chalk.green('\nStarting automated operations...'));
            console.log(chalk.blue('Press Ctrl+C to stop the bot'));
            
            while (true) {
                try {
                    // Recheck ETH balance before each operation
                    const currentEthBalance = await this.provider.getBalance(this.wallet.address);
                    if (currentEthBalance < minEthRequired) {
                        console.error(chalk.red('ETH balance too low for operations'));
                        await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
                        continue;
                    }

                    // Get current gas price
                    const gasPrice = await this.provider.getFeeData();
                    if (gasPrice.gasPrice && gasPrice.gasPrice > ethers.parseUnits('100', 'gwei')) {
                        console.log(chalk.yellow('Gas price too high, waiting...'));
                        await new Promise(resolve => setTimeout(resolve, 60000));
                        continue;
                    }

                    // Randomly select and execute an operation
                    const random = Math.random();
                    if (random < 0.7) { // 70% chance for random swap
                        await this.simulateRandomSwap(options.dryRun);
                    } else if (random < 0.9) { // 20% chance for redemption
                        await this.simulateRedemption(options.dryRun);
                    } else { // 10% chance for coupon claim
                        await this.claimCoupons();
                    }

                    // Update status after each operation
                    await this.checkStatus();

                } catch (error) {
                    console.error(chalk.red('Error in operation:'), error instanceof Error ? error.message : 'Unknown error');
                }

                // Wait for the specified interval or default to 5 minutes
                const interval = (options.interval || 300) * 1000;
                console.log(chalk.blue(`Waiting ${interval/1000} seconds before next operation...`));
                await new Promise(resolve => setTimeout(resolve, interval));
            }
        } catch (error) {
            spinner.fail('Bot initialization failed');
            console.error(chalk.red('Fatal error:'), error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }

    public async simulateCreation(): Promise<void> {
        await randomDelay();
        
        try {
            // Get current balances
            const usdcBalance = await this.usdcContract.balanceOf(this.wallet.address);
            const wstethBalance = await this.wstethContract.balanceOf(this.wallet.address);

            // Get vault state for pricing and limits
            const vaultState = await this.getVaultState();
            if (vaultState.collateralLevel < 1.0) {
                console.log(chalk.yellow('Skipping creation - collateral level too low'));
                return;
            }

            // Randomly choose between USDC and wstETH for creation
            const useUsdc = Math.random() < 0.7; // 70% chance to use USDC
            
            if (useUsdc && usdcBalance >= ethers.parseUnits('10', 6)) {
                // Randomly choose between bondETH and levETH
                const createBond = Math.random() < 0.5;
                if (createBond) {
                    await this.swapUsdcForBondEth(usdcBalance);
                } else {
                    await this.swapUsdcForLevEth(usdcBalance);
                }
            } else if (wstethBalance >= ethers.parseEther('0.01')) {
                await this.swapWstethForLevEth(wstethBalance);
            } else {
                console.log(chalk.yellow('Insufficient balance for creation'));
            }
        } catch (error) {
            console.error(chalk.red('Error in creation:'), error instanceof Error ? error.message : 'Unknown error');
        }
    }

    public async simulateRandomSwap(dryRun?: boolean): Promise<void> {
        await randomDelay();
        
        try {
            // Get current balances
            const usdcBalance = await this.usdcContract.balanceOf(this.wallet.address);
            const wstethBalance = await this.wstethContract.balanceOf(this.wallet.address);
            const bondBalance = await this.bondTokenContract.balanceOf(this.wallet.address);
            const levBalance = await this.leverageTokenContract.balanceOf(this.wallet.address);

            // Get vault state for pricing and limits
            const vaultState = await this.getVaultState();
            if (vaultState.collateralLevel < 1.0) {
                console.log(chalk.yellow('Skipping swaps - collateral level too low'));
                return;
            }

            // Select random operation based on available balances
            const operations = [];
            if (usdcBalance >= ethers.parseUnits('10', 6)) operations.push('USDC_TO_LEV');
            if (wstethBalance >= ethers.parseEther('0.01')) operations.push('WSTETH_TO_LEV');
            if (bondBalance >= ethers.parseEther('0.01')) operations.push('REDEEM_BOND');
            if (levBalance >= ethers.parseEther('0.01')) operations.push('REDEEM_LEV');

            if (operations.length === 0) {
                console.log(chalk.yellow('No eligible operations available'));
                return;
            }

            const operation = operations[Math.floor(Math.random() * operations.length)];
            if (dryRun) {
                console.log(chalk.yellow(`Would execute ${operation}`));
                return;
            }

            switch (operation) {
                case 'USDC_TO_LEV':
                    await this.swapUsdcForLevEth(usdcBalance);
                    break;
                case 'WSTETH_TO_LEV':
                    await this.swapWstethForLevEth(wstethBalance);
                    break;
                case 'REDEEM_BOND':
                    await this.redeemBondEth(bondBalance);
                    break;
                case 'REDEEM_LEV':
                    await this.redeemLevEth(levBalance);
                    break;
            }
        } catch (error) {
            console.error(chalk.red('Error in random swap:'), error instanceof Error ? error.message : 'Unknown error');
        }
    }

    public async simulateRedemption(dryRun?: boolean): Promise<void> {
        await randomDelay();
        
        try {
            const vaultState = await this.getVaultState();
            const random = Math.random();
            
            if (random < 0.5) {
                const bondBalance = await this.bondTokenContract.balanceOf(this.wallet.address);
                if (bondBalance > 0) {
                    if (dryRun) {
                        console.log(chalk.yellow(`Would redeem ${ethers.formatEther(bondBalance)} bondETH`));
                        return;
                    }
                    await this.redeemBondEth(bondBalance);
                }
            } else {
                const levBalance = await this.leverageTokenContract.balanceOf(this.wallet.address);
                if (levBalance > 0) {
                    if (dryRun) {
                        console.log(chalk.yellow(`Would redeem ${ethers.formatEther(levBalance)} levETH`));
                        return;
                    }
                    await this.redeemLevEth(levBalance);
                }
            }
        } catch (error) {
            console.error(chalk.red('Error in redemption:'), error instanceof Error ? error.message : 'Unknown error');
        }
    }

    public async simulateCouponClaim(): Promise<void> {
        await randomDelay();
        
        try {
            const claimInfo = await this.getClaimableInfo();
            if (claimInfo.amount > 0) {
                console.log(chalk.green(`Claiming ${ethers.formatUnits(claimInfo.amount, 6)} USDC in coupons`));
                await this.claimCoupons();
            } else {
                console.log(chalk.yellow('No coupons available to claim'));
            }
        } catch (error) {
            console.error(chalk.red('Error in coupon claim:'), error instanceof Error ? error.message : 'Unknown error');
        }
    }

    // Public methods for CLI access
    public async getWalletInfo() {
        return {
            address: this.wallet.address,
            balance: await this.provider.getBalance(this.wallet.address)
        };
    }

    public async testConnection() {
        return await this.provider.getNetwork();
    }

    public async getClaimableInfo() {
        return await getClaimableInfo(this.distributorContract, this.wallet.address);
    }
}

export default PlazaBot; 