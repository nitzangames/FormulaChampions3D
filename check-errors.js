const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const errors = [];
  const logs = [];

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
    else logs.push(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    errors.push(err.toString());
  });

  try {
    await page.goto('http://localhost:8084', { waitUntil: 'networkidle0', timeout: 10000 });
    // Wait a couple seconds for the game to initialize
    await new Promise(r => setTimeout(r, 3000));

    if (errors.length === 0) {
      console.log('NO ERRORS - Game loaded successfully');
    } else {
      console.log('ERRORS FOUND:');
      errors.forEach(e => console.log('  ' + e));
    }

    if (logs.length > 0) {
      console.log('\nConsole output:');
      logs.forEach(l => console.log('  ' + l));
    }
  } catch (e) {
    console.log('FAILED TO LOAD:', e.message);
  }

  await browser.close();
})();
