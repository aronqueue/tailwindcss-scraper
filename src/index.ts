import { HttpScraper } from './http-scraper';
import inquirer from 'inquirer';
import chalk from 'chalk';

(async () => {
    const scraper = new HttpScraper();
    await scraper.init();

    // Login first to get available products
    const loggedIn = await scraper.login();
    if (!loggedIn) {
        console.error(chalk.red('Login failed. Exiting.'));
        return;
    }

    // Fetch available products
    const availableProducts = await scraper.getProducts();
    if (availableProducts.length === 0) {
        console.error(chalk.red('No products found. Please check your subscription or login details.'));
        return;
    }

    const answers = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'products',
            message: 'Which products do you want to scrape?',
            choices: availableProducts.map(p => ({ name: p.name, value: p })),
            validate: (input) => input.length > 0 ? true : 'You must select at least one product.'
        },
        {
            type: 'checkbox',
            name: 'frameworks',
            message: 'Which frameworks do you want to download?',
            choices: [
                { name: 'React', value: 'react' },
                { name: 'Vue', value: 'vue' },
                { name: 'HTML', value: 'html' }
            ],
            validate: (input) => input.length > 0 ? true : 'You must select at least one framework.'
        }
    ]);

    const frameworks = answers.frameworks;
    const selectedProducts = answers.products;

    for (const fw of frameworks) {
        console.log(chalk.magenta.bold(`\n--- Starting scrape for ${fw.toUpperCase()} ---`));
        await scraper.setFramework(fw);
        
        for (const product of selectedProducts) {
            await scraper.scrapeProduct(product.url, product.name);
        }
    }
    
    console.log(chalk.green.bold('\nAll tasks completed!'));
})();
