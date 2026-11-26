// Unit tests for game logic: node tests/unit.js
globalThis.LF = require('../js/data.js');
const Game = require('../js/game.js');
const assert = require('assert');
let n = 0, failed = 0;
function t(name, fn) { n++; try { fn(); console.log('ok  ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } }
const mk = (o) => { const g = new Game(Object.assign({ zone: LF.ZONES[0], noFx: true, hooks: {} }, o || {})); g.view = { w: 1100, h: 700 }; return g; };

t('all weapons have 6 levels of stats (5 + evolved)', () => {
  for (const k in LF.WEAPONS) { const w = LF.WEAPONS[k]; assert.ok(w.dmg.length >= 6, k); assert.ok(w.desc.length >= 5, k); assert.ok(LF.PASSIVES[w.pair], k + ' pair'); }
});
t('texts use no letter yo and no long dashes', () => {
  const src = require('fs').readFileSync(__dirname + '/../js/data.js', 'utf8') + require('fs').readFileSync(__dirname + '/../index.html', 'utf8') + require('fs').readFileSync(__dirname + '/../js/main.js', 'utf8') + ['onepager.html', 'aiprocess.html', 'CHANGELOG.md', 'README.md'].map(f => require('fs').readFileSync(__dirname + '/../' + f, 'utf8')).join('');
  assert.ok(!/[ёЁ]/.test(src), 'yo found'); assert.ok(!/[—–]/.test(src), 'dash found');
});
t('zones get harder', () => { for (let i = 1; i < 5; i++) { assert.ok(LF.ZONES[i].hpEnd > LF.ZONES[i - 1].hpEnd); assert.ok(LF.ZONES[i].dmg >= LF.ZONES[i - 1].dmg); } });
t('meta cost grows with rank', () => { for (const k of LF.META_KEYS) for (let r = 1; r < LF.META[k].max; r++) assert.ok(LF.metaCost(k, r) > LF.metaCost(k, r - 1), k); });
t('lantern burst needs 50 light and spends it', () => {
  const g = mk(); g.player.light = 49; assert.strictEqual(g.lanternBurst(), false);
  g.player.light = 80; assert.strictEqual(g.lanternBurst(), true); assert.strictEqual(g.player.light, 30);
});
t('burst stuns nearby enemies and clears bullets', () => {
  const g = mk();
  for (let i = 0; i < 5; i++) { g.update(1 / 30); }
  g.ebullets.push({ x: g.player.x + 40, y: g.player.y, vx: 0, vy: 0, r: 5, dmg: 5, life: 5 });
  g.player.light = 100; g.lanternBurst();
  for (let i = 0; i < 12; i++) g.update(1 / 30);
  assert.strictEqual(g.ebullets.filter(b => Math.hypot(b.x - g.player.x, b.y - g.player.y) < 60).length, 0);
});
t('light regenerates over time and caps at 100', () => {
  const g = mk(); g.player.light = 0; for (let i = 0; i < 300; i++) g.update(1 / 30); assert.ok(g.player.light > 5 && g.player.light <= 100);
});
t('light radius shrinks with low light', () => { const g = mk(); g.player.light = 0; const a = g.lightFrac(); g.player.light = 100; assert.ok(g.lightFrac() > a); });
t('shrine blessing applies a buff that expires and restores stats', () => {
  const g = mk(); const base = g.stats.dmg; g.rand = () => 0; // first key = fury
  g.blessing(); assert.ok(g.player.buffs.fury > 0); assert.ok(g.stats.dmg > base);
  for (let i = 0; i < 30 * 16; i++) { g.updateBuffs(1 / 30); }
  assert.ok(!g.player.buffs.fury); assert.ok(Math.abs(g.stats.dmg - base) < 1e-9);
});
t('shrines are not pulled by magnet and expire', () => {
  const g = mk(); g.gems.push({ kind: 'shrine', x: g.player.x + 3000, y: g.player.y, age: 0, v: 0 });
  g.collect({ kind: 'magnet' });
  const s = g.gems.find(x => x.kind === 'shrine'); assert.ok(!s.pull);
  s.age = 60; g.updateGems && g.updateGems(1 / 30); assert.ok(!g.gems.some(x => x.kind === 'shrine'));
});
t('easy difficulty lowers enemy damage and embers', () => {
  const e = mk({ difficulty: 'easy' }), nrm = mk(); assert.ok(e.mod.enemyDmg < nrm.mod.enemyDmg); assert.ok(e.mod.embers < nrm.mod.embers);
});
t('unknown difficulty falls back to normal', () => { const g = mk({ difficulty: 'nightmare' }); assert.strictEqual(g.mod.enemyHp, 1); });
t('daily challenge mods are applied', () => { const g = mk({ mods: { enemyCount: 1.4, xp: 1.4 } }); assert.strictEqual(g.mod.enemyCount, 1.4); assert.strictEqual(g.mod.xp, 1.4); });
t('seeded rng is deterministic', () => { const a = LF.mulberry32(42), b = LF.mulberry32(42); for (let i = 0; i < 100; i++) assert.strictEqual(a(), b()); const v = LF.mulberry32(1)(); assert.ok(v >= 0 && v < 1); });
t('weapon stat preview shows a change', () => { const s = mk().weaponDelta('spark', 2); assert.ok(/→/.test(s), s); assert.ok(mk().weaponDelta('spark', 1).length > 0); });
t('level-up cards carry a stat preview', () => {
  const g = mk(); const cs = g.buildChoices(4, false); assert.ok(cs.some(c => c.kind === 'weapon' && c.stat));
});
t('result has damage split, bursts and difficulty', () => {
  const g = mk(); for (let i = 0; i < 30 * 20; i++) { if (g.phase === 'levelup') g.choose(0); g.update(1 / 30); }
  const r = g.result(); assert.ok(r.dmgBy && Object.keys(r.dmgBy).length > 0); assert.strictEqual(typeof r.bursts, 'number'); assert.strictEqual(r.difficulty, 'normal');
});
t('a full simulated zone 0 run ends in under 30 minutes of game time', () => {
  const g = mk(); let end = null; g.hooks = { onEnd: x => end = x };
  while (!end && g.t < 1800) { if (g.phase === 'levelup') g.choose(0); g.input.x = Math.cos(g.t * 0.3); g.input.y = Math.sin(g.t * 0.3); g.update(1 / 30); }
  assert.ok(end, 'run ended'); assert.ok(typeof end.embers === 'number' && end.embers >= 0);
});
t('new achievements are testable', () => {
  const by = Object.fromEntries(LF.ACHIEVEMENTS.map(a => [a.id, a]));
  assert.ok(by.burst10.test({ bursts: 10 })); assert.ok(!by.burst10.test({ bursts: 9 }));
  assert.ok(by.shrine3.test({ shrines: 3 })); assert.ok(by.daily.test({ challenge: true, won: true })); assert.ok(!by.daily.test({ challenge: false, won: true }));
});
t('v1.3 weapon cards show evolution pair hints', () => {
  const g = mk();
  const cs = g.buildChoices(4, false);
  const wCard = cs.find(c => c.kind === 'weapon');
  assert.ok(wCard && wCard.hint && wCard.hint.indexOf('Эволюция с:') === 0, 'missing evo hint on weapon card');
  g.player.passives[LF.WEAPONS[wCard.key].pair] = 1;
  const cs2 = g.buildChoices(30, false);
  const wCard2 = cs2.find(c => c.kind === 'weapon' && c.key === wCard.key);
  assert.ok(wCard2 && wCard2.hint && wCard2.hint.indexOf('Пара собрана:') >= 0, 'missing collected pair hint');
});
t('v1.3 evolution triggers gold flash instead of red damage flash', () => {
  const g = mk({ noFx: false });
  const w = g.player.weapons[0];
  g.applyChoice({ kind: 'evo', key: w.key });
  assert.strictEqual(w.evo, true);
  assert.ok(g.flashGold > 0.5, 'expected flashGold');
  assert.strictEqual(g.flash, 0, 'expected no red damage flash');
  assert.ok(g.hitStop > 0, 'expected hitStop when noFx is false');
});
t('v1.3 noFx mode skips hitStop so simulator stays deterministic', () => {
  const g = mk({ noFx: true });
  g.player.light = 100; g.lanternBurst();
  assert.strictEqual(g.hitStop, 0);
});
t('v2.1 solid world props push player out smoothly and keep spawn clear', () => {
  const g = mk();
  assert.strictEqual(LF.worldProp(0, 0, 0), null, 'spawn cell must be clear');
  let found = null;
  for (let ax = -10; ax <= 10 && !found; ax++) for (let ay = -10; ay <= 10 && !found; ay++) {
    const pr = LF.worldProp(0, ax, ay);
    if (pr && pr.solid > 0) found = pr;
  }
  assert.ok(found, 'must have solid props');
  const ox = found.x, oy = found.y - found.solid * 0.45;
  g.player.x = ox + 2; g.player.y = oy;
  g.resolveObstacles(g.player, g.player.r);
  const d = Math.hypot(g.player.x - ox, g.player.y - oy);
  assert.ok(d >= g.player.r + found.solid - 0.1, 'player must be pushed outside solid prop: ' + d);
});
console.log(`\n${n - failed}/${n} passed`);
process.exit(failed ? 1 : 0);
