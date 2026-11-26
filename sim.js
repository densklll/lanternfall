// Balance simulator: runs the real game logic headless with a simple bot.
// usage: node sim.js <zone 0-5> <metaPreset> <runs> [char]
// env: SEED=123 for repeatable runs, DIFF=easy for the easy difficulty, BURST=0 to forbid the lantern burst
globalThis.LF = require('./js/data.js');
const Game = require('./js/game.js');
const zoneArg = +(process.argv[2] || 0), preset = process.argv[3] || 'none', runs = +(process.argv[4] || 5);
const presets = {
  none: {},
  low: { hp: 1, dmg: 1, magnet: 1, xp: 1 },
  mid: { hp: 3, dmg: 3, cd: 2, speed: 1, magnet: 2, xp: 2, armor: 1, regen: 1, embers: 2, reroll: 1 },
  high: { hp: 5, dmg: 5, cd: 4, speed: 2, magnet: 3, xp: 4, armor: 2, regen: 2, embers: 3, reroll: 2, choice: 1 },
  max: { hp: 5, dmg: 5, cd: 5, speed: 3, magnet: 3, xp: 5, armor: 3, regen: 3, embers: 5, reroll: 3, choice: 1, revive: 1 }
};
const charId = process.argv[5] || 'keeper';
function bot(g) {
  const p = g.player; let vx = 0, vy = 0;
  for (const e of g.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy, R = e.boss ? 300 : 105;
    if (d2 < R * R && d2 > 1) { const d = Math.sqrt(d2), w = (e.boss ? 4 : 1) * (R - d) / R / d; vx += dx * w; vy += dy * w; }
  }
  for (const b of g.ebullets) {
    const dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy;
    if (d2 < 120 * 120) { const d = Math.sqrt(d2) || 1; // move perpendicular to bullet velocity
      const bl = Math.hypot(b.vx, b.vy) || 1, px = -b.vy / bl, py = b.vx / bl, side = (dx * px + dy * py) >= 0 ? 1 : -1;
      vx += px * side * 2.2 / d * 60; vy += py * side * 2.2 / d * 60; }
  }
  for (const z of g.zones) if (z.type === 'shock') { const d = Math.hypot(p.x - z.x, p.y - z.y) || 1; vx += (p.x - z.x) / d * 1.5; vy += (p.y - z.y) / d * 1.5; }
  // gems
  let best = null, bd = 600 * 600;
  for (const gm of g.gems) { const d2 = (gm.x - p.x) ** 2 + (gm.y - p.y) ** 2; if (d2 < bd) { bd = d2; best = gm; } }
  const threat = Math.hypot(vx, vy);
  if (best) { const d = Math.sqrt(bd) || 1; const w = threat > 0.05 ? 0.5 : 1; vx += (best.x - p.x) / d * w * 0.05; vy += (best.y - p.y) / d * w * 0.05; }
  if (threat < 0.004 && !best) { vx += Math.cos(g.t * 0.4) * 0.01; vy += Math.sin(g.t * 0.4) * 0.01; }
  // lantern burst: a human uses it when crowded or when bullets are close
  if (process.env.BURST !== '0' && p.light >= 50) {
    let near = 0, nb = 0;
    for (const e of g.enemies) if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 85 * 85) near++;
    for (const b of g.ebullets) if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < 90 * 90) nb++;
    if (near >= 7 || nb >= 3 || (p.hp < p.maxHp * 0.35 && near >= 3)) g.lanternBurst();
  }
  const l = Math.hypot(vx, vy); g.input.x = l > 1e-4 ? vx / l : 0; g.input.y = l > 1e-4 ? vy / l : 0;
}
function pick(g) {
  const cs = g.choices; let bi = 0, bs = -1;
  cs.forEach((c, i) => {
    let s = 1;
    if (c.kind === 'evo') s = 100;
    else if (c.kind === 'weapon') s = c.isNew ? (g.player.weapons.length < 4 ? 8 : 3) : 9;
    else if (c.kind === 'passive') s = c.hint ? 7 : ({ might: 6, echo: 6, heart: 5, armor: 5, multi: 6, halo: 5, regen: 4, magnet: 3, wind: 3, focus: 4, luck: 3 }[c.key] || 2) - (c.isNew && Object.keys(g.player.passives).length >= 4 ? 2 : 0);
    s += Math.random() * 2;
    if (s > bs) { bs = s; bi = i; }
  });
  g.choose(bi);
}
const zone = zoneArg === 5 ? LF.ENDLESS : LF.ZONES[zoneArg];
const res = [];
for (let r = 0; r < runs; r++) {
  let end = null;
  const g = new Game({ zone, meta: presets[preset], character: LF.CHARACTERS.find(c => c.id === charId), noFx: true, difficulty: process.env.DIFF || 'normal',
    rand: process.env.SEED ? LF.mulberry32(+process.env.SEED + r) : undefined, hooks: { onEnd: x => end = x } });
  g.view = { w: 1100, h: 700 }; g.dmgLog = {};
  const dt = 1 / 30; let frames = 0, maxEn = 0;
  const t0 = Date.now();
  while (!end && g.t < 1500) {
    if (g.phase === 'levelup') pick(g);
    bot(g); g.update(dt); frames++; maxEn = Math.max(maxEn, g.enemies.length);
  }
  const bossHp = g.boss ? Math.round(100 * g.boss.hp / g.boss.maxHp) + '%' : '-';
  if (!end) end = Object.assign(g.result(), { timeout: true });
  res.push(end);
  console.log(`run${r} ${end.won ? 'WON ' : 'DIED'} t=${end.time.toFixed(0)}s lvl=${end.level} kills=${end.kills} embers=${end.embers} maxEn=${maxEn} bossLeft=${bossHp} hp=${Math.round(g.player.hp)}/${g.player.maxHp} ms/frame=${((Date.now()-t0)/frames).toFixed(2)} bursts=${end.bursts} shrines=${end.shrines} build=${end.build.join(', ')} dmg=${JSON.stringify(Object.fromEntries(Object.entries(end.dmgBy || {}).map(([k,v])=>[k,Math.round(v)])))}`);
}
const won = res.filter(r => r.won).length;
console.log(`zone ${zoneArg} preset ${preset}: won ${won}/${runs}, avg time ${(res.reduce((a, r) => a + r.time, 0) / runs).toFixed(0)}s, avg embers ${(res.reduce((a, r) => a + r.embers, 0) / runs).toFixed(0)}`);
