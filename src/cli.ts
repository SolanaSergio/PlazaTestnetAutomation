import { Command } from 'commander';
import chalk from 'chalk';
import PlazaBot from './plazaBot.js';
import { Config } from './core/types.js';
import * as dotenv from 'dotenv';
import ora from 'ora';
import readline from 'readline';
import { ethers } from 'ethers';
import { POOL_ABI, ORACLE_ABI, TOKEN_ABI } from './abis.js';
import { config, PROTOCOL_PARAMS } from './config.js';

dotenv.config();

let bot: PlazaBot | null = null;
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Validate environment variables
function validateEnv() {
    const required = ['PRIVATE_KEY', 'RPC_URL'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.error(chalk.red('Error: Missing required environment variables:'));
        missing.forEach(key => console.error(chalk.yellow(`- ${key}`)));
        process.exit(1);
    }
}

// Initialize bot with existing config
async function initializeBot() {
    if (!bot) {
        validateEnv();
        bot = new PlazaBot(config);
    }
    return bot;
}

async function testConnection() {
    const spinner = ora('Testing RPC connection...').start();
    try {
        const b = await initializeBot();
        await b.testConnection();
        spinner.succeed('RPC connection successful');
        return true;
    } catch (error) {
        spinner.fail('RPC connection failed');
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
        return false;
    }
}

async function verifyWallet() {
    const spinner = ora('Verifying wallet...').start();
    try {
        const b = await initializeBot();
        const info = await b.getWalletInfo();
        spinner.succeed('Wallet verification successful');
        console.log(chalk.cyan('\nWallet Information:'));
        console.log(`Address: ${info.address}`);
        console.log(`ETH Balance: ${ethers.formatEther(info.balance)} ETH`);
        return true;
    } catch (error) {
        spinner.fail('Wallet verification failed');
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
        return false;
    }
}

async function verifyContracts() {
    const spinner = ora('Verifying contracts...').start();
    try {
        const b = await initializeBot();
        await b.checkStatus();
        spinner.succeed('Contract verification successful');
        return true;
    } catch (error) {
        spinner.fail('Contract verification failed');
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
        return false;
    }
}

async function showMainMenu() {
    console.clear();
    console.log(chalk.blue('\n=== Plaza Finance Bot Menu ===\n'));
    console.log('1. Quick Start Bot');
    console.log('2. System Check');
    console.log('3. View Status');
    console.log('4. Single Operations');
    console.log('5. Exit');
    
    const answer = await askQuestion('\nSelect an option (1-5): ');
    
    switch (answer) {
        case '1':
            await quickStartBot();
            break;
        case '2':
            await systemCheckMenu();
            break;
        case '3':
            await viewStatus();
            break;
        case '4':
            await operationsMenu();
            break;
        case '5':
            console.log(chalk.yellow('\nExiting Plaza Finance Bot...'));
            rl.close();
            process.exit(0);
        default:
            console.log(chalk.red('\nInvalid option. Please try again.'));
            await pressEnterToContinue();
            await showMainMenu();
    }
}

async function quickStartBot() {
    console.clear();
    console.log(chalk.blue('\n=== Quick Start Bot ===\n'));
    
    // Run system checks first
    console.log(chalk.yellow('Running system checks...\n'));
    const checksOk = await runAllChecks();
    
    if (!checksOk) {
        console.log(chalk.red('\nSystem checks failed. Please fix the issues before starting the bot.'));
        await pressEnterToContinue();
        return await showMainMenu();
    }
    
    console.log(chalk.green('\nSystem checks passed. Starting bot in live mode...\n'));
    
    try {
        const b = await initializeBot();
        await b.start({ dryRun: false, interval: 300 });
    } catch (error) {
        console.error(chalk.red('Error starting bot:'), error instanceof Error ? error.message : 'Unknown error');
    }
    
    await pressEnterToContinue();
    await showMainMenu();
}

async function operationsMenu() {
    console.clear();
    console.log(chalk.blue('\n=== Single Operations Menu ===\n'));
    console.log('1. Execute Single Swap');
    console.log('2. Claim Available Coupons');
    console.log('3. Back to Main Menu');
    
    const answer = await askQuestion('\nSelect an option (1-3): ');
    
    try {
        const b = await initializeBot();
        switch (answer) {
            case '1':
                await swapMenu();
                break;
            case '2':
                const claimInfo = await b.getClaimableInfo();
                console.log(chalk.cyan('\nClaimable Information:'));
                console.log(`Unclaimed Epochs: ${claimInfo.epochs.length ? claimInfo.epochs.join(', ') : 'None'}`);
                console.log(`Claimable Amount: ${ethers.formatUnits(claimInfo.amount, 6)} USDC`);
                
                if (claimInfo.epochs.length > 0) {
                    const shouldClaim = await askQuestion('\nWould you like to claim now? (y/n): ');
                    if (shouldClaim.toLowerCase() === 'y') {
                        await b.claimCoupons();
                    }
                }
                break;
            case '3':
                await showMainMenu();
                return;
            default:
                console.log(chalk.red('\nInvalid option. Please try again.'));
        }
    } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    }
    
    await pressEnterToContinue();
    await operationsMenu();
}

async function swapMenu() {
    console.clear();
    console.log(chalk.blue('\n=== Swap Menu ===\n'));
    console.log('1. USDC → levETH');
    console.log('2. USDC → bondETH');
    console.log('3. Back');
    
    const answer = await askQuestion('\nSelect an option (1-3): ');
    
    try {
        const b = await initializeBot();
        switch (answer) {
            case '1':
                const amount1 = await askQuestion('Enter USDC amount: ');
                await b.swapUsdcForLevEth(BigInt(Math.floor(parseFloat(amount1) * 1e6)));
                break;
            case '2':
                const amount2 = await askQuestion('Enter USDC amount: ');
                await b.swapUsdcForBondEth(BigInt(Math.floor(parseFloat(amount2) * 1e6)));
                break;
            case '3':
                return;
            default:
                console.log(chalk.red('\nInvalid option. Please try again.'));
        }
    } catch (error) {
        console.error(chalk.red('Error executing swap:'), error instanceof Error ? error.message : 'Unknown error');
    }
    
    await pressEnterToContinue();
    await swapMenu();
}

async function systemCheckMenu() {
    console.clear();
    console.log(chalk.blue('\n=== System Check Menu ===\n'));
    console.log('1. Test RPC Connection');
    console.log('2. Verify Wallet');
    console.log('3. Verify Contracts');
    console.log('4. Run All Checks');
    console.log('5. Back to Main Menu');
    
    const answer = await askQuestion('\nSelect an option (1-5): ');
    
    switch (answer) {
        case '1':
            await testConnection();
            break;
        case '2':
            await verifyWallet();
            break;
        case '3':
            await verifyContracts();
            break;
        case '4':
            await runAllChecks();
            break;
        case '5':
            await showMainMenu();
            return;
        default:
            console.log(chalk.red('\nInvalid option. Please try again.'));
    }
    
    await pressEnterToContinue();
    await systemCheckMenu();
}

async function runAllChecks() {
    console.log(chalk.blue('\nRunning all system checks...\n'));
    
    const rpcOk = await testConnection();
    const walletOk = await verifyWallet();
    const contractsOk = await verifyContracts();
    
    console.log(chalk.blue('\nSystem Check Summary:'));
    console.log(`RPC Connection: ${rpcOk ? chalk.green('✓') : chalk.red('✗')}`);
    console.log(`Wallet Verification: ${walletOk ? chalk.green('✓') : chalk.red('✗')}`);
    console.log(`Contract Verification: ${contractsOk ? chalk.green('✓') : chalk.red('✗')}`);

    return rpcOk && walletOk && contractsOk;
}

async function viewStatus() {
    console.clear();
    console.log(chalk.blue('\n=== Current Status ===\n'));
    try {
        const b = await initializeBot();
        await b.checkStatus();
    } catch (error) {
        console.error(chalk.red('Error getting status:'), error instanceof Error ? error.message : 'Unknown error');
    }
    await pressEnterToContinue();
    await showMainMenu();
}

function askQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

async function pressEnterToContinue() {
    console.log(chalk.yellow('\nPress Enter to continue...'));
    await askQuestion('');
}

// Start the application
async function main() {
    try {
        await showMainMenu();
    } catch (error) {
        console.error(chalk.red('Fatal error:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}

main();