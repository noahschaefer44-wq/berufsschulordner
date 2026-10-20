// Test der Notizen-Startseite und des Tipptrainings (geheimer Zugang: 5× auf „Version“).
// Voraussetzung: `npx vite preview --port 4173` läuft. Lokal mit Edge: E2E_CHANNEL=msedge node scripts/e2e-typing.mjs
import { chromium } from 'playwright';

const BASE = process.env.E2E_URL ?? 'http://localhost:4173/';
const browser = await chromium.launch(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {});
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK    ' : 'FEHLER'} ${m}`); if (!c) bad++; };

// ── Notizen ──
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Testordner' : undefined));
await page.goto(BASE);
await page.getByLabel('Neu').click();
await page.getByRole('menuitem', { name: 'Neuer Ordner' }).click();
await page.getByText('Testordner').first().click();
await page.getByLabel('Neu').click();
await page.getByRole('menuitem', { name: 'Neue Notiz' }).click();
await page.getByLabel('Text').fill('# Test\nHallo Welt, das ist ein Test. Zweiter Satz folgt.');
await page.reload();
ok(await page.getByText('Testordner').count() > 0, 'Ordner bleibt nach Neuladen');

// ── Tipptraining ──
await page.getByLabel('Einstellungen').click();
for (let i = 0; i < 5; i++) await page.getByText('Version').click();
await page.waitForSelector('text=Tipptraining');
ok(true, 'Tipptraining öffnet über Version-Tipp');

await page.getByRole('button', { name: /Schreibschule/ }).first().click();
await page.getByText('Grundreihe 1/5').click();
const target = await page.locator('.tp-text').innerText();
await page.keyboard.type(target.replace(/↵/g, '\n').replace(/·/g, ' '), { delay: 5 });
await page.waitForSelector('.tp-result');
ok(await page.locator('.tp-big').innerText().then((t) => /WPM/.test(t)), 'Lektion abgeschlossen mit Ergebnis');
await page.screenshot({ path: process.env.E2E_SHOT ?? 'tp-result.png' });

for (const name of ['Training', 'Schwachstellen', 'Eigene Texte', 'Lernkarten', 'Arcade', 'Diktat', 'Statistik', 'Einstellungen']) {
  await page.locator('.tp-nav').getByRole('button', { name: new RegExp(name) }).click();
  await page.waitForTimeout(300);
  ok(await page.locator('.tp-main h2').first().isVisible(), `Seite ${name}`);
}
await page.locator('.tp-nav').getByRole('button', { name: /Training/ }).click();
await page.getByRole('button', { name: 'Los geht’s' }).click();
await page.keyboard.type((await page.locator('.tp-text').innerText()).slice(0, 6), { delay: 10 });
ok(await page.locator('.tp-text span.ok').count() > 0, 'Sprint nimmt Eingabe an');
await page.locator('.tp-nav').getByRole('button', { name: /Arcade/ }).click();
await page.getByRole('button', { name: 'Start', exact: true }).click();
await page.waitForTimeout(1500);
ok(await page.locator('.tp-fall').count() > 0, 'Arcade: Wörter fallen');

ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
await browser.close();
process.exit(bad ? 1 : 0);
