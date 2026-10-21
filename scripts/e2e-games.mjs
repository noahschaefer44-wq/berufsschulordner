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
const games = {};
games.block = async () => {
  await page.locator('.gh-box[data-game="block"]').click();
  await page.waitForSelector('.bk-modes');
  await page.locator('.bk-mode', { hasText: 'Sprint' }).click();
  await page.waitForSelector('.bk-board');
  await page.waitForTimeout(3000);
  for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Space'); await page.waitForTimeout(40); }
  await shot('block');
  const pps = await page.locator('.bk-stats').innerText();
  ok(pps.includes("Steine"), 'Blockfall: Sprint läuft');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Beenden' }).first().click();
  await page.locator('.bk-mode', { hasText: 'Duell' }).click();
  await page.waitForSelector('.bk-opp');
  await page.waitForTimeout(3500);
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(60); }
  await shot('block-duell');
  ok(true, 'Blockfall: Duell läuft');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Beenden' }).first().click();
  await page.getByRole('button', { name: 'Rätsel' }).click();
  await page.locator('.bk-mode').first().click();
  await page.waitForSelector('.bk-board');
  await page.waitForTimeout(3000);
  await shot('block-puzzle');
  ok(true, 'Blockfall: Rätsel');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Beenden' }).first().click();
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await page.waitForSelector('.bk-settings');
  ok(true, 'Blockfall: Einstellungen');
};
games.gammon = async () => {
  await page.locator('.gh-box[data-game="gammon"]').click();
  await page.waitForSelector('.gm-setup');
  await shot('gammon-menu');
  await page.locator('.gm-setup .gm-seg button[title="Anfänger"]').click();
  await page.getByRole('button', { name: 'Spiel beginnen' }).click();
  await page.waitForSelector('.bgv');
  // einige Züge mit Tipp spielen lassen
  let turns = 0;
  for (let i = 0; i < 60 && turns < 4; i++) {
    await page.waitForTimeout(900);
    const roll = page.getByRole('button', { name: /^Würfeln/ });
    if (await roll.count()) { await roll.first().click(); await page.waitForTimeout(500); }
    const tip = page.getByRole('button', { name: /^Tipp/, exact: false }).filter({ hasNotText: 'spielen' });
    if (await tip.count() && await tip.first().isEnabled()) {
      await tip.first().click();
      const play = page.getByRole('button', { name: 'Tipp spielen' });
      try { await play.waitFor({ timeout: 15000 }); await play.click(); turns++; } catch { /* kein Zug */ }
    }
  }
  await shot('gammon-play');
  ok(turns >= 2, 'Backgammon: Züge mit Tipp gespielt (' + turns + ')');
  const log = await page.locator('.gm-log li').count();
  ok(log >= 3, 'Backgammon: Zugliste hat ' + log + ' Einträge');
  await page.getByRole('button', { name: 'Aufgeben' }).click();
  await page.waitForSelector('.gm-modal');
  ok(true, 'Backgammon: Spielende');
  await page.getByRole('button', { name: 'Menü' }).last().click();
  await page.locator('.gm-tile', { hasText: 'Lernen' }).click();
  await page.locator('.gm-lessons .gm-card').nth(1).click();
  await page.getByRole('button', { name: /Weiter/ }).click();
  await page.waitForSelector('.gm-task');
  await shot('gammon-lesson');
  ok(true, 'Backgammon: Lektion mit Aufgabe');
  await page.getByRole('button', { name: /Lektionen/ }).click();
  await page.getByRole('button', { name: /Menü/ }).first().click();
  await page.locator('.gm-tile', { hasText: 'Eröffnungsbuch' }).click();
  await page.waitForSelector('.gm-rolls');
  await shot('gammon-openings');
  ok(true, 'Backgammon: Eröffnungsbuch');
  await page.getByRole('button', { name: /Menü/ }).first().click();
  await page.locator('.gm-tile', { hasText: 'Zug-Rätsel' }).click();
  await page.waitForSelector('.gm-task', { timeout: 30000 });
  await shot('gammon-puzzle');
  ok(true, 'Backgammon: Zug-Rätsel');
};
games.karten = async () => {
  await page.locator('.gh-box[data-game="karten"]').click();
  await page.waitForSelector('.kt-variants');
  for (const [v, sel] of [['FreeCell', '.kb .kcw'], ['Spider', '.kb .kcw'], ['Pyramide', '.kb.pyr .kcw'], ['TriPeaks', '.kb.pyr .kcw'], ['Klondike', '.kb .kcw']]) {
    if (!(await page.locator('.kt-variants').count())) await page.getByRole('button', { name: 'Neu', exact: true }).click();
    await page.locator('.kt-variants button', { hasText: v }).first().click();
    if (v === 'Klondike') await page.locator('.kt-opts label').first().locator('input').uncheck();
    await page.getByRole('button', { name: 'Zufälliges Spiel' }).click();
    await page.waitForSelector(sel, { timeout: 20000 });
    await page.waitForTimeout(500);
    await shot('karten-' + v);
    ok((await page.locator(sel).count()) > 10, 'Patience: ' + v + ' startet');
  }
  // Klondike: Vorrat ziehen und Hinweis
  await page.locator('.ks.stock').first().click({ force: true });
  await page.getByRole('button', { name: /Hinweis/ }).click();
  await page.waitForTimeout(1500);
  ok(true, 'Patience: Hinweis und Ziehen');
};
games.go = async () => {
  await page.locator('.gh-box[data-game="go"]').click();
  await page.waitForSelector('.go-setup');
  await shot('go-menu');
  // 9x9 gegen Anfänger-KI
  await page.locator('.go-seg button', { hasText: /^9$/ }).first().click();
  await page.locator('.go-seg button[title="Anfänger"]').click();
  await page.getByRole('button', { name: 'Partie beginnen' }).click();
  await page.waitForSelector('.go-svg');
  const box = await page.locator('.go-boardwrap .go-svg').boundingBox();
  const at = (x, y) => [box.x + box.width * ((34 + x * 40) / (8 * 40 + 68)), box.y + box.height * ((34 + y * 40) / (8 * 40 + 68))];
  let [px, py] = at(4, 4);
  await page.mouse.click(px, py);
  await page.waitForTimeout(1500);
  const stones = await page.locator('.go-svg circle[fill^="url"]').count();
  ok(stones >= 2, 'Go: Zug und KI-Antwort (' + stones + ' Steine)');
  [px, py] = at(2, 6);
  await page.mouse.click(px, py);
  await page.waitForTimeout(1500);
  await shot('go-play');
  await page.getByRole('button', { name: /Schätzung/ }).click();
  await page.waitForSelector('.go-wr', { timeout: 15000 });
  await shot('go-estimate');
  ok(true, 'Go: Schätzung');
  await page.getByRole('button', { name: /^Passen/ }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Aufgeben' }).click();
  await page.waitForSelector('.go-over');
  ok(true, 'Go: Aufgeben beendet Partie');
  await page.getByRole('button', { name: 'Menü' }).last().click();
  // Kurze Partie bis zum Zählen
  await page.locator('.go-seg button', { hasText: /^5$/ }).first().click();
  await page.getByRole('button', { name: 'Partie beginnen' }).click();
  await page.waitForSelector('.go-svg');
  for (let i = 0; i < 40 && !(await page.locator('.go-score').count()); i++) {
    await page.getByRole('button', { name: /^Passen/ }).click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(700);
  }
  await page.waitForSelector('.go-score', { timeout: 10000 });
  await page.waitForTimeout(1500);
  await shot('go-score');
  await page.getByRole('button', { name: 'Ergebnis bestätigen' }).click();
  await page.waitForSelector('.go-over');
  ok((await page.locator('.go-over p').innerText()).includes('gewinnt'), 'Go: Zählen und Ergebnis');
  await page.getByRole('button', { name: 'Menü' }).last().click();
  // Lektion
  await page.locator('.go-tile', { hasText: 'Lernen' }).click();
  await page.locator('.go-lessons .go-card').nth(2).click();
  await page.getByRole('button', { name: /Weiter/ }).click();
  await page.waitForSelector('.go-problem');
  await shot('go-lesson');
  ok(true, 'Go: Lektion mit Aufgabe');
  await page.getByRole('button', { name: 'Lösung zeigen' }).click();
  await page.waitForSelector('.go-pulse');
  ok(true, 'Go: Lösung wird angezeigt');
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
