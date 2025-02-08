import PlazaBot from './plazaBot.js';
import { config } from './config.js';

async function main() {
    const bot = new PlazaBot(config);

    // Run continuous simulation
    while (true) {
        try {
            const random = Math.random();
            
            if (random < 0.4) {
                await bot.simulateCreation();
            } else if (random < 0.8) {
                await bot.simulateRedemption();
            } else {
                await bot.simulateCouponClaim();
            }
        } catch (error) {
            console.error('Error in simulation:', error);
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
    }
}

main().catch(console.error); 