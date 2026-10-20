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
await page.waitForSelector('.tp-side');
ok(true, 'Tipptraining öffnet über Version-Tipp');

const shot = (n) => process.env.E2E_SHOTS ? page.screenshot({ path: process.env.E2E_SHOTS + n + '.png' }) : null;
await shot('home');
await page.locator('.tp-side').getByRole('button', { name: /Schreibschule/ }).click();
await page.getByText('Kurze Sätze').first().click();
const target = await page.locator('.tp-text').innerText();
await page.keyboard.type(target.replace(/↵/g, '\n').replace(/·/g, ' '), { delay: 4 });
await page.waitForSelector('.tp-result');
ok(await page.locator('.tp-big').innerText().then((t) => /WPM/.test(t)), 'Stufe abgeschlossen mit Ergebnis');
await shot('result');

for (const name of ['Training', 'Spiele', 'Schwachstellen', 'Eigene Texte', 'Lernkarten', 'Diktat', 'Statistik', 'Einstellungen']) {
  await page.locator('.tp-side').getByRole('button', { name: new RegExp(name) }).click();
  await page.waitForTimeout(300);
  ok(await page.locator('.tp-main h2').first().isVisible(), `Seite ${name}`);
  if (name === 'Einstellungen') await shot('settings');
}
await page.locator('.tp-side').getByRole('button', { name: /Training/ }).click();
await page.getByRole('button', { name: 'Los geht’s' }).click();
await page.keyboard.type((await page.locator('.tp-text').innerText()).slice(0, 6), { delay: 10 });
ok(await page.locator('.tp-text span.ok').count() > 0, 'Sprint nimmt Eingabe an');

// Spiele: Rennen
await page.locator('.tp-side').getByRole('button', { name: /Spiele/ }).click();
await page.getByText('Tipp-Grand-Prix').click();
await shot('race-setup');
await page.getByRole('button', { name: 'Rennen starten' }).click();
await page.waitForTimeout(4200);
const rt = await page.locator('.wu-pad .tp-text').innerText();
await page.keyboard.type(rt.slice(0, 40), { delay: 15 });
await shot('race');
await page.keyboard.type(rt.slice(40), { delay: 4 });
await page.waitForSelector('.wu-result', { timeout: 15000 });
ok(true, 'Rennen beendet, Ergebnis sichtbar');
await shot('race-result');
await page.getByRole('button', { name: 'Zum Menü' }).click();
await page.getByRole('button', { name: '‹ Spiele' }).click();
await page.getByText('Wort-Regen').click();
await page.locator('.wu-go').click();
await page.waitForTimeout(1500);
ok(await page.locator('.tp-fall').count() > 0, 'Wort-Regen: Wörter fallen');
await shot('rain');

// Abschreiben
await page.locator('.tp-side').getByRole('button', { name: /Training/ }).click();
await page.getByRole('button', { name: 'Abschreiben', exact: true }).click();
await page.getByRole('button', { name: 'Abschreiben starten' }).click();
const ref = (await page.locator('.cp-ref').innerText()).replace(/\s+/g, ' ').trim();
await page.locator('.cp-input').fill(ref.slice(0, Math.floor(ref.length / 2)));
await page.getByRole('button', { name: /Fertig/ }).click();
await page.waitForSelector('.cp-diff');
ok(true, 'Abschreiben: Vergleich sichtbar');
await shot('copy-diff');

// weitere Spiele
const games = [['Monster-Duell', 'Kampf beginnen', '.wu-monster'], ['Raketenstart', 'Countdown starten', '.wu-rocket'], ['Fließband', 'Band starten', '.wu-tile-c'], ['Merk-Modus', 'Los', '.wu-memcard']];
for (const [name, btn, sel] of games) {
  await page.locator('.tp-side').getByRole('button', { name: /Statistik/ }).click();
  await page.locator('.tp-side').getByRole('button', { name: /Spiele/ }).click();
  await page.getByText(name, { exact: true }).first().click();
  await page.getByRole('button', { name: btn, exact: true }).click();
  await page.waitForTimeout(900);
  ok(await page.locator(sel).count() > 0, `Spiel ${name} läuft`);
  await shot('game-' + name.replace(/\W/g, ''));
}
ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
await browser.close();
process.exit(bad ? 1 : 0);
