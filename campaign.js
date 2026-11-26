// Campaign simulator: a bot plays the whole progression like a player would and buys Altar upgrades between runs.
globalThis.LF = require('./js/data.js');
const Game = require('./js/game.js');
const src = require('fs').readFileSync(__dirname + '/sim.js', 'utf8');
eval(src.match(/function bot[\s\S]*?\n}\n/)[0]); eval(src.match(/function pick[\s\S]*?\n}\n/)[0]);
const N = +(process.argv[2] || 5);
const prio = ['dmg', 'hp', 'cd', 'xp', 'magnet', 'armor', 'regen', 'speed', 'reroll', 'embers', 'choice', 'revive'];
for (let c = 0; c < N; c++) {
  let embers = 0, meta = {}, cleared = [false, false, false, false, false], total = 0, runs = 0, log = [];
  while (!cleared[4] && runs < 60) {
    const zi = cleared.indexOf(false);
    let end = null;
    const g = new Game({ zone: LF.ZONES[zi], meta, noFx: true, difficulty: process.env.DIFF || 'normal', hooks: { onEnd: x => end = x } });
    g.view = { w: 1100, h: 700 };
    while (!end && g.t < 1500) { if (g.phase === 'levelup') pick(g); bot(g); g.update(1 / 30); }
    runs++; total += end.time + 15; // +15s menus between runs
    embers += end.embers;
    if (end.won && !cleared[zi]) { cleared[zi] = true; embers += 80 * (zi + 1); }
    log.push(zi + (end.won ? 'W' : 'L') + Math.round(end.time / 60 * 10) / 10);
    // buy upgrades, cheapest first among priorities
    let bought = true;
    while (bought) { bought = false; let best = null, bc = 1e9;
      for (const k of prio) { const r = meta[k] || 0; if (r >= LF.META[k].max) continue; const cost = LF.metaCost(k, r); if (cost <= embers && cost < bc) { bc = cost; best = k; } }
      if (best) { embers -= bc; meta[best] = (meta[best] || 0) + 1; bought = true; } }
  }
  console.log(`campaign ${c}: runs=${runs} total=${(total / 60).toFixed(0)} min, cleared=${cleared.filter(Boolean).length}/5 | ${log.join(' ')}`);
}
