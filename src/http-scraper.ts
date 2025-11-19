import axios, { AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as dotenv from 'dotenv';
import chalk from 'chalk';
import ora from 'ora';

dotenv.config();

interface ComponentData {
    name: string;
    category: string;
    html?: string;
    react?: string;
    vue?: string;
}

export class HttpScraper {
    private client: AxiosInstance;
    private jar: CookieJar;
    private baseUrl = 'https://tailwindcss.com/plus'; // New base URL
    private email = process.env.TAILWINDUI_EMAIL;
    private password = process.env.TAILWINDUI_PASSWORD;
    private outputDir = process.env.SCRAPER_BASE_DIR || './tailwindui_library';
    private sessionFile = 'session.json';
    private currentFramework = 'react';
    private xsrfToken = '';
    private inertiaVersion = '';

    constructor() {
        this.jar = new CookieJar();
        this.client = wrapper(axios.create({
            baseURL: this.baseUrl,
            jar: this.jar,
            withCredentials: true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        }));
    }

    async init() {
        // Load session if exists
        if (await fs.pathExists(this.sessionFile)) {
            try {
                const cookies = await fs.readJSON(this.sessionFile);
                cookies.forEach((cookie: any) => {
                    this.jar.setCookieSync(cookie, this.baseUrl);
                });
                console.log(chalk.green('✔ Loaded session from file.'));
            } catch (e) {
                console.warn(chalk.yellow('⚠ Failed to load session:'), e);
            }
        }
    }

    async saveSession() {
        try {
            const cookies = await this.jar.getCookies(this.baseUrl);
            await fs.writeJSON(this.sessionFile, cookies.map(c => c.toString()), { spaces: 2 });
            
        } catch (e) {
            console.warn(chalk.yellow('⚠ Failed to save session:'), e);
        }
    }

    async login(): Promise<boolean> {
        const spinner = ora('Attempting login...').start();
        
        try {
            // 1. Get CSRF token and Inertia Version
            const loginPage = await this.client.get('/login');
            const $ = cheerio.load(loginPage.data);
            
            // Check for meta tag
            let xsrfToken = $('meta[name="csrf-token"]').attr('content');
            
            // Get Inertia Version
            let inertiaVersion = loginPage.headers['x-inertia-version'];
            if (!inertiaVersion) {
                const dataPage = $('#app').attr('data-page');
                if (dataPage) {
                    const json = JSON.parse(this.htmlEntitiesDecode(dataPage));
                    inertiaVersion = json.version;
                }
            }
            // console.log('Inertia Version:', inertiaVersion);
            if (inertiaVersion) {
                this.inertiaVersion = Array.isArray(inertiaVersion) ? inertiaVersion[0] : inertiaVersion;
            }

            if (!xsrfToken) {
                // Fallback to cookie
                const cookies = this.jar.getCookiesSync(this.baseUrl);
                const cookie = cookies.find(c => c.key === 'XSRF-TOKEN');
                if (cookie) {
                    xsrfToken = decodeURIComponent(cookie.value);
                }
            }

            if (!xsrfToken) {
                spinner.fail(chalk.red('Could not get XSRF-TOKEN'));
                return false;
            }
            this.xsrfToken = xsrfToken;

            // 2. Post credentials
            const headers: any = {
                'X-XSRF-TOKEN': xsrfToken,
                'X-Inertia': 'true',
                'Referer': 'https://tailwindcss.com/plus/login',
                'Origin': 'https://tailwindcss.com'
            };
            
            if (inertiaVersion) {
                headers['X-Inertia-Version'] = inertiaVersion;
            }

            const response = await this.client.post('/login', {
                email: this.email,
                password: this.password,
                remember: true
            }, {
                headers: headers
            });

            if (response.status === 200 || response.status === 302) {
                spinner.succeed(chalk.green('Login successful!'));
                await this.saveSession();
                return true;
            }
            
        } catch (error: any) {
            spinner.fail(chalk.red(`Login failed: ${error.message}`));
            if (error.response) {
                console.error(chalk.red('Status:'), error.response.status);
                console.error(chalk.red('Data:'), error.response.data);
            }
        }
        return false;
    }

    async scrapeCategory(url: string) {
        const targetUrl = this.getUrlWithFramework(url);
        const spinner = ora(`Scraping category: ${chalk.dim(targetUrl)}`).start();
        try {
            const response = await this.client.get(targetUrl);
            const html = response.data;
            
            // Parse Inertia data
            const $ = cheerio.load(html);
            const dataPage = $('#app').attr('data-page');
            
            if (!dataPage) {
                spinner.fail(chalk.red('No Inertia data found on page.'));
                return;
            }

            let json;
            try {
                json = JSON.parse(dataPage);
            } catch (e) {
                try {
                    json = JSON.parse(this.htmlEntitiesDecode(dataPage));
                } catch (e2: any) {
                    spinner.fail(chalk.red(`JSON parse failed: ${e2.message}`));
                    return;
                }
            }
            
            // Inspect props to find components
            // Usually in json.props.components or similar
            // Let's try to find where components are stored.
            // Based on typical Inertia apps, it might be in `props.components` or `props.sections`.
            
            // Inspect props to find components
            // Structure seems to be json.props.subcategory.components
            
            let components = [];
            if (json.props.subcategory && json.props.subcategory.components) {
                components = json.props.subcategory.components;
            } else if (json.props.components) {
                components = json.props.components;
            }

            if (Array.isArray(components) && components.length > 0) {
                // Check if we need to switch framework
                const firstComp = components[0];
                if (firstComp.snippet && firstComp.snippet.name !== this.currentFramework) {
                    
                    // Try to switch
                    const switched = await this.forceSwitchFramework(firstComp.uuid);
                    if (switched) {
                        // Re-fetch
                        const retryResponse = await this.client.get(targetUrl);
                        const retryHtml = retryResponse.data;
                        const retry$ = cheerio.load(retryHtml);
                        const retryDataPage = retry$('#app').attr('data-page');
                        if (retryDataPage) {
                            json = JSON.parse(this.htmlEntitiesDecode(retryDataPage));
                            if (json.props.subcategory && json.props.subcategory.components) {
                                components = json.props.subcategory.components;
                            } else if (json.props.components) {
                                components = json.props.components;
                            }
                        }
                    } else {
                        spinner.warn(chalk.red('Failed to switch framework. Proceeding with wrong framework...'));
                    }
                }

                spinner.succeed(chalk.green(`Found ${components.length} components.`));
                
                // Extract category info from URL
                const urlObj = new URL(url);
                const parts = urlObj.pathname.split('/');
                const uiBlocksIndex = parts.indexOf('ui-blocks');
                let category = 'unknown';
                let subCategory = 'unknown';
                
                if (uiBlocksIndex !== -1 && parts.length > uiBlocksIndex + 2) {
                    const relativePath = parts.slice(uiBlocksIndex + 1);
                    category = relativePath[0];
                    subCategory = relativePath.slice(1).join('/');
                }

                for (const comp of components) {
                    await this.processComponent(comp, category, subCategory);
                }
            } else {
                spinner.warn(chalk.yellow('Could not find components array in props.'));
                // console.log('Props keys:', Object.keys(json.props));
            }

        } catch (error: any) {
            spinner.fail(chalk.red(`Failed to scrape category ${url}: ${error.message}`));
        }
    }

    async getProducts(): Promise<{name: string, url: string}[]> {
        const spinner = ora('Fetching available products...').start();
        // Start with Marketing to discover everything
        const startUrl = this.getUrlWithFramework('https://tailwindcss.com/plus/ui-blocks/marketing');
        
        try {
            const response = await this.client.get(startUrl);
            const $ = cheerio.load(response.data);
            const dataPage = $('#app').attr('data-page');
            if (!dataPage) {
                spinner.fail('Failed to load product data.');
                return [];
            }
            
            const json = JSON.parse(this.htmlEntitiesDecode(dataPage));
            const products = json.props.products || [];
            spinner.succeed(`Found ${products.length} products available.`);
            return products;
        } catch (e: any) {
            spinner.fail(`Error fetching products: ${e.message}`);
            return [];
        }
    }

    async scrapeAll(skipLogin = false) {
        console.log(chalk.blue.bold('Starting full scrape...'));
        if (!skipLogin && !await this.login()) {
            console.error(chalk.red('Login failed. Aborting.'));
            return;
        }

        const products = await this.getProducts();

        for (const product of products) {
            await this.scrapeProduct(product.url, product.name);
        }
    }

    async scrapeProduct(url: string, name: string) {
        const targetUrl = this.getUrlWithFramework(url);
        console.log(chalk.magenta.bold(`\nScraping Product: ${name} (${targetUrl})`));
        try {
            const response = await this.client.get(targetUrl);
            const $ = cheerio.load(response.data);
            const dataPage = $('#app').attr('data-page');
            if (!dataPage) return;
            
            const json = JSON.parse(this.htmlEntitiesDecode(dataPage));
            
            const categories = json.props.product?.categories || json.props.categories || [];
            console.log(chalk.cyan(`Found ${categories.length} categories in ${name}.`));

            for (const category of categories) {
                console.log(chalk.blue(`  Category: ${category.name}`));
                if (category.subcategories) {
                    for (const sub of category.subcategories) {
                        console.log(chalk.gray(`    Subcategory: ${sub.name} (${sub.url})`));
                        await this.scrapeCategory(sub.url);
                        // Polite delay
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }

        } catch (e: any) {
            console.error(chalk.red(`Error scraping product ${name}: ${e.message}`));
        }
    }

    private async processComponent(comp: any, category: string, subCategory: string) {
        const name = comp.name ? comp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : comp.id;
        
        const dir = path.join(this.outputDir, `${category}/${subCategory}`, name);
        await fs.ensureDir(dir);

        const data: ComponentData = {
            name: comp.name || comp.id,
            category: `${category}/${subCategory}`,
        };

        if (comp.snippet) {
            const lang = comp.snippet.name; // 'vue', 'react', 'html'
            const code = comp.snippet.code;
            
            if (lang === 'html') {
                data.html = code;
                await fs.writeFile(path.join(dir, 'html.html'), code);
                console.log(chalk.gray(`  - Saved HTML: ${comp.name}`));
            } else if (lang === 'react') {
                data.react = code;
                await fs.writeFile(path.join(dir, 'react.jsx'), code);
                console.log(chalk.green(`  - Saved React: ${comp.name}`));
            } else if (lang === 'vue') {
                data.vue = code;
                await fs.writeFile(path.join(dir, 'vue.vue'), code);
                console.log(chalk.yellow(`  - Saved Vue: ${comp.name}`));
            }
        }
    }

    private htmlEntitiesDecode(str: string) {
        // Do not use he.decode() here because Cheerio already decodes the attribute.
        // If we decode again, we might break JSON strings that contain HTML entities (like &quot; inside a string).
        // e.g. {"html": "<div title='&quot;'>"} -> {"html": "<div title='"'>"} -> Broken JSON.
        
        // Sanitize control characters that might break JSON parsing
        return str.replace(/[\u0000-\u001F]/g, (char) => {
            switch (char) {
                case '\b': return '\\b';
                case '\f': return '\\f';
                case '\n': return '\\n';
                case '\r': return '\\r';
                case '\t': return '\\t';
                default: return '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');
            }
        });
    }

    async setFramework(framework: string) {
        this.currentFramework = framework;
        const cookies = [
            { key: 'preferred_framework', value: framework },
            { key: 'framework', value: framework },
            { key: 'tailwindui_framework', value: framework }
        ];
        
        for (const cookie of cookies) {
            // Set on specific path
            await this.jar.setCookie(`${cookie.key}=${cookie.value}`, this.baseUrl);
            // Set on root domain just in case
            await this.jar.setCookie(`${cookie.key}=${cookie.value}`, 'https://tailwindcss.com');
        }
        console.log(chalk.cyan(`Set framework cookies to ${framework}`));
    }

    private getUrlWithFramework(url: string): string {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}framework=${this.currentFramework}`;
    }

    private async forceSwitchFramework(uuid: string): Promise<boolean> {
        try {
            // Refresh XSRF token from cookies just in case
            const cookies = this.jar.getCookiesSync(this.baseUrl);
            const cookie = cookies.find(c => c.key === 'XSRF-TOKEN');
            if (cookie) {
                this.xsrfToken = decodeURIComponent(cookie.value);
            }

            // Map 'react' to 'react-v4' if needed, or just use the framework name
            // Based on test-framework-switch.ts, 'react-v4' worked. 
            // Let's try to map it.
            let snippetLang = this.currentFramework;
            if (this.currentFramework === 'react') snippetLang = 'react-v4';
            // For vue, it might be 'vue' or 'vue-v3'. Let's try 'vue' first as per debug_datapage.json
            
            const response = await this.client.put('/ui-blocks/language', {
                uuid: uuid,
                snippet_lang: snippetLang
            }, {
                headers: {
                    'X-XSRF-TOKEN': this.xsrfToken,
                    'X-Inertia': 'true',
                    'X-Inertia-Version': this.inertiaVersion,
                    'Content-Type': 'application/json'
                }
            });

            return response.status === 200;
        } catch (e: any) {
            console.error(chalk.red(`Force switch failed: ${e.message}`));
            return false;
        }
    }
}
