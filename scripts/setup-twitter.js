const puppeteer = require('puppeteer');
const fs = require('fs');

async function setupCofferTwitter() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Navigate to X.com
  await page.goto('https://x.com/i/flow/login', { waitUntil: 'networkidle2' });

  // Wait for username input
  await page.waitForSelector('input[name="text"]', { timeout: 10000 });
  await page.type('input[name="text"]', 'CofferDotFun', { delay: 100 });
  await page.click('div[role="button"]:has-text("Next")');

  // Wait for password input
  await page.waitForSelector('input[name="password"]', { timeout: 10000 });
  await page.type('input[name="password"]', 'Coffer_Fun_Dooms_123', { delay: 100 });
  await page.click('div[role="button"]:has-text("Log in")');

  // Wait for login to complete
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  // Navigate to profile settings
  await page.goto('https://x.com/settings/profile');

  // Upload profile picture
  const pfpInput = await page.$('input[type="file"][accept*="image"]');
  await pfpInput.uploadFile('C:/tech/vault/brand/coffer-pfp.png');

  // Upload banner
  const bannerInput = await page.$('input[type="file"][accept*="image"]');
  await bannerInput.uploadFile('C:/tech/vault/brand/coffer-banner.png');

  // Set bio
  await page.type('textarea[data-testid="profileDescription"]', 'Trader vaults on Solana. Back the best traders. They can never run. 70/30 split. On-chain record. coffer.fun');

  // Set website
  await page.type('input[data-testid="profileLocation"]', 'https://coffer.fun');

  // Save
  await page.click('div[role="button"]:has-text("Save")');

  console.log('Profile setup complete!');
  await browser.close();
}

setupCofferTwitter().catch(console.error);
