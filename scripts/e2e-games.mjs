// Test der Spielhalle (geheimer Zugang: Einstellungen → dreimal auf „Speicher“ tippen).
// Voraussetzung: `npx vite preview --port 4173` läuft. Lokal mit Edge: E2E_CHANNEL=msedge node scripts/e2e-games.mjs
import { chromium } from 'playwright';

const BASE = process.env.E2E_URL ?? 'http://localhost:4173/';
const SHOTS = process.env.E2E_SHOTS ?? '';
const browser = await chromium.launch(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK    ' : 'FEHLER'} ${m}`); if (!c) bad++; };
const shot = (n) => (SHOTS ? page.screenshot({ path: SHOTS + n + '.png' }) : null);

await page.goto(BASE);
await page.getByLabel('Einstellungen').click();
for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /^Speicher/ }).click();
await page.waitForSelector('.gh-shelf');
ok(true, 'Spielhalle öffnet über Speicher-Tipp');
await shot('hall');

const only = (process.env.E2E_ONLY ?? '').split(',').filter(Boolean);
const games = {
  async minen() {
    await page.locator('.gh-box[data-game="minen"]').click();
    await page.waitForSelector('.mn-canvas');
    const cv = page.locator('.mn-canvas');
    const box = await cv.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(800);
    await shot('minen');
    ok((await page.locator('.mn-status').innerText()).length > 0, 'Minenfeld: Spiel läuft');
    await page.locator('.mn-menu > button', { hasText: 'Hilfe' }).click();
    await page.getByRole('menuitem', { name: /Lernen/ }).click();
    await page.waitForSelector('.mn-lessons');
    await shot('minen-lernen');
    ok(true, 'Minenfeld: Lernstationen');
    await page.getByRole('button', { name: 'Zum Spiel' }).click();
    const menu = async (m, item) => { await page.locator('.mn-menu > button', { hasText: m }).click(); await page.getByRole('menuitem', { name: item }).click(); };
    await menu('Brett', /Sechseck/);
    const cv2 = page.locator('.mn-canvas');
    const b2 = await cv2.boundingBox();
    await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2);
    await page.waitForTimeout(1500);
    await page.mouse.click(b2.x + 40, b2.y + 40, { button: 'right' });
    await shot('minen-hex');
    await menu('Brett', /Torus/);
    await menu('Modus', /Training/);
    const b3 = await page.locator('.mn-canvas').boundingBox();
    await page.mouse.click(b3.x + b3.width / 2, b3.y + b3.height / 2);
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /Wahrscheinlichkeit/ }).click();
    await page.getByRole('button', { name: /Hinweis/ }).click();
    await shot('minen-training');
    ok((await page.locator('.mn-hint').count()) > 0, 'Minenfeld: Hinweis im Training');
  },
};
for (const [name, fn] of Object.entries(games)) {
  if (only.length && !only.includes(name)) continue;
  try { await fn(); } catch (e) { ok(false, `${name}: ${e.message.split('\n')[0]}`); }
  await page.goto(BASE);
  await page.getByLabel('Einstellungen').click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /^Speicher/ }).click();
  await page.waitForSelector('.gh-shelf');
}
ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
await browser.close();
process.exit(bad ? 1 : 0);
