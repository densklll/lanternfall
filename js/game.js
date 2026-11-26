// Lanternfall: core simulation. No DOM here, so the same code runs in the node balance simulator.
(function (root) {
  var LF = root.LF;
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  function Game(opts) {
    this.opts = opts;
    this.zone = opts.zone;
    this.char = opts.character || LF.CHARACTERS[0];
    this.meta = opts.meta || {};
    this.hooks = opts.hooks || {};
    this.noFx = !!opts.noFx;
    this.rand = opts.rand || Math.random;
    this.view = { w: 1280, h: 720 };
    this.t = 0; this.realT = 0;
    this.phase = 'run'; // run | boss | levelup | dead | won
    this.input = { x: 0, y: 0 };
    this.enemies = []; this.shots = []; this.ebullets = []; this.gems = []; this.fx = []; this.texts = []; this.zones = []; this.beams = [];
    this.kills = 0; this.embersFound = 0; this.evolved = 0; this.shake = 0; this.flash = 0;
    this.combo = 0; this.comboT = 0; this.maxCombo = 0;
    this.spawnT = 0; this.nextSwarm = 45; this.nextElite = 85; this.nextEndlessBoss = 180;
    this.boss = null; this.bossHpAtStart = 0; this.bossFightMinHp = 1; this.bossKilled = false;
    this.pendingLevels = 0; this.choices = null; this.endT = 0; this.slowmo = 1;
    this.hitStop = 0; this.uid = 1; this.lastHurt = -10;
    // difficulty and challenge modifiers (all default to 1 so old callers behave exactly as before)
    var diff = LF.DIFFICULTY[opts.difficulty] || LF.DIFFICULTY.normal;
    var mods = opts.mods || {};
    this.mod = {
      enemyHp: diff.enemyHp * (mods.enemyHp || 1), enemyDmg: diff.enemyDmg * (mods.enemyDmg || 1), embers: diff.embers * (mods.embers || 1),
      enemyCount: mods.enemyCount || 1, enemySpd: mods.enemySpd || 1, playerDmg: mods.playerDmg || 1, playerHp: mods.playerHp || 1, xp: mods.xp || 1, light: mods.light || 1
    };
    this.dmgBy = {}; this.nextShrine = 40; this.bossWarned = false;
    var m = this.meta;
    this.player = {
      x: 0, y: 0, r: 14, hp: 100, maxHp: 100, fx: 1, fy: 0, invuln: 0, moving: false,
      weapons: [], passives: {}, xp: 0, level: 1, xpNext: this.xpFor(1),
      rerolls: (m.reroll || 0), revive: (m.revive || 0) > 0, revived: false, anim: 0,
      light: 100, buffs: {}
    };
    this.addWeapon(this.char.weapon);
    this.computeStats();
    this.player.hp = this.stats.maxHp;
    this.grid = new Map();
    var azi = LF.ZONES.indexOf(this.zone);
    this.artZ = azi < 0 || azi > 4 ? 4 : azi;
  }
  var P = Game.prototype;

  // Smooth circle-vs-circle pushout against solid world props (O(1) cached cell lookup)
  P.resolveObstacles = function (ent, r) {
    if (!LF.worldProp) return;
    var ps = LF.PROP_CELL, pad = r + 26;
    var x0 = Math.floor((ent.x - pad) / ps), x1 = Math.floor((ent.x + pad) / ps);
    var y0 = Math.floor((ent.y - pad) / ps), y1 = Math.floor((ent.y + pad) / ps);
    for (var ax = x0; ax <= x1; ax++) {
      for (var ay = y0; ay <= y1; ay++) {
        var pr = LF.worldProp(this.artZ, ax, ay);
        if (!pr || !pr.solid) continue;
        var ox = pr.x, oy = pr.y - pr.solid * 0.45, rr = r + pr.solid;
        var dx = ent.x - ox, dy = ent.y - oy, d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) {
          var d = Math.sqrt(d2) || 0.001;
          ent.x = ox + dx / d * rr;
          ent.y = oy + dy / d * rr;
        }
      }
    }
  };

  P.xpFor = function (lv) { return Math.round(3 + lv * 2.5 + lv * lv * 0.45); };

  P.computeStats = function () {
    var m = this.meta, c = this.char.mods || {}, p = this.player.passives;
    function pv(k) { return p[k] || 0; }
    function mv(k) { return m[k] || 0; }
    var s = {};
    s.maxHp = Math.round(100 * (1 + 0.1 * mv('hp') + (c.hp || 0)) + 20 * pv('heart'));
    s.dmg = (1 + 0.07 * mv('dmg')) * (1 + 0.10 * pv('might'));
    s.cd = (1 - 0.04 * mv('cd')) * (1 - 0.07 * pv('echo')) * (1 - (c.cd || 0));
    s.area = 1 + 0.12 * pv('halo') + (c.area || 0);
    s.speed = 168 * (1 + 0.05 * mv('speed') + 0.08 * pv('wind') + (c.speed || 0));
    s.magnet = 100 * (1 + 0.2 * mv('magnet') + 0.35 * pv('magnet'));
    s.xp = (1 + 0.08 * mv('xp') + (c.xp || 0)) * (1 + 0.1 * pv('luck'));
    s.regen = 0.3 * mv('regen') + 0.5 * pv('regen');
    s.armor = 1 - (1 - 0.05 * mv('armor')) * (1 - 0.06 * pv('armor'));
    s.crit = 0.05 + 0.06 * pv('focus');
    s.luck = pv('luck') + (c.luck || 0);
    s.multi = pv('multi');
    s.embers = (1 + 0.12 * mv('embers')) * (this.zone.embers || 1) * this.mod.embers;
    var b = this.player.buffs || {}, md = this.mod;
    s.maxHp = Math.round(s.maxHp * md.playerHp);
    s.dmg *= md.playerDmg * (b.fury > 0 ? 1.6 : 1);
    s.xp *= md.xp;
    if (b.haste > 0) { s.speed *= 1.35; s.cd *= 0.8; }
    if (b.aegis > 0) s.armor = 1 - (1 - s.armor) * 0.5;
    var old = this.stats;
    this.stats = s;
    if (old && s.maxHp > old.maxHp) this.player.hp += s.maxHp - old.maxHp;
    this.player.maxHp = s.maxHp;
    this.player.hp = Math.min(this.player.hp, s.maxHp);
  };

  // ---------- helpers ----------
  P.sfx = function (n, a) { if (this.hooks.sfx) this.hooks.sfx(n, a); };
  P.addFx = function (o) { if (this.noFx) return; if (this.fx.length > 420) this.fx.shift(); this.fx.push(o); };
  P.burst = function (x, y, color, n, spd, life, size) {
    if (this.lowFx) n = Math.ceil(n / 2);
    if (this.noFx) return;
    for (var i = 0; i < n; i++) {
      var a = this.rand() * TAU, v = spd * (0.3 + this.rand() * 0.9);
      this.addFx({ type: 'p', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + this.rand() * 0.6), max: life, color: color, size: size || 3 });
    }
  };
  P.sparkBurst = function (x, y, color, n, spd, life) {
    if (this.noFx) return;
    if (this.lowFx) n = Math.ceil(n / 2);
    for (var i = 0; i < n; i++) {
      var a = this.rand() * TAU, v = spd * (0.45 + this.rand() * 0.85);
      this.addFx({ type: 'sp', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + this.rand() * 0.5), max: life, color: color });
    }
  };
  P.text = function (x, y, s, color, big) {
    if (this.noFx) return;
    if (this.texts.length > 70) this.texts.shift();
    this.texts.push({ x: x + (this.rand() - 0.5) * 10, y: y, s: s, color: color, life: 0.7, big: big });
  };

  P.buildGrid = function () {
    var g = this.grid; g.clear();
    var es = this.enemies;
    for (var i = 0; i < es.length; i++) {
      var e = es[i];
      var k = ((Math.floor(e.x / 80) + 4096) * 8192) + (Math.floor(e.y / 80) + 4096);
      var cell = g.get(k);
      if (!cell) { cell = []; g.set(k, cell); }
      cell.push(e);
    }
  };
  P.query = function (x, y, r, cb) {
    var x0 = Math.floor((x - r) / 80), x1 = Math.floor((x + r) / 80);
    var y0 = Math.floor((y - r) / 80), y1 = Math.floor((y + r) / 80);
    for (var cx = x0; cx <= x1; cx++) for (var cy = y0; cy <= y1; cy++) {
      var cell = this.grid.get(((cx + 4096) * 8192) + (cy + 4096));
      if (!cell) continue;
      for (var i = 0; i < cell.length; i++) { if (cb(cell[i]) === false) return; }
    }
  };
  P.nearest = function (x, y, maxR, exclude) {
    var best = null, bd = maxR * maxR;
    var es = this.enemies;
    for (var i = 0; i < es.length; i++) {
      var e = es[i]; if (e.dead || (exclude && exclude.has(e.id))) continue;
      var d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };
  P.nearestN = function (x, y, n, maxR) {
    var arr = [], mr = maxR * maxR, es = this.enemies;
    for (var i = 0; i < es.length; i++) { var e = es[i]; if (e.dead) continue; var d = dist2(x, y, e.x, e.y); if (d < mr) arr.push([d, e]); }
    arr.sort(function (a, b) { return a[0] - b[0]; });
    return arr.slice(0, n).map(function (a) { return a[1]; });
  };

  // ---------- weapons ----------
  P.hasWeapon = function (k) { for (var i = 0; i < this.player.weapons.length; i++) if (this.player.weapons[i].key === k) return this.player.weapons[i]; return null; };
  P.addWeapon = function (k) {
    var w = this.hasWeapon(k);
    if (w) { w.lv = Math.min(5, w.lv + 1); return w; }
    w = { key: k, lv: 1, timer: 0.4, angle: 0, evo: false, id: this.uid++ };
    this.player.weapons.push(w);
    return w;
  };
  P.wv = function (w, field) { var d = LF.WEAPONS[w.key][field]; return d[w.evo ? 5 : w.lv - 1]; };

  P.dealDamage = function (e, base, kx, ky, knock, src) {
    if (e.dead) return 0;
    var s = this.stats, crit = this.rand() < s.crit;
    var d = base * s.dmg * (crit ? 2 : 1) * (0.92 + this.rand() * 0.16);
    if (e.boss && e.shield) d *= 0.35;
    e.hp -= d; e.flash = 0.1;
    if (!this.noFx && this.fx.length < 320) this.fx.push({ type: 'hit', x: e.x - kx * e.r * 0.5, y: e.y - ky * e.r * 0.5, life: 0.15, max: 0.15, crit: crit }); // hit star (visual only)
    var key = src === 'moth' ? 'moths' : src === 'boom' ? 'spark' : (src || 'other');
    this.dmgBy[key] = (this.dmgBy[key] || 0) + Math.min(d, e.hp + d);
    if (knock && !e.boss) { var km = knock / (e.mass || 1); e.kx += kx * km; e.ky += ky * km; }
    if (this.texts.length < 70 || crit) this.text(e.x, e.y - e.r, crit ? (Math.round(d) + '!') : Math.round(d), crit ? '#ffe27a' : '#ffffff', crit);
    if (!this.noFx) {
      if (crit) {
        this.shake = Math.min(7, this.shake + 1.4);
        this.addFx({ type: 'ring', x: e.x, y: e.y, r: e.r * 1.4, max: 0.22, life: 0.22, color: '#ffe27a' });
        this.sparkBurst(e.x, e.y, '#ffe27a', 6, 260, 0.28);
      } else if (this.rand() < 0.45) {
        this.sparkBurst(e.x, e.y, e.color, 3, 180, 0.22);
      }
    }
    if (e.hp <= 0) this.killEnemy(e);
    return d;
  };

  P.updateWeapons = function (dt) {
    var p = this.player, s = this.stats;
    for (var i = 0; i < p.weapons.length; i++) {
      var w = p.weapons[i], def = LF.WEAPONS[w.key];
      if (w.key === 'orbit') { this.updateOrbit(w, dt); continue; }
      w.timer -= dt;
      if (w.timer > 0) continue;
      var fired = this['fire_' + w.key](w, def);
      w.timer = fired === false ? 0.15 : this.wv(w, 'cd') * s.cd;
    }
  };

  P.fire_spark = function (w, def) {
    var p = this.player, n = this.wv(w, 'count') + this.stats.multi;
    var targets = this.nearestN(p.x, p.y, n, 520);
    if (!targets.length) return false;
    for (var i = 0; i < n; i++) {
      var t = targets[i % targets.length];
      var a = Math.atan2(t.y - p.y, t.x - p.x) + (i >= targets.length ? (this.rand() - 0.5) * 0.5 : 0);
      this.shots.push({ type: 'spark', x: p.x, y: p.y, vx: Math.cos(a) * def.speed, vy: Math.sin(a) * def.speed, r: w.evo ? 7 : 5, dmg: this.wv(w, 'dmg'), pierce: this.wv(w, 'pierce'), life: 1.1, hit: new Set(), evo: w.evo, color: def.color });
    }
    this.sfx('shoot');
  };

  P.updateOrbit = function (w, dt) {
    var p = this.player, s = this.stats, self = this;
    var n = this.wv(w, 'count') + s.multi, R = this.wv(w, 'radius') * (0.6 + 0.4 * s.area), dmg = this.wv(w, 'dmg');
    w.angle += this.wv(w, 'rot') * dt;
    w.orbs = w.orbs || [];
    w.orbs.length = 0;
    var orbR = (w.evo ? 13 : 10) * (0.7 + 0.3 * s.area);
    for (var i = 0; i < n; i++) {
      var ring = w.evo && i % 2 === 1 ? 0.62 : 1;
      var a = w.angle * (ring < 1 ? -1.3 : 1) + i * TAU / n;
      var ox = p.x + Math.cos(a) * R * ring, oy = p.y + Math.sin(a) * R * ring;
      w.orbs.push({ x: ox, y: oy, r: orbR });
      this.query(ox, oy, orbR + 30, function (e) {
        if (e.dead) return;
        if (e.oHit > self.t) return;
        var rr = orbR + e.r;
        if (dist2(ox, oy, e.x, e.y) < rr * rr) {
          e.oHit = self.t + LF.WEAPONS.orbit.hitCd;
          var dx = e.x - p.x, dy = e.y - p.y, dl = Math.sqrt(dx * dx + dy * dy) || 1;
          self.dealDamage(e, dmg, dx / dl, dy / dl, 60, 'orbit');
        }
      });
    }
  };

  P.fire_nova = function (w, def) {
    var p = this.player;
    if (!this.nearest(p.x, p.y, 420)) return false;
    var R = this.wv(w, 'radius') * this.stats.area;
    this.zones.push({ type: 'nova', x: p.x, y: p.y, r: 10, maxR: R, t: 0, dur: 0.35, dmg: this.wv(w, 'dmg'), hit: new Set(), stun: w.evo, follow: true });
    if (w.evo) this.zones.push({ type: 'nova', x: p.x, y: p.y, r: 10, maxR: R * 1.2, t: -0.25, dur: 0.4, dmg: this.wv(w, 'dmg') * 0.7, hit: new Set(), stun: true, follow: true });
    this.sfx('nova');
  };

  P.fire_chain = function (w, def) {
    var p = this.player, s = this.stats;
    var range = def.range * (0.8 + 0.2 * s.area);
    var bolts = this.wv(w, 'bolts'), any = false;
    for (var b = 0; b < bolts; b++) {
      var hit = new Set(), cur = this.nearest(p.x, p.y, range, null);
      if (b > 0) { var cands = this.nearestN(p.x, p.y, 6, range); cur = cands.length ? cands[Math.floor(this.rand() * cands.length)] : null; }
      if (!cur) continue;
      any = true;
      var pts = [{ x: p.x, y: p.y }], chains = this.wv(w, 'chains') + s.multi;
      for (var c = 0; c < chains && cur; c++) {
        hit.add(cur.id); pts.push({ x: cur.x, y: cur.y });
        this.dealDamage(cur, this.wv(w, 'dmg'), 0, 0, 0, 'chain');
        cur = this.nearest(cur.x, cur.y, 170 * (0.8 + 0.2 * s.area), hit);
      }
      if (!this.noFx) this.beams.push({ type: 'chain', pts: pts, life: 0.22, max: 0.22, color: def.color });
    }
    if (!any) return false;
    this.sfx('zap');
  };

  P.fire_lance = function (w, def) {
    var p = this.player, s = this.stats, self = this;
    var dirs = [[p.fx, p.fy]];
    if (w.evo) dirs.push([-p.fx, -p.fy]);
    var L = this.wv(w, 'length') * (0.6 + 0.4 * s.area), W = this.wv(w, 'width') * s.area, dmg = this.wv(w, 'dmg');
    for (var d = 0; d < dirs.length; d++) {
      var ux = dirs[d][0], uy = dirs[d][1];
      var ex = p.x + ux * L, ey = p.y + uy * L;
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i]; if (e.dead) continue;
        var rx = e.x - p.x, ry = e.y - p.y, proj = rx * ux + ry * uy;
        if (proj < -e.r || proj > L + e.r) continue;
        var perp = Math.abs(rx * uy - ry * ux);
        if (perp < W / 2 + e.r) self.dealDamage(e, dmg, ux, uy, 90, 'lance');
      }
      if (!this.noFx) this.beams.push({ type: 'lance', x: p.x, y: p.y, x2: ex, y2: ey, w: W, life: 0.2, max: 0.2, color: def.color });
    }
    this.sfx('lance');
  };

  P.fire_moths = function (w, def) {
    var p = this.player;
    if (!this.nearest(p.x, p.y, 600)) return false;
    var n = this.wv(w, 'count') + this.stats.multi;
    for (var i = 0; i < n; i++) {
      var a = this.rand() * TAU;
      this.shots.push({ type: 'moth', x: p.x, y: p.y, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, r: 6, dmg: this.wv(w, 'dmg'), pierce: w.evo ? 2 : 0, life: this.wv(w, 'life'), hit: new Set(), target: null, retarget: 0, color: def.color, ph: this.rand() * TAU });
    }
    this.sfx('moth');
  };

  P.fire_meteor = function (w, def) {
    var p = this.player, n = this.wv(w, 'count') + this.stats.multi;
    var cands = this.nearestN(p.x, p.y, 24, 480);
    if (!cands.length) return false;
    var R = this.wv(w, 'radius') * this.stats.area;
    for (var i = 0; i < n; i++) {
      var t = cands[Math.floor(this.rand() * cands.length)];
      this.zones.push({ type: 'meteor', x: t.x + (this.rand() - 0.5) * 30, y: t.y + (this.rand() - 0.5) * 30, r: R, t: -0.55 - i * 0.12, dur: 0.25, dmg: this.wv(w, 'dmg'), hit: new Set(), color: def.color, boomed: false });
    }
  };

  // ---------- enemies ----------
  P.zoneTime = function () { return this.t; };
  P.scaleHp = function () {
    var t = this.t;
    if (this.zone.endless) return this.zone.hp * (1 + t / 150 + Math.pow(t / 240, 2) * 1.6);
    var z = this.zone; return z.hp + (z.hpEnd - z.hp) * t / LF.RUN_TIME;
  };
  P.scaleDmg = function () {
    var t = this.t;
    if (this.zone.endless) return this.zone.dmg * (1 + t / 300 + Math.pow(t / 600, 2));
    return this.zone.dmg * (1 + t / LF.RUN_TIME * 0.5);
  };

  P.spawnEnemy = function (type, x, y, elite) {
    if (this.enemies.length > 400 && !elite) return null; // hard cap for weak devices
    var b = LF.ENEMIES[type];
    var hp = b.hp * this.scaleHp() * this.mod.enemyHp * (elite ? 9 : 1);
    var affix = elite ? (this.rand() < 0.5 ? 'swift' : 'armored') : null;
    if (affix === 'armored') hp *= 1.5;
    var e = {
      id: this.uid++, type: type, x: x, y: y, r: b.r * (elite ? 1.6 : 1), hp: hp, maxHp: hp, spd: b.spd * this.mod.enemySpd * (elite ? (affix === 'swift' ? 1.25 : 0.85) : 1) * (0.92 + this.rand() * 0.16),
      dmg: b.dmg * this.scaleDmg() * this.mod.enemyDmg * (elite ? 1.5 : 1), affix: affix, xp: b.xp * (elite ? 10 : 1), kx: 0, ky: 0, flash: 0, hitCd: 0, oHit: 0, stun: 0,
      mass: (b.mass || 1) * (elite ? 4 : 1), elite: !!elite, color: this.zone.pal.enemy, shape: b.shape, ph: this.rand() * TAU, st: 0, stT: 1 + this.rand() * 2, dead: false
    };
    this.enemies.push(e);
    return e;
  };

  P.spawnRingPos = function (extra) {
    var vw = this.view.w, vh = this.view.h;
    var R = Math.sqrt(vw * vw + vh * vh) / 2 + 40 + (extra || 0);
    var p = this.player, a;
    if (p.moving && this.rand() < 0.55) a = Math.atan2(p.fy, p.fx) + (this.rand() - 0.5) * 1.6;
    else a = this.rand() * TAU;
    return { x: p.x + Math.cos(a) * R, y: p.y + Math.sin(a) * R };
  };

  P.pickType = function () {
    var mix = this.zone.mix, t = this.t, tot = 0, i;
    for (i = 0; i < mix.length; i++) if (t >= mix[i][2]) tot += mix[i][1];
    var r = this.rand() * tot;
    for (i = 0; i < mix.length; i++) { if (t < mix[i][2]) continue; r -= mix[i][1]; if (r <= 0) return mix[i][0]; }
    return mix[0][0];
  };

  P.director = function (dt) {
    var t = this.t, z = this.zone;
    var cap = z.endless ? 330 : 260;
    var target = Math.min(cap, (18 + t * 0.25 + Math.pow(t / 60, 2) * 2.5) * z.density * this.mod.enemyCount);
    if (this.boss) target *= 0.35;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.22;
      var need = target - this.enemies.length;
      var batch = Math.min(need, 2 + Math.floor(t / 45));
      for (var i = 0; i < batch; i++) { var pos = this.spawnRingPos(this.rand() * 60); this.spawnEnemy(this.pickType(), pos.x, pos.y); }
    }
    if (t >= this.nextSwarm && !this.boss) {
      this.nextSwarm += z.endless ? 40 : 55;
      var n = Math.min(40, 16 + Math.floor(t / 20)), p = this.player, vw = this.view.w, vh = this.view.h;
      var R = Math.sqrt(vw * vw + vh * vh) / 2 + 30, typ = this.rand() < 0.5 ? 'bat' : (z.id >= 3 ? 'wraith' : 'crawler');
      for (var k = 0; k < n; k++) { var a = k * TAU / n; this.spawnEnemy(typ, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R); }
      if (this.hooks.toast) this.hooks.toast('Рой окружает!');
      this.sfx('warn');
    }
    if (t >= this.nextElite && !this.boss) {
      this.nextElite += z.endless ? 60 : 90;
      var pos2 = this.spawnRingPos(0), types = ['brute', 'charger', 'splitter', 'wraith'];
      var et = z.id === 0 ? 'brute' : types[Math.floor(this.rand() * types.length)];
      var el = this.spawnEnemy(et, pos2.x, pos2.y, true);
      if (this.hooks.toast) this.hooks.toast('Элитный ' + LF.ENEMIES[et].name.toLowerCase() + (el && el.affix === 'swift' ? ' (быстрый)' : ' (бронированный)') + ', у него сундук');
    }
    if (!z.endless && !this.bossWarned && t >= LF.RUN_TIME - 10 && !this.bossKilled) {
      this.bossWarned = true;
      if (this.hooks.toast) this.hooks.toast('Босс через 10 секунд!');
      this.sfx('siren');
    }
    if (t >= this.nextShrine && !this.boss) {
      this.nextShrine += 75;
      var sa = this.rand() * TAU, sd = 420 + this.rand() * 160, pl = this.player;
      var shPos = { x: pl.x + Math.cos(sa) * sd, y: pl.y + Math.sin(sa) * sd };
      this.resolveObstacles(shPos, 30);
      this.gems.push({ x: shPos.x, y: shPos.y, kind: 'shrine', v: 1, pull: false, vx: 0, vy: 0, age: 0 });
      if (this.hooks.toast) this.hooks.toast('Где-то рядом загорелся алтарь света');
    }
    if (!z.endless && t >= LF.RUN_TIME && !this.boss && !this.bossKilled) this.spawnBoss(z.boss, 1);
    if (z.endless && t >= this.nextEndlessBoss && !this.boss) { this.nextEndlessBoss += 180; this.spawnBoss(z.boss, 1 + (t / 180 - 1) * 0.9); }
  };

  P.spawnBoss = function (def, mul) {
    var p = this.player, a = this.rand() * TAU;
    var hp = def.hp * (mul || 1);
    var b = {
      id: this.uid++, type: 'boss', boss: true, def: def, x: p.x + Math.cos(a) * 380, y: p.y + Math.sin(a) * 380, r: def.r, hp: hp, maxHp: hp,
      spd: def.spd, dmg: def.dmg * this.mod.enemyDmg * (this.zone.endless ? this.scaleDmg() / this.zone.dmg : 1), xp: 0, kx: 0, ky: 0, flash: 0, hitCd: 0, oHit: 0, stun: 0, mass: 50,
      color: def.color, shape: 'boss', ph: 0, st: 'walk', stT: 2, pat: 0, patT: 0, spin: 0, dead: false, phase2: false
    };
    this.enemies.push(b);
    this.boss = b; this.bossHpAtStart = p.hp / p.maxHp; this.bossFightMinHp = this.bossHpAtStart;
    // clear the field a bit
    for (var i = 0; i < this.enemies.length; i++) { var e = this.enemies[i]; if (!e.boss && !e.elite && dist2(e.x, e.y, p.x, p.y) > 300 * 300) e.dead = true; }
    this.shake = 12;
    this.addFx({ type: 'ring', x: b.x, y: b.y, r: b.r * 3, max: 1.2, life: 1.2, color: b.color });
    this.addFx({ type: 'ring', x: b.x, y: b.y, r: b.r * 2, max: 0.8, life: 0.8, color: '#ffffff' });
    this.sfx('boss');
    if (this.hooks.onBoss) this.hooks.onBoss(def);
  };

  P.ebullet = function (x, y, a, spd, dmg, r) {
    if (this.ebullets.length > 500) return;
    this.ebullets.push({ x: x, y: y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: r || 6, dmg: dmg, life: 6 });
  };

  P.updateBoss = function (b, dt) {
    var p = this.player, def = b.def, self = this;
    var dx = p.x - b.x, dy = p.y - b.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (def.phases && !b.phase2 && b.hp < b.maxHp * 0.5) {
      b.phase2 = true; b.shield = true; b.st = 'shield'; b.stT = 2.2; this.shake = 14;
      if (this.hooks.toast) this.hooks.toast('Пожиратель в ярости!');
      for (var s = 0; s < 10; s++) { var aa = s * TAU / 10; this.spawnEnemy('wraith', b.x + Math.cos(aa) * 120, b.y + Math.sin(aa) * 120); }
    }
    b.age = (b.age || 0) + dt;
    if (!b.enraged && b.age > 80) { b.enraged = true; this.shake = 12; if (this.hooks.toast) this.hooks.toast(def.name + ' в бешенстве!'); }
    if (!def.phases && !b.half && b.hp < b.maxHp * 0.5) { b.half = true; this.shake = 10; if (this.hooks.toast) this.hooks.toast(def.name + ' злится: атакует чаще'); }
    var per = def.period * (b.phase2 ? 0.7 : 1) * (b.enraged ? 0.6 : 1) * (b.half ? 0.85 : 1);
    var dm = b.dmg * 0.55;
    b.stT -= dt;
    if (b.st === 'shield') { if (b.stT <= 0) { b.shield = false; b.st = 'walk'; b.stT = 1; } return; }
    if (b.st === 'tele') { if (b.stT <= 0) { b.st = 'dash'; b.stT = 0.65; } return; }
    if (b.st === 'dash') {
      b.x += b.dx * 560 * dt; b.y += b.dy * 560 * dt;
      if (!this.noFx && this.rand() < 0.6) this.addFx({ type: 'p', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.4, max: 0.4, color: b.color, size: 8 });
      if (b.stT <= 0) { b.st = 'walk'; b.stT = per; }
      return;
    }
    if (b.st === 'spiral') {
      b.patT -= dt; b.spin += dt * 2.4;
      if (b.patT <= 0) {
        b.patT = b.phase2 ? 0.07 : 0.09;
        var arms = b.phase2 ? 4 : 3;
        for (var k = 0; k < arms; k++) this.ebullet(b.x, b.y, b.spin + k * TAU / arms, 150, dm);
      }
      if (b.stT <= 0) { b.st = 'walk'; b.stT = per; }
      return;
    }
    if (b.st === 'aimed') {
      b.patT -= dt;
      if (b.patT <= 0 && b.vol > 0) {
        b.vol--; b.patT = 0.35;
        var base = Math.atan2(dy, dx);
        for (var f = -2; f <= 2; f++) this.ebullet(b.x, b.y, base + f * 0.16, 230, dm);
        this.sfx('eshot');
      }
      if (b.stT <= 0) { b.st = 'walk'; b.stT = per; }
      return;
    }
    // walk
    var sp = b.spd * (b.phase2 ? 1.25 : 1) * (b.enraged ? 1.6 : 1) * (b.half ? 1.12 : 1);
    b.x += dx / d * sp * dt; b.y += dy / d * sp * dt;
    if (b.stT <= 0) {
      var pats = def.patterns, pat = pats[b.pat % pats.length]; b.pat++;
      if (this.rand() < 0.35) pat = pats[Math.floor(this.rand() * pats.length)];
      if (pat === 'ring') {
        var n = b.phase2 ? 26 : 18, off = this.rand() * TAU;
        for (var i = 0; i < n; i++) this.ebullet(b.x, b.y, off + i * TAU / n, 140, dm, 7);
        if (b.phase2) for (var j = 0; j < n; j++) this.ebullet(b.x, b.y, off + (j + 0.5) * TAU / n, 95, dm, 7);
        this.sfx('eshot'); b.stT = per;
      } else if (pat === 'spiral') { b.st = 'spiral'; b.stT = 2.2; b.patT = 0; }
      else if (pat === 'summon') {
        var cnt = b.phase2 ? 12 : 8, typ = this.zone.mix[Math.min(1, this.zone.mix.length - 1)][0];
        for (var q = 0; q < cnt; q++) { var a2 = q * TAU / cnt; this.spawnEnemy(typ, b.x + Math.cos(a2) * 90, b.y + Math.sin(a2) * 90); }
        this.sfx('summon'); b.stT = per;
      } else if (pat === 'charge') {
        b.st = 'tele'; b.stT = 0.75; b.dx = dx / d; b.dy = dy / d;
        this.beams.push({ type: 'tele', x: b.x, y: b.y, x2: b.x + b.dx * 380, y2: b.y + b.dy * 380, w: b.r * 2, life: 0.75, max: 0.75, color: '#ff4d4d' });
        this.sfx('warn');
      } else if (pat === 'shock') {
        this.zones.push({ type: 'shock', x: b.x, y: b.y, r: b.r, maxR: 460, t: -0.6, dur: 1.4, dmg: b.dmg * 0.9, hitP: false });
        this.sfx('warn'); b.stT = per;
      } else if (pat === 'aimed') { b.st = 'aimed'; b.vol = b.phase2 ? 4 : 3; b.patT = 0.2; b.stT = 1.6; }
      else if (pat === 'blink') {
        var ba = this.rand() * TAU;
        if (!this.noFx) this.burst(b.x, b.y, b.color, 24, 220, 0.5, 4);
        b.x = p.x + Math.cos(ba) * 260; b.y = p.y + Math.sin(ba) * 260;
        if (!this.noFx) this.burst(b.x, b.y, b.color, 24, 220, 0.5, 4);
        var n2 = 14;
        for (var u = 0; u < n2; u++) this.ebullet(b.x, b.y, u * TAU / n2, 120, dm);
        this.sfx('blink'); b.stT = per;
      } else b.stT = per;
    }
  };

  P.updateEnemies = function (dt) {
    var p = this.player, es = this.enemies, self = this;
    var vw = this.view.w, vh = this.view.h, farR = Math.sqrt(vw * vw + vh * vh) / 2 + 260;
    for (var i = 0; i < es.length; i++) {
      var e = es[i]; if (e.dead) continue;
      e.flash -= dt; e.hitCd -= dt;
      if (e.boss) { this.updateBoss(e, dt); }
      else {
        var dx = p.x - e.x, dy = p.y - e.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d > farR) { // re-position far enemies ahead of the player
          var pos = this.spawnRingPos(0); e.x = pos.x; e.y = pos.y; continue;
        }
        var ux = dx / d, uy = dy / d, sp = e.spd;
        if (e.stun > 0) { e.stun -= dt; sp = 0; }
        var mx = ux, my = uy;
        e.ph += dt;
        if (e.shape === 'bat') { var w = Math.sin(e.ph * 5) * 0.7; mx = ux - uy * w; my = uy + ux * w; }
        if (e.shape === 'ghost') { var w2 = Math.sin(e.ph * 2) * 0.5; mx = ux - uy * w2; my = uy + ux * w2; }
        if (e.type === 'spitter') {
          if (d < 200) { mx = -ux; my = -uy; } else if (d < 280) { mx = -uy * 0.6; my = ux * 0.6; }
          e.stT -= dt;
          if (e.stT <= 0 && d < 520) { e.stT = 2.6 + this.rand(); this.ebullet(e.x, e.y, Math.atan2(dy, dx), 190, e.dmg, 6); }
        }
        if (e.type === 'charger') {
          e.stT -= dt;
          if (e.st === 1) { sp = 0; if (e.stT <= 0) { e.st = 2; e.stT = 0.5; } }
          else if (e.st === 2) { mx = e.cx; my = e.cy; sp = 400; if (e.stT <= 0) { e.st = 0; e.stT = 2.8 + this.rand() * 1.5; } }
          else if (e.stT <= 0 && d < 300) { e.st = 1; e.stT = 0.6; e.cx = ux; e.cy = uy; }
        }
        e.x += (mx * sp + e.kx) * dt; e.y += (my * sp + e.ky) * dt;
        if (e.shape !== 'bat' && e.shape !== 'ghost') this.resolveObstacles(e, e.r);
        var damp = Math.pow(0.0005, dt); e.kx *= damp; e.ky *= damp;
      }
      // contact damage
      var rr = e.r + p.r - 3;
      if (e.hitCd <= 0 && dist2(e.x, e.y, p.x, p.y) < rr * rr) { e.hitCd = 0.75; this.hurtPlayer(e.dmg, e.type); }
    }
    // separation (cheap, grid based)
    this.buildGrid();
    for (var j = 0; j < es.length; j++) {
      var a = es[j]; if (a.dead || a.shape === 'ghost') continue;
      var cnt = 0;
      this.query(a.x, a.y, a.r + 22, function (o) {
        if (o === a || o.dead || o.shape === 'ghost') return;
        var ddx = a.x - o.x, ddy = a.y - o.y, rs = a.r + o.r, dd = ddx * ddx + ddy * ddy;
        if (dd < rs * rs && dd > 0.01) {
          var dl = Math.sqrt(dd), push = (rs - dl) * 0.5, ma = a.mass || 1, mo = o.mass || 1, f = mo / (ma + mo);
          a.x += ddx / dl * push * f; a.y += ddy / dl * push * f;
        }
        if (++cnt > 8) return false;
      });
    }
  };

  P.hurtPlayer = function (dmg, src) {
    var p = this.player;
    if (p.invuln > 0 || this.phase === 'dead' || this.phase === 'won') return;
    var d = dmg * (1 - this.stats.armor);
    if (this.dmgLog) this.dmgLog[src] = (this.dmgLog[src] || 0) + d;
    p.hp -= d; p.invuln = 0.12; this.lastHurt = this.t;
    this.shake = Math.min(10, this.shake + 4); this.flash = 0.25;
    this.sfx('hurt');
    if (this.boss) this.bossFightMinHp = Math.min(this.bossFightMinHp, p.hp / p.maxHp);
    if (p.hp <= 0) {
      if (p.revive && !p.revived) {
        p.revived = true; p.hp = p.maxHp * 0.5; p.invuln = 2.5;
        this.zones.push({ type: 'nova', x: p.x, y: p.y, r: 10, maxR: 320, t: 0, dur: 0.5, dmg: 60, hit: new Set(), stun: true, follow: true });
        this.ebullets.length = 0;
        if (this.hooks.toast) this.hooks.toast('Второе дыхание!');
        this.sfx('revive');
      } else {
        p.hp = 0; this.phase = 'dead'; this.endT = 0;
        this.burst(p.x, p.y, '#ffe27a', 60, 300, 1.2, 4);
        this.sfx('lose');
      }
    }
  };

  P.killEnemy = function (e) {
    if (e.dead) return;
    e.dead = true; this.kills++;
    this.combo++; this.comboT = 2.4;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    var luck = this.stats.luck;
    if (!this.noFx) {
      this.burst(e.x, e.y, e.color, e.boss ? 80 : (e.elite ? 32 : 8), e.boss ? 420 : 190, e.boss ? 1.2 : 0.45, e.boss ? 5 : 3);
      this.sparkBurst(e.x, e.y, e.elite ? '#ffe27a' : e.color, e.boss ? 28 : (e.elite ? 16 : 5), e.boss ? 440 : 240, e.boss ? 0.7 : 0.32);
      this.addFx({ type: 'ring', x: e.x, y: e.y, r: e.r * (e.elite ? 1.8 : 1.15), max: e.elite ? 0.45 : 0.28, life: e.elite ? 0.45 : 0.28, color: e.elite ? '#ffe27a' : e.color });
      if (e.elite) { this.shake = Math.min(12, this.shake + 6); this.flashGold = Math.max(this.flashGold || 0, 0.25); }
    }
    if (!this.noFx && !e.boss) this.addFx({ type: 'die', etype: e.type, x: e.x, y: e.y, r: e.r, flip: this.player.x < e.x, life: 0.42, max: 0.42 }); // death dissolve (visual only)
    if (e.boss) { this.onBossKilled(e); return; }
    if (e.elite && !this.noFx) this.hitStop = Math.max(this.hitStop, 0.055);
    this.sfx('kill');
    if (e.type === 'splitter') for (var i = 0; i < LF.ENEMIES.splitter.splits; i++) { var a = i * TAU / 3; this.spawnEnemy('mini', e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14); }
    this.dropGem(e.x, e.y, 'xp', e.xp);
    if (e.elite) { this.dropGem(e.x + 12, e.y, 'chest', 1); return; }
    var r = this.rand();
    if (r < 0.006 + luck * 0.001) this.dropGem(e.x, e.y, 'heal', 1);
    else if (r < 0.009 + luck * 0.0015) this.dropGem(e.x, e.y, 'magnet', 1);
    else if (r < 0.04 + luck * 0.006) this.dropGem(e.x, e.y, 'ember', 1 + Math.floor(this.rand() * 2));
  };

  P.dropGem = function (x, y, kind, v) {
    if (kind === 'xp' && this.gems.length > 320) {
      // merge into a random existing xp gem so the field never floods
      for (var k = 0; k < 6; k++) { var g = this.gems[Math.floor(this.rand() * this.gems.length)]; if (g.kind === 'xp') { g.v += v; return; } }
    }
    this.gems.push({ x: x, y: y, kind: kind, v: v, pull: false, vx: 0, vy: 0, age: 0 });
  };

  P.onBossKilled = function (e) {
    this.boss = null; this.bossKilled = true; this.shake = 20; this.flash = 0.6;
    if (!this.noFx) this.hitStop = Math.max(this.hitStop, 0.1);
    this.sfx('bosskill');
    this.cleanBoss = (this.bossHpAtStart - this.bossFightMinHp) <= 0.3;
    if (this.zone.endless) {
      this.dropGem(e.x, e.y, 'chest', 1); this.dropGem(e.x + 30, e.y, 'chest', 1);
      for (var i = 0; i < 10; i++) this.dropGem(e.x + (this.rand() - 0.5) * 80, e.y + (this.rand() - 0.5) * 80, 'ember', 5);
      this.bossKilled = false; this.bossesBeaten = (this.bossesBeaten || 0) + 1;
      return;
    }
    for (var j = 0; j < this.enemies.length; j++) if (!this.enemies[j].dead) { this.enemies[j].dead = true; if (!this.noFx) this.burst(this.enemies[j].x, this.enemies[j].y, this.enemies[j].color, 4, 120, 0.4, 3); }
    this.ebullets.length = 0;
    this.phase = 'won'; this.endT = 0;
  };

  // ---------- shots, zones, gems ----------
  P.updateShots = function (dt) {
    var self = this, sh = this.shots;
    for (var i = sh.length - 1; i >= 0; i--) {
      var s = sh[i];
      s.life -= dt;
      if (s.type === 'moth') {
        s.retarget -= dt;
        if (!s.target || s.target.dead || s.retarget <= 0) { s.target = this.nearest(s.x, s.y, 420, s.hit); s.retarget = 0.3; }
        var tx, ty;
        if (s.target) { tx = s.target.x - s.x; ty = s.target.y - s.y; }
        else { tx = this.player.x - s.x + Math.cos(s.ph) * 60; ty = this.player.y - s.y + Math.sin(s.ph) * 60; }
        var tl = Math.sqrt(tx * tx + ty * ty) || 1;
        s.vx += (tx / tl * 300 - s.vx) * Math.min(1, dt * 4.5); s.vy += (ty / tl * 300 - s.vy) * Math.min(1, dt * 4.5);
        s.ph += dt * 3;
      }
      s.x += s.vx * dt; s.y += s.vy * dt;
      var dead = s.life <= 0;
      if (!dead) {
        this.query(s.x, s.y, s.r + 60, function (e) {
          if (e.dead || s.hit.has(e.id)) return;
          var rr = s.r + e.r;
          if (dist2(s.x, s.y, e.x, e.y) < rr * rr) {
            s.hit.add(e.id);
            var vl = Math.sqrt(s.vx * s.vx + s.vy * s.vy) || 1;
            self.dealDamage(e, s.dmg, s.vx / vl, s.vy / vl, 40, s.type);
            if (s.type === 'spark' && s.evo) self.explode(s.x, s.y, 46 * self.stats.area, s.dmg * 0.5, s.color);
            if (s.pierce-- <= 0) { dead = true; return false; }
            if (s.type === 'moth') s.target = null;
          }
        });
      }
      if (dead) { sh[i] = sh[sh.length - 1]; sh.pop(); }
    }
  };

  P.explode = function (x, y, r, dmg, color) {
    var self = this;
    this.query(x, y, r + 30, function (e) { if (!e.dead && dist2(x, y, e.x, e.y) < (r + e.r) * (r + e.r)) self.dealDamage(e, dmg, 0, 0, 0, 'boom'); });
    this.addFx({ type: 'ring', x: x, y: y, r: r, max: 0.25, life: 0.25, color: color });
  };

  P.updateZones = function (dt) {
    var self = this, p = this.player, zs = this.zones;
    for (var i = zs.length - 1; i >= 0; i--) {
      var z = zs[i];
      z.t += dt;
      if (z.t < 0) continue;
      var k = Math.min(1, z.t / z.dur);
      if (z.type === 'nova') {
        if (z.follow) { z.x = p.x; z.y = p.y; }
        z.r = z.maxR * (0.15 + 0.85 * Math.sqrt(k));
        this.query(z.x, z.y, z.r + 30, function (e) {
          if (e.dead || z.hit.has(e.id)) return;
          var dx = e.x - z.x, dy = e.y - z.y, dd = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dd < z.r + e.r) { z.hit.add(e.id); self.dealDamage(e, z.dmg, dx / dd, dy / dd, LF.WEAPONS.nova.knock * (z.burst ? 1.6 : 1), z.burst ? 'burst' : 'nova'); if (z.stun && !e.boss) e.stun = z.burst ? 0.9 : 0.6; }
        });
        for (var b = this.ebullets.length - 1; b >= 0; b--) { var eb = this.ebullets[b]; if (dist2(eb.x, eb.y, z.x, z.y) < z.r * z.r) { this.ebullets[b] = this.ebullets[this.ebullets.length - 1]; this.ebullets.pop(); } }
      } else if (z.type === 'meteor') {
        if (!z.boomed) {
          z.boomed = true;
          this.query(z.x, z.y, z.r + 30, function (e) { if (!e.dead && dist2(z.x, z.y, e.x, e.y) < (z.r + e.r) * (z.r + e.r)) self.dealDamage(e, z.dmg, 0, 0, 0, 'meteor'); });
          this.burst(z.x, z.y, z.color, 18, 300, 0.55, 3.5);
          this.sparkBurst(z.x, z.y, '#ffe27a', 12, 340, 0.4);
          this.shake = Math.min(10, this.shake + 3.5);
          this.sfx('meteor');
        }
      } else if (z.type === 'shock') {
        z.r = z.maxR * k;
        var dp = Math.sqrt(dist2(p.x, p.y, z.x, z.y));
        if (!z.hitP && Math.abs(dp - z.r) < 18 + p.r) { z.hitP = true; this.hurtPlayer(z.dmg, 'shock'); }
      }
      if (z.t >= z.dur) { zs[i] = zs[zs.length - 1]; zs.pop(); }
    }
  };

  P.updateEBullets = function (dt) {
    var p = this.player, bs = this.ebullets;
    for (var i = bs.length - 1; i >= 0; i--) {
      var b = bs[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      var rr = b.r + p.r - 4;
      var hit = dist2(b.x, b.y, p.x, p.y) < rr * rr;
      if (hit) this.hurtPlayer(b.dmg, 'bullet');
      if (hit || b.life <= 0) { bs[i] = bs[bs.length - 1]; bs.pop(); }
    }
  };

  P.updateGems = function (dt) {
    var p = this.player, gs = this.gems, mr = this.stats.magnet, self = this;
    for (var i = gs.length - 1; i >= 0; i--) {
      var g = gs[i]; g.age += dt;
      var dx = p.x - g.x, dy = p.y - g.y, d2 = dx * dx + dy * dy;
      if (g.kind === 'shrine') {
        if (g.age > 50) { gs[i] = gs[gs.length - 1]; gs.pop(); continue; }
        if (d2 < (p.r + 26) * (p.r + 26)) { this.collect(g); gs[i] = gs[gs.length - 1]; gs.pop(); }
        continue;
      }
      if (!g.pull && d2 < mr * mr) g.pull = true;
      if (g.pull) {
        var d = Math.sqrt(d2) || 1, acc = 1400;
        g.vx += dx / d * acc * dt; g.vy += dy / d * acc * dt;
        var vmax = 520 + p.speedNow, vl = Math.sqrt(g.vx * g.vx + g.vy * g.vy);
        if (vl > vmax) { g.vx *= vmax / vl; g.vy *= vmax / vl; }
        g.x += g.vx * dt; g.y += g.vy * dt;
      }
      if (d2 < (p.r + 10) * (p.r + 10)) { this.collect(g); gs[i] = gs[gs.length - 1]; gs.pop(); }
    }
  };

  P.collect = function (g) {
    var p = this.player;
    if (g.kind === 'xp') {
      p.xp += g.v * this.stats.xp; this.sfx('gem');
      p.light = Math.min(100, p.light + g.v * 0.3);
      while (p.xp >= p.xpNext) { p.xp -= p.xpNext; p.level++; p.xpNext = this.xpFor(p.level); this.pendingLevels++; }
    } else if (g.kind === 'ember') { this.embersFound += g.v; this.sfx('ember'); this.text(p.x, p.y - 24, '+' + g.v + ' ◆', '#ff9a3c'); }
    else if (g.kind === 'heal') { var h = p.maxHp * 0.3; p.hp = Math.min(p.maxHp, p.hp + h); this.text(p.x, p.y - 24, '+' + Math.round(h), '#7dff9a', true); this.sfx('heal'); }
    else if (g.kind === 'magnet') { for (var i = 0; i < this.gems.length; i++) if (this.gems[i].kind === 'xp' || this.gems[i].kind === 'ember') this.gems[i].pull = true; this.sfx('magnet'); }
    else if (g.kind === 'chest') { this.openChest(); }
    else if (g.kind === 'shrine') { this.blessing(); }
  };

  // ---------- light: the core twist ----------
  // The lantern holds up to 100 light. Light slowly refills and grows from every shard.
  // Spending 50 light releases a burst that stuns and clears bullets, but a dimmer lantern sees less.
  LF.BLESSINGS = LF.BLESSINGS || {
    fury: { name: 'Ярость света', desc: '+60% урона на 15 с', t: 15 },
    haste: { name: 'Попутный ветер', desc: '+35% скорости и быстрее перезарядка на 15 с', t: 15 },
    aegis: { name: 'Эгида', desc: 'Неуязвимость 3 с и вдвое меньше урона 15 с', t: 15 },
    lantern: { name: 'Полный фонарь', desc: 'Свет 100%, лечение 25% и сбор всех осколков', t: 0 }
  };
  P.lightFrac = function () { return 0.72 + 0.28 * (this.player.light / 100); };
  P.canBurst = function () { return this.player.light >= 50 && (this.phase === 'run' || this.phase === 'boss'); };
  P.lanternBurst = function () {
    var p = this.player;
    if (!this.canBurst()) return false;
    p.light -= 50;
    var R = 250 * this.stats.area * this.mod.light;
    this.zones.push({ type: 'nova', burst: true, x: p.x, y: p.y, r: 10, maxR: R, t: 0, dur: 0.4, dmg: 22 + 3 * p.level, hit: new Set(), stun: true, follow: true });
    p.invuln = Math.max(p.invuln, 0.4);
    this.flashGold = 0.35; this.shake = Math.min(12, this.shake + 6);
    if (!this.noFx) this.hitStop = Math.max(this.hitStop, 0.04);
    this.burst(p.x, p.y, '#ffe27a', 30, 380, 0.6, 3);
    this.bursts = (this.bursts || 0) + 1;
    this.sfx('burst');
    return true;
  };
  P.blessing = function () {
    var p = this.player, keys = Object.keys(LF.BLESSINGS), k = keys[Math.floor(this.rand() * keys.length)], b = LF.BLESSINGS[k];
    if (k === 'lantern') {
      p.light = 100; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
      for (var i = 0; i < this.gems.length; i++) if (this.gems[i].kind === 'xp' || this.gems[i].kind === 'ember') this.gems[i].pull = true;
    } else {
      p.buffs[k] = b.t;
      if (k === 'aegis') p.invuln = Math.max(p.invuln, 3);
      this.computeStats();
    }
    this.shrines = (this.shrines || 0) + 1;
    this.flashGold = 0.45; this.shake = Math.min(12, this.shake + 6);
    if (!this.noFx) {
      this.addFx({ type: 'pillar', x: p.x, y: p.y, life: 0.65, max: 0.65, color: '#ffe9a8' });
      this.addFx({ type: 'ring', x: p.x, y: p.y, r: 90, max: 0.55, life: 0.55, color: '#fff1b8' });
      this.burst(p.x, p.y, '#fff1b8', 30, 300, 0.65, 3.5);
      this.sparkBurst(p.x, p.y, '#ffe27a', 18, 360, 0.55);
    }
    this.sfx('shrine');
    if (this.hooks.toast) this.hooks.toast('Алтарь: ' + b.name + '. ' + b.desc);
  };
  P.updateBuffs = function (dt) {
    var p = this.player, changed = false;
    for (var k in p.buffs) { if (p.buffs[k] > 0) { p.buffs[k] -= dt; if (p.buffs[k] <= 0) { delete p.buffs[k]; changed = true; } } }
    if (changed) { this.computeStats(); this.sfx('buffend'); }
    p.light = Math.min(100, p.light + 1.0 * dt);
  };

  // stat preview for level-up cards, e.g. "урон 16 → 19"
  P.weaponDelta = function (key, lv) {
    var d = LF.WEAPONS[key], out = [], a = lv - 2, b = lv - 1;
    function fmt(v) { return Math.round(v * 100) / 100; }
    if (a < 0) {
      out.push('урон ' + d.dmg[0]);
      if (d.cd) out.push('раз в ' + fmt(d.cd[0]) + ' с');
      return out.join(' · ');
    }
    var names = { dmg: 'урон', cd: 'перезарядка', count: 'снаряды', pierce: 'пробитие', radius: 'радиус', chains: 'прыжки', length: 'длина', life: 'время' };
    for (var f in names) if (d[f] && d[f][a] !== d[f][b]) out.push(names[f] + ' ' + fmt(d[f][a]) + ' → ' + fmt(d[f][b]));
    return out.slice(0, 3).join(' · ');
  };

  P.openChest = function () {
    var opts = this.buildChoices(1, true);
    var c = opts[0], txt;
    var bonusE = 6 + Math.floor(this.rand() * 8);
    this.embersFound += bonusE;
    if (c) { this.applyChoice(c); txt = c.kind === 'evo' ? ('Эволюция: ' + c.title) : (c.title + (c.lv ? ' ур. ' + c.lv : '')); }
    else { this.player.hp = this.player.maxHp; txt = 'Полное здоровье'; }
    this.flashGold = Math.max(this.flashGold || 0, 0.35); this.shake = Math.min(10, this.shake + 4);
    if (!this.noFx) {
      this.addFx({ type: 'ring', x: this.player.x, y: this.player.y, r: 80, max: 0.5, life: 0.5, color: '#ffd23f' });
      this.sparkBurst(this.player.x, this.player.y, '#ffd23f', 16, 300, 0.5);
    }
    this.sfx('chest');
    if (this.hooks.onChest) this.hooks.onChest(txt + ' и ' + bonusE + ' ◆');
  };

  // ---------- level up choices ----------
  P.buildChoices = function (n, chest) {
    var p = this.player, pool = [], evo = [];
    for (var i = 0; i < p.weapons.length; i++) {
      var w = p.weapons[i], def = LF.WEAPONS[w.key];
      if (w.evo) continue;
      if (w.lv >= 5) { if (p.passives[def.pair]) evo.push({ kind: 'evo', key: w.key, title: def.evo, icon: def.icon, desc: def.evoDesc, color: def.color, w: 100 }); }
      else {
        var pairDef = def.pair && LF.PASSIVES[def.pair];
        var wHint = pairDef ? (p.passives[def.pair] ? '★ Пара собрана: ' + pairDef.name + ' (эволюция на ур. 5)' : 'Эволюция с: ' + pairDef.name) : '';
        pool.push({ kind: 'weapon', key: w.key, lv: w.lv + 1, title: def.name, icon: def.icon, desc: def.desc[w.lv], stat: this.weaponDelta(w.key, w.lv + 1), hint: wHint, color: def.color, w: 3.2 });
      }
    }
    if (p.weapons.length < 5) for (var k = 0; k < LF.WEAPON_KEYS.length; k++) {
      var key = LF.WEAPON_KEYS[k]; if (this.hasWeapon(key)) continue;
      var d2 = LF.WEAPONS[key], pair2 = d2.pair && LF.PASSIVES[d2.pair];
      var wHint2 = pair2 ? (p.passives[d2.pair] ? '★ Пара собрана: ' + pair2.name : 'Эволюция с: ' + pair2.name) : '';
      pool.push({ kind: 'weapon', key: key, lv: 1, isNew: true, title: d2.name, icon: d2.icon, desc: d2.desc[0], stat: this.weaponDelta(key, 1), hint: wHint2, color: d2.color, w: 2 });
    }
    var pc = Object.keys(p.passives).length;
    for (var j = 0; j < LF.PASSIVE_KEYS.length; j++) {
      var pk = LF.PASSIVE_KEYS[j], pd = LF.PASSIVES[pk], lv = p.passives[pk] || 0;
      if (lv >= pd.max) continue;
      if (!lv && pc >= 5) continue;
      var hint = '';
      for (var q = 0; q < p.weapons.length; q++) if (LF.WEAPONS[p.weapons[q].key].pair === pk && !p.weapons[q].evo) hint = 'Нужно для эволюции: ' + LF.WEAPONS[p.weapons[q].key].name;
      pool.push({ kind: 'passive', key: pk, lv: lv + 1, isNew: !lv, title: pd.name, icon: pd.icon, desc: pd.desc, hint: hint, color: '#cfd8ff', w: lv ? 2.4 : 1.5 + (hint ? 1.2 : 0) });
    }
    var out = evo.slice(0, n);
    while (out.length < n && pool.length) {
      var tot = 0; for (var a = 0; a < pool.length; a++) tot += pool[a].w;
      var r = this.rand() * tot;
      for (var b = 0; b < pool.length; b++) { r -= pool[b].w; if (r <= 0) { out.push(pool[b]); pool.splice(b, 1); break; } }
    }
    if (!out.length && !chest) {
      out.push({ kind: 'heal', title: 'Тепло фонаря', icon: '♥', desc: 'Восстановить 40% здоровья', color: '#7dff9a' });
      out.push({ kind: 'embers', title: 'Горсть угольков', icon: '◆', desc: '+15 угольков', color: '#ff9a3c' });
    }
    return out;
  };

  P.applyChoice = function (c) {
    var p = this.player;
    if (c.kind === 'weapon') this.addWeapon(c.key);
    else if (c.kind === 'evo') {
      var w = this.hasWeapon(c.key); w.evo = true; this.evolved++;
      this.flashGold = 0.65;
      if (!this.noFx) {
        this.hitStop = Math.max(this.hitStop, 0.06);
        this.burst(p.x, p.y, '#ffe27a', 36, 320, 0.8, 4);
        this.addFx({ type: 'ring', x: p.x, y: p.y, r: 95, max: 0.6, life: 0.6, color: '#ffe27a' });
      }
      this.sfx('evolve');
    }
    else if (c.kind === 'passive') { p.passives[c.key] = (p.passives[c.key] || 0) + 1; if (c.key === 'heart') p.hp = Math.min(p.maxHp + 20, p.hp + 30); }
    else if (c.kind === 'heal') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4);
    else if (c.kind === 'embers') this.embersFound += 15;
    this.computeStats();
  };

  P.startLevelUp = function () {
    var n = 3 + ((this.meta.choice || 0) > 0 ? 1 : 0);
    this.choices = this.buildChoices(n, false);
    this.phase = 'levelup';
    this.addFx({ type: 'ring', x: this.player.x, y: this.player.y, r: 70, max: 0.5, life: 0.5, color: '#7ad7ff' });
    this.sfx('level');
    if (this.hooks.onLevelUp) this.hooks.onLevelUp(this.choices);
  };
  P.choose = function (i) {
    if (this.phase !== 'levelup' || !this.choices || !this.choices[i]) return;
    this.applyChoice(this.choices[i]);
    this.pendingLevels--;
    this.choices = null;
    this.phase = this.boss ? 'boss' : 'run';
    this.player.invuln = Math.max(this.player.invuln, 0.6);
    // small shockwave so the player is not swarmed right after a menu
    this.zones.push({ type: 'nova', x: this.player.x, y: this.player.y, r: 10, maxR: 90, t: 0, dur: 0.25, dmg: 0, hit: new Set(), follow: true });
  };
  P.reroll = function () {
    if (this.phase !== 'levelup' || this.player.rerolls <= 0) return false;
    this.player.rerolls--;
    var n = 3 + ((this.meta.choice || 0) > 0 ? 1 : 0);
    this.choices = this.buildChoices(n, false);
    if (this.hooks.onLevelUp) this.hooks.onLevelUp(this.choices);
    return true;
  };

  // ---------- main update ----------
  P.update = function (dtRaw) {
    var dt = Math.min(dtRaw, 1 / 20);
    this.realT += dt;
    if (this.phase === 'levelup') return;
    if (this.phase === 'dead' || this.phase === 'won') {
      this.endT += dt;
      this.updateFx(dt * 0.4);
      if (this.phase === 'won') this.updateGems(dt);
      if (this.endT > 1.6 && !this.ended) { this.ended = true; if (this.hooks.onEnd) this.hooks.onEnd(this.result()); }
      return;
    }
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    this.t += dt;
    var p = this.player, s = this.stats;
    // movement
    var ix = this.input.x, iy = this.input.y, il = Math.sqrt(ix * ix + iy * iy);
    if (il > 1) { ix /= il; iy /= il; il = 1; }
    p.moving = il > 0.1;
    if (p.moving) { p.fx = ix / il; p.fy = iy / il; }
    p.speedNow = s.speed * il;
    p.x += ix * s.speed * dt; p.y += iy * s.speed * dt;
    this.resolveObstacles(p, p.r);
    p.anim += dt * (p.moving ? 8 : 3);
    p.invuln -= dt;
    if (s.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + s.regen * dt);
    this.updateBuffs(dt);
    if (p.moving && !this.noFx && this.rand() < 0.35) this.addFx({ type: 'p', x: p.x - p.fx * 10 + (this.rand() - 0.5) * 8, y: p.y + 10, vx: -p.fx * 20, vy: -15, life: 0.5, max: 0.5, color: this.char.color || '#ffe27a', size: 2 });
    this.director(dt);
    this.buildGrid();
    this.updateWeapons(dt);
    this.updateShots(dt);
    this.updateZones(dt);
    this.updateEnemies(dt);
    this.updateEBullets(dt);
    this.updateGems(dt);
    // cleanup
    if (this.enemies.some(function (e) { return e.dead; })) this.enemies = this.enemies.filter(function (e) { return !e.dead; });
    this.updateFx(dt);
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    this.shake = Math.max(0, this.shake - dt * 30); this.flash = Math.max(0, this.flash - dt); this.flashGold = Math.max(0, (this.flashGold || 0) - dt);
    if (this.pendingLevels > 0 && this.phase !== 'dead' && this.phase !== 'won') this.startLevelUp();
  };

  P.updateFx = function (dt) {
    if (this.noFx) return;
    var f = this.fx;
    for (var i = f.length - 1; i >= 0; i--) {
      var o = f[i]; o.life -= dt;
      if (o.type === 'p' || o.type === 'sp') { o.x += o.vx * dt; o.y += o.vy * dt; o.vx *= 0.91; o.vy *= 0.91; }
      if (o.life <= 0) { f[i] = f[f.length - 1]; f.pop(); }
    }
    var tx = this.texts;
    for (var j = tx.length - 1; j >= 0; j--) { tx[j].life -= dt; tx[j].y -= 40 * dt; if (tx[j].life <= 0) tx.splice(j, 1); }
    var bm = this.beams;
    for (var k = bm.length - 1; k >= 0; k--) { bm[k].life -= dt; if (bm[k].life <= 0) bm.splice(k, 1); }
  };

  P.embersEarned = function (won) {
    var base = this.embersFound + Math.floor(this.t / 6) + Math.floor(this.kills / 40);
    if (won) base += 60 * (this.zone.id + 1);
    if (this.zone.endless) base += (this.bossesBeaten || 0) * 80;
    return Math.round(base * this.stats.embers);
  };

  P.result = function () {
    var won = this.phase === 'won';
    return {
      zone: this.zone.id, endless: !!this.zone.endless, won: won, time: this.t, kills: this.kills, level: this.player.level,
      embers: this.embersEarned(won), evolved: this.evolved, weapons: this.player.weapons.length,
      cleanBoss: won && !!this.cleanBoss, dmgBy: this.dmgBy, bursts: this.bursts || 0, shrines: this.shrines || 0,
      difficulty: this.opts.difficulty || 'normal', challenge: !!this.opts.mods, build: this.player.weapons.map(function (w) { return (w.evo ? LF.WEAPONS[w.key].evo : LF.WEAPONS[w.key].name) + (w.evo ? '' : ' ' + w.lv); })
    };
  };

  root.LFGame = Game;
  if (typeof module !== 'undefined') module.exports = Game;
})(typeof window !== 'undefined' ? window : globalThis);
