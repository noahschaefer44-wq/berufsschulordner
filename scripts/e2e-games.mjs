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
games.sudoku = async () => {
  await page.locator('.gh-box[data-game="sudoku"]').click();
  await page.waitForSelector('.sd-panel');
  await page.getByRole('radio', { name: 'Leicht' }).click();
  await page.getByRole('button', { name: 'Rätsel setzen' }).click();
  await page.waitForSelector('.sd-board');
  await page.waitForTimeout(500);
  const empty = page.locator('.sd-cell:not(.given)').first();
  await empty.click();
  await page.keyboard.press('Digit5');
  await page.getByRole('button', { name: /Hinweis/ }).click();
  await shot('sudoku');
  ok((await page.locator('.sd-hint').count()) > 0, 'Sudoku: Hinweis');
  await page.getByRole('button', { name: 'Neu', exact: true }).click();
  await page.locator('.sd-variants button', { hasText: 'Killer' }).click();
  await page.getByRole('radio', { name: 'Mittel' }).click();
  await page.getByRole('button', { name: 'Rätsel setzen' }).click();
  await page.waitForSelector('.sd-cage', { state: 'attached' });
  await shot('sudoku-killer');
  ok(true, 'Sudoku: Killer mit Käfigen');
  await page.getByRole('button', { name: 'Schule' }).click();
  await page.locator('.sd-lessons button').first().click();
  await page.waitForSelector('.sd-task');
  await shot('sudoku-schule');
  ok(true, 'Sudoku: Schule mit Übung');
  await page.getByRole('button', { name: 'Zum Rätsel' }).click();
  await page.getByRole('button', { name: 'Eigenes' }).click();
  await page.waitForSelector('.sd-board');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  ok(true, 'Sudoku: Editor');
};
games.bild = async () => {
  await page.locator('.gh-box[data-game="bild"]').click();
  await page.waitForSelector('.bd-menu');
  await page.getByRole('tab', { name: 'Zufall' }).click();
  await page.getByRole('button', { name: '10×10' }).click();
  await page.getByRole('button', { name: 'Würfeln' }).click();
  await page.waitForSelector('.bd-canvas');
  const cv = page.locator('.bd-canvas');
  const b = await cv.boundingBox();
  await page.mouse.click(b.x + b.width - 40, b.y + b.height - 40);
  await page.getByRole('button', { name: /Hinweis/ }).click();
  await page.waitForTimeout(300);
  await shot('bild');
  ok((await page.locator('.bd-hint').count()) > 0, 'Bildrätsel: Hinweis');
  await page.getByRole('button', { name: 'Lösungsweg' }).click();
  await page.waitForSelector('.bd-hint');
  await page.getByRole('button', { name: 'Automatisch' }).click();
  await page.waitForTimeout(1200);
  await shot('bild-logik');
  ok(true, 'Bildrätsel: Lösungsweg');
  await page.getByRole('button', { name: 'Zeichnen' }).click();
  await page.waitForSelector('.bd-editor');
  const eb = await page.locator('.bd-canvas').boundingBox();
  await page.mouse.move(eb.x + 40, eb.y + 40); await page.mouse.down(); await page.mouse.move(eb.x + 200, eb.y + 40); await page.mouse.up();
  await page.mouse.move(eb.x + 40, eb.y + 100); await page.mouse.down(); await page.mouse.move(eb.x + 160, eb.y + 160); await page.mouse.up();
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await shot('bild-editor');
  ok((await page.locator('.bd-hint').count()) > 0, 'Bildrätsel: Editor prüft');
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
