import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const base = 'http://localhost:5173';
const out = '.impeccable/review/after';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// sign-in page
await page.goto(base + '/admin');
await page.screenshot({ path: out + '/after-signin.png', fullPage: true });

// log in
await page.fill('#password', 'localtest');
await page.click('button[type=submit]');
await page.waitForURL('**/admin/dashboard**');

// queue: pending tab (default), then everything with a search
await page.goto(base + '/admin/dashboard?status=pending');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: out + '/after-queue-pending.png', fullPage: true });

await page.goto(base + '/admin/dashboard?status=all&q=python');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: out + '/after-queue-search.png', fullPage: true });

// editor, with the delete drawer open
const first = await page.$eval('.admin-row__link', (a) => a.getAttribute('href'));
await page.goto(base + first);
await page.waitForLoadState('networkidle');
await page.locator('.admin-delete summary').click();
await page.screenshot({ path: out + '/after-editor.png', fullPage: true });

// sticky behaviour: scroll the editor, the bar and the rail should stay put
await page.mouse.wheel(0, 600);
await page.waitForTimeout(400);
await page.screenshot({ path: out + '/after-editor-scrolled.png' });
await page.mouse.wheel(0, -600);

// mobile: queue and editor
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + '/admin/dashboard?status=all');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: out + '/after-queue-mobile.png', fullPage: true });

await page.goto(base + first);
await page.waitForLoadState('networkidle');
await page.screenshot({ path: out + '/after-editor-mobile.png', fullPage: true });

await browser.close();
console.log('done');
