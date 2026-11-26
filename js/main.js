// Lanternfall: app shell (save, screens, input, loop, HUD)
(function () {
  var LF = window.LF, Audio = window.LFAudio;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ctx = canvas.getContext('2d');
  var SAVE_KEY = 'lanternfall_save_v1';
  var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  // ---------------- save ----------------
  var memoryStore = null;
  function defaults() {
    return { v: 1, embers: 0, meta: {}, cleared: [false, false, false, false, false], best: {}, ach: {}, char: 'keeper',
      stats: { kills: 0, runs: 0, wins: 0, time: 0, embersTotal: 0, bestLevel: 0, endlessBest: 0 },
      settings: { music: 50, sfx: 70, shake: !reducedMotion, numbers: true, difficulty: 'normal', fps: false, vibrate: true, muted: false, preview: false },
      seenHint: false, seenBurstTip: false, activeRun: null, lastZone: 0, endlessTop: [], daily: {} };
  }
  var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = memoryStore; }
    var d = defaults();
    if (!raw) return d;
    try {
      var s = JSON.parse(raw);
      for (var k in d) if (!(k in s)) s[k] = d[k];
      for (var k2 in d.stats) if (!(k2 in s.stats)) s.stats[k2] = d.stats[k2];
      for (var k3 in d.settings) if (!(k3 in s.settings)) s.settings[k3] = d.settings[k3];
      if (!Array.isArray(s.cleared) || s.cleared.length !== 5) s.cleared = d.cleared;
      if (typeof s.embers !== 'number' || !isFinite(s.embers) || s.embers < 0) s.embers = 0;
      if (!s.meta || typeof s.meta !== 'object') s.meta = {};
      if (!s.ach || typeof s.ach !== 'object') s.ach = {};
      if (!s.best || typeof s.best !== 'object') s.best = {};
      if (!Array.isArray(s.endlessTop)) s.endlessTop = [];
      if (!s.daily || typeof s.daily !== 'object') s.daily = {};
      if (!LF.DIFFICULTY[s.settings.difficulty]) s.settings.difficulty = 'normal';
      if (!s.migrated11) { // keep a copy of the old save before the first write of the new version
        try { localStorage.setItem(SAVE_KEY + '_backup', raw); } catch (e2) {}
        s.migrated11 = true;
      }
      return s;
    } catch (e) {
      try { localStorage.setItem(SAVE_KEY + '_broken', raw); } catch (e3) {}
      return d;
    }
  }
  var save = load();
  function persist() {
    var raw = JSON.stringify(save);
    try { localStorage.setItem(SAVE_KEY, raw); } catch (e) { memoryStore = raw; }
  }

  // ---------------- view / resize ----------------
  var view = { cw: 0, ch: 0, dpr: 1, scale: 1, lightmap: document.createElement('canvas') };
  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.75 : 2, view.dprCap || 9);
    view.cw = w; view.ch = h; view.dpr = dpr;
    view.scale = Math.max(0.7, Math.min(1.35, Math.sqrt(w * h) / 960));
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    view.lightmap.width = Math.max(1, Math.round(w / 2)); view.lightmap.height = Math.max(1, Math.round(h / 2));
    if (game) game.view = { w: w / view.scale, h: h / view.scale };
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });

  // ---------------- screens ----------------
  var current = 'title', prevScreen = 'title';
  var SCREENS = ['title', 'map', 'altar', 'ach', 'how', 'settings', 'level', 'pause', 'result', 'confirm', 'codex'];
  function show(name) {
    if (name === 'settings' && current !== 'confirm' && current !== 'settings') prevScreen = current === 'pause' ? 'pause' : 'title';
    SCREENS.forEach(function (s) { $('scr-' + s).classList.toggle('hidden', s !== name); });
    current = name;
    if (name === 'title' || name === 'map' || name === 'altar') refreshEmbers();
    if (name === 'title') renderTitle();
    if (name === 'codex') renderCodex();
    if (name === 'pause' || name === 'settings') Audio.duck(true); else if (name === 'level') Audio.duck(false);
    if (name === 'map') renderMap();
    if (name === 'altar') renderAltar();
    if (name === 'ach') renderAch();
    if (name === 'settings') renderSettings();
  }
  function hideAll() { SCREENS.forEach(function (s) { $('scr-' + s).classList.add('hidden'); }); current = 'none'; Audio.duck(false); }
  document.querySelectorAll('[data-go]').forEach(function (b) { b.addEventListener('click', function () { Audio.unlock(); Audio.play('click'); show(b.getAttribute('data-go')); if (!game) Audio.music('menu'); }); });
  document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { Audio.play('click'); show(game && paused ? 'pause' : 'title'); }); });
  function refreshEmbers() { document.querySelectorAll('.embers-val').forEach(function (e) { e.textContent = Math.floor(save.embers); }); }
  $('ver').textContent = LF.VERSION;

  function fmtTime(s) { s = Math.max(0, Math.floor(s)); var m = Math.floor(s / 60), r = s % 60; return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r; }
  // pixel-art icon from the atlas, falls back to crisp inline SVG (zero OS emojis)
  var META_ICON = { hp: 'heart', dmg: 'might', cd: 'echo', speed: 'wind', magnet: 'magnet', xp: 'luck', armor: 'armor', regen: 'regen', choice: 'multi' };
  var UI_SVG = {
    ember: '<svg class="ui-svg ember" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5L13 8l-5 6.5L3 8z"/><path fill="#fff3c4" opacity=".65" d="M8 3.6L10.6 8 8 10.6 5.4 8z"/></svg>',
    burst: '<svg class="ui-svg gold" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1l1.8 4.6L14.5 7.5 9.8 9.4 8 14.5 6.2 9.4 1.5 7.5l4.7-1.9z"/></svg>',
    lock: '<svg class="ui-svg muted" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5 7V5a3 3 0 0 1 6 0v2h1.5v7h-9V7H5zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2z"/></svg>',
    sun: '<svg class="ui-svg gold" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.4" fill="currentColor"/><path stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M8 1.4v1.8M8 12.8v1.8M1.4 8h1.8M12.8 8h1.8M3.3 3.3l1.3 1.3M11.4 11.4l1.3 1.3M12.7 3.3l-1.3 1.3M4.6 11.4l-1.3 1.3"/></svg>',
    fury: '<svg class="ui-svg fury" viewBox="0 0 16 16" aria-hidden="true"><path fill="#ff6b4a" d="M8.5 1.5c.6 2.7-1.6 3.7-1.2 5.7.3 1.1 1.4 1.6 2 .5.5-.9.3-2 .3-2 1.8 1.2 2.9 3.1 2.9 5.1A4.5 4.5 0 0 1 8 15a4.5 4.5 0 0 1-4.5-4.3c0-3.2 2.5-5.6 5-9.2z"/><path fill="#ffe27a" d="M8 8.2c1.2 1.1 1.9 2.2 1.9 3.4A1.9 1.9 0 0 1 8 13.5a1.9 1.9 0 0 1-1.9-1.9c0-1.2.8-2.3 1.9-3.4z"/></svg>',
    haste: '<svg class="ui-svg haste" viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="#c6ff8a" stroke-width="1.8" stroke-linecap="round" d="M2 5.5h8.5a2 2 0 1 0-2-2M2 8.5h11a1.8 1.8 0 1 1-1.8 1.8M2 11.5h6"/></svg>',
    aegis: '<svg class="ui-svg aegis" viewBox="0 0 16 16" aria-hidden="true"><path fill="#9ff3ff" d="M8 1.5l5.5 2.2v4.1c0 3.3-2.3 5.8-5.5 6.9-3.2-1.1-5.5-3.6-5.5-6.9V3.7L8 1.5z"/><path fill="#0d1a28" opacity=".4" d="M8 3.2v9.6c2.2-.9 3.8-2.8 3.8-5V4.8L8 3.2z"/></svg>',
    reroll: '<svg class="ui-svg gold" viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M13 8a5 5 0 1 1-1.5-3.6"/><path fill="currentColor" d="M12.8 1.8l.4 3.7-3.6-.8z"/></svg>',
    revive: '<svg class="ui-svg revive" viewBox="0 0 16 16" aria-hidden="true"><path fill="#ff7a8a" d="M8 14s-5.5-3.4-5.5-7.4A3.1 3.1 0 0 1 8 4.6a3.1 3.1 0 0 1 5.5 2C13.5 10.6 8 14 8 14z"/><path fill="#fff3c4" d="M7.1 5.5h1.8v2h2v1.8h-2v2H7.1v-2h-2V7.5h2z"/></svg>',
    check: '<svg class="ui-svg gold" viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M3 8.5l3.2 3.2L13 4.5"/></svg>',
    play: '<svg class="ui-svg" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2.5l9.5 5.5L4 13.5z"/></svg>',
    star: '<svg class="ui-svg gold" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5l2 4.2 4.6.6-3.3 3.2.8 4.6L8 11.9 3.9 14.1l.8-4.6L1.4 6.3 6 5.7z"/></svg>'
  };
  var META_SVG = { embers: 'ember', reroll: 'reroll', revive: 'revive' };
  function uiSvg(name, cls) { return (UI_SVG[name] || '').replace('class="ui-svg', 'class="ui-svg ' + (cls || '')); }
  function ico(key, glyph, size) { var S = window.LFSprites, h = S && S.iconHtml && key ? S.iconHtml(key, size) : null; return h || glyph; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------------- map ----------------
  function charUnlocked(c) {
    if (!c.unlock || save.settings.preview) return true;
    if (c.unlock.type === 'clear') return !!save.cleared[c.unlock.zone];
    if (c.unlock.type === 'kills') return save.stats.kills >= c.unlock.value;
    return false;
  }
  function zoneUnlocked(i) { return i === 0 || !!save.settings.preview || !!save.cleared[i - 1]; }
  var BOSS_HINTS = [ // match the real boss patterns in data.js
    'Пускает кольца снарядов и зовет слуг. Ищи просветы в кольце',
    'Крутит спирали и исчезает, чтобы появиться рядом. Двигайся по кругу',
    'Бросается в рывок и бьет ударной волной. Отходи вбок, а не назад',
    'Быстрый: спирали, рывки и прицельные залпы. Вспышка фонаря гасит снаряды',
    'Меняет все атаки и злеет на половине здоровья. Береги вспышку на эту фазу'
  ];
  function dayKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function hashStr(t) { var h = 2166136261; for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function dailyInfo() {
    var h = hashStr('lf' + dayKey()), maxZone = 0;
    for (var i = 0; i < 5; i++) if (zoneUnlocked(i)) maxZone = i;
    return { key: dayKey(), seed: h, ch: LF.CHALLENGES[h % LF.CHALLENGES.length], zone: maxZone === 0 ? 0 : (h >>> 4) % (maxZone + 1), done: !!save.daily[dayKey()] };
  }
  function renderMap() {
    var ch = $('chars'); ch.innerHTML = '';
    LF.CHARACTERS.forEach(function (c) {
      var un = charUnlocked(c), w = LF.WEAPONS[c.weapon];
      var b = document.createElement('button');
      b.className = 'char' + (save.char === c.id ? ' sel' : '') + (un ? '' : ' locked');
      b.innerHTML = '<div class="char-art"><img src="assets/art/char-' + c.id + '.jpg?v=' + LF.VERSION + '" alt="' + esc(c.name) + '">' + (un ? '' : '<span class="char-lock">' + uiSvg('lock') + '</span>') + '</div>' +
        '<div class="char-info"><b style="color:' + c.color + '">' + esc(c.name) + '</b><small>' + (un ? '<span class="char-w">' + ico(c.weapon, w.icon, 16) + ' ' + esc(w.name) + '</span><span class="char-b">' + esc(c.bonus) + '</span>' : esc(c.unlock.text)) + '</small></div>';
      b.addEventListener('click', function () { if (!un) { Audio.play('deny'); return; } Audio.play('click'); save.char = c.id; persist(); renderMap(); });
      ch.appendChild(b);
    });
    var dc = $('daily'); dc.innerHTML = '';
    if (save.cleared[0] || save.settings.preview) {
      var di = dailyInfo(), dz = LF.ZONES[di.zone];
      var db = document.createElement('button'); db.className = 'zone daily';
      db.innerHTML = '<h3>' + uiSvg('sun') + ' Испытание дня: ' + esc(di.ch.name) + '</h3><p>' + esc(di.ch.desc) + '</p><p>Земля: ' + esc(dz.name) + '. Первая победа за день: +' + uiSvg('ember', 'sm') + ' 100</p>' +
        '<div class="meta"><span class="tag">' + (di.done ? uiSvg('check', 'sm') + ' Сегодня пройдено' : 'Новое каждый день') + '</span></div>';
      db.addEventListener('click', function () { Audio.play('click'); startRun(di.zone, { daily: di }); });
      dc.appendChild(db);
    } else dc.innerHTML = '<p class="muted small">Испытание дня откроется после победы в Тихой роще</p>';
    if (save.settings.preview) {
      var pn = document.createElement('div'); pn.className = 'preview-note';
      pn.textContent = 'Режим обзора включен: открыты все земли и хранители (выключить можно в Настройках)';
      dc.appendChild(pn);
    }
    var zs = $('zones'); zs.innerHTML = '';
    var list = LF.ZONES.slice(); list.push(LF.ENDLESS);
    list.forEach(function (z, i) {
      var un = z.endless ? (!!save.cleared[4] || !!save.settings.preview) : zoneUnlocked(i);
      var b = document.createElement('button');
      b.className = 'zone biome-card' + (un ? '' : ' locked');
      b.style.backgroundImage = 'url(assets/art/biome' + (z.endless ? 5 : i) + '.jpg?v=' + LF.VERSION + ')';
      b.style.borderColor = un ? R2(z.pal.accent, 0.42) : '';
      var best = save.best[z.id], tags = [];
      if (z.endless) { tags.push('Рекорд: ' + (save.stats.endlessBest ? fmtTime(save.stats.endlessBest) : 'нет')); tags.push(uiSvg('ember', 'sm') + ' x' + z.embers); if (save.endlessTop.length > 1) tags.push('Топ: ' + save.endlessTop.slice(0, 5).map(fmtTime).join(', ')); }
      else {
        tags.push(save.cleared[i] ? uiSvg('check', 'sm') + ' Пройдено' : 'Не пройдено');
        tags.push('Угроза ' + (i + 1) + '/5');
        tags.push(uiSvg('ember', 'sm') + ' x' + z.embers);
        if (best) tags.push('Лучшее: ' + fmtTime(best));
      }
      b.innerHTML = '<div class="zone-in"><h3 style="color:' + z.pal.accent + '">' + (un ? '' : uiSvg('lock', 'sm') + ' ') + esc(z.name) + '</h3><p>' + esc(z.sub) + (z.endless ? '' : ' · Босс: ' + esc(z.boss.name)) + '</p>' +
        (un && !z.endless ? '<p class="bhint">' + esc(BOSS_HINTS[i] || '') + '</p>' : '') +
        (un ? '' : '<p class="lock">Откроется после победы: ' + (z.endless ? 'Сердце Тьмы' : esc(LF.ZONES[i - 1].name)) + '</p>') +
        '<div class="meta">' + tags.map(function (t) { return '<span class="tag">' + t + '</span>'; }).join('') + '</div></div>';
      b.addEventListener('click', function () { if (!un) { Audio.play('deny'); return; } Audio.play('click'); startRun(z.endless ? 5 : i); });
      zs.appendChild(b);
    });
  }
  function R2(hex, a) { return window.LFRender.hexA(hex, a); }

  // ---------------- title / codex ----------------
  function renderTitle() {
    var q = $('quick'), z = save.lastZone | 0, can = save.stats.runs > 0 && (z === 5 ? (!!save.cleared[4] || !!save.settings.preview) : zoneUnlocked(z));
    q.classList.toggle('hidden', !can);
    if (can) q.innerHTML = uiSvg('play', 'sm') + ' Продолжить: ' + esc(z === 5 ? LF.ENDLESS.name : LF.ZONES[z].name);
  }
  $('quick').addEventListener('click', function () { Audio.unlock(); Audio.play('click'); startRun(save.lastZone | 0); });
  function renderCodex() {
    var h = '<div class="sect">Оружие</div><div class="codex">';
    Object.keys(LF.WEAPONS).forEach(function (k) {
      var w = LF.WEAPONS[k], pair = w.pair && LF.PASSIVES[w.pair];
      h += '<div class="cx"><b style="color:' + w.color + '">' + ico(k, w.icon, 24) + ' ' + esc(w.name) + '</b><small>' + esc(w.desc[0]) + '</small>' +
        '<small class="evo">★ ' + esc(w.evo) + (pair ? ': ур. 5 + ' + ico(w.pair, pair.icon, 16) + ' ' + esc(pair.name) : '') + '</small></div>';
    });
    h += '</div><div class="sect">Усиления</div><div class="codex">';
    Object.keys(LF.PASSIVES).forEach(function (k) { var p = LF.PASSIVES[k]; h += '<div class="cx"><b>' + ico(k, p.icon, 24) + ' ' + esc(p.name) + '</b><small>' + esc(p.desc || '') + '</small></div>'; });
    h += '</div><div class="sect">Благословения алтарей</div><div class="codex">';
    Object.keys(LF.BLESSINGS).forEach(function (k) { var b = LF.BLESSINGS[k]; h += '<div class="cx"><b>✧ ' + esc(b.name) + '</b><small>' + esc(b.desc) + '</small></div>'; });
    h += '</div><div class="sect">Боссы</div><div class="codex">';
    LF.ZONES.forEach(function (z, i) {
      var seen = save.cleared[i] || zoneUnlocked(i);
      h += '<div class="cx' + (seen ? '' : ' locked') + '"><b style="color:' + z.pal.accent + '">' + (seen ? esc(z.boss.name) : '???') + '</b><small>' + (seen ? esc(z.name) + '. ' + esc(BOSS_HINTS[i]) : 'Откроется позже') + '</small></div>';
    });
    $('codexbox').innerHTML = h + '</div>';
  }

  // ---------------- altar ----------------
  function renderAltar() {
    var box = $('metas'); box.innerHTML = '';
    LF.META_KEYS.forEach(function (k) {
      var m = LF.META[k], rank = save.meta[k] || 0, maxed = rank >= m.max, cost = maxed ? 0 : LF.metaCost(k, rank);
      var d = document.createElement('div'); d.className = 'meta-c';
      var pips = ''; for (var i = 0; i < m.max; i++) pips += '<div class="pip' + (i < rank ? ' on' : '') + '"></div>';
      d.innerHTML = '<div class="t"><span>' + (META_SVG[k] ? uiSvg(META_SVG[k], 'lg') : ico(META_ICON[k], m.icon, 26)) + '</span>' + esc(m.name) + '</div><div class="d">' + esc(m.desc) + '</div><div class="pips">' + pips + '</div>';
      var b = document.createElement('button'); b.className = 'btn' + (!maxed && save.embers >= cost ? ' primary' : '');
      b.innerHTML = maxed ? 'Максимум' : 'Купить за ' + uiSvg('ember', 'sm') + ' ' + cost;
      b.disabled = maxed || save.embers < cost;
      b.addEventListener('click', function () {
        if (maxed || save.embers < cost) { Audio.play('deny'); return; }
        save.embers -= cost; save.meta[k] = rank + 1; persist(); Audio.play('buy'); refreshEmbers(); renderAltar();
      });
      d.appendChild(b); box.appendChild(d);
    });
  }
  $('refund').addEventListener('click', function () {
    var total = 0;
    LF.META_KEYS.forEach(function (k) { for (var r = 0; r < (save.meta[k] || 0); r++) total += LF.metaCost(k, r); });
    if (!total) { Audio.play('deny'); return; }
    confirmBox('Вернуть угольки?', 'Все улучшения сбросятся, вернется ◆ ' + total + '. Можно сразу перераспределить', function () {
      save.embers += total; save.meta = {}; persist(); show('altar');
    }, function () { show('altar'); });
  });

  // ---------------- achievements ----------------
  function renderAch() {
    var box = $('achs'); box.innerHTML = '';
    LF.ACHIEVEMENTS.forEach(function (a) {
      var d = document.createElement('div'); d.className = 'ach' + (save.ach[a.id] ? ' done' : '');
      d.innerHTML = '<b>' + (save.ach[a.id] ? uiSvg('check', 'sm') + ' ' : '') + esc(a.name) + '</b><small>' + esc(a.desc) + ' · ' + uiSvg('ember', 'sm') + ' ' + a.reward + '</small>';
      box.appendChild(d);
    });
    var s = save.stats;
    $('statsbox').innerHTML = ['Забегов: ' + s.runs, 'Побед над боссами: ' + s.wins, 'Врагов побеждено: ' + s.kills, 'Время в игре: ' + fmtTime(s.time), 'Угольков собрано: ' + s.embersTotal, 'Лучший уровень: ' + s.bestLevel, 'Вспышек фонаря: ' + (s.bursts || 0), 'Благословений: ' + (s.shrines || 0)]
      .map(function (t) { return '<div>' + t + '</div>'; }).join('');
  }

  // ---------------- settings ----------------
  function renderSettings() {
    $('set-music').value = save.settings.music; $('set-sfx').value = save.settings.sfx;
    $('set-shake').checked = save.settings.shake; $('set-numbers').checked = save.settings.numbers;
    $('set-fps').checked = !!save.settings.fps; $('set-vibrate').checked = save.settings.vibrate !== false;
    $('set-diff').value = save.settings.difficulty || 'normal';
    $('set-preview').checked = !!save.settings.preview;
    $('save-io').value = '';
  }
  $('set-fps').addEventListener('change', function (e) { save.settings.fps = e.target.checked; $('fps').classList.toggle('hidden', !e.target.checked); persist(); });
  $('set-vibrate').addEventListener('change', function (e) { save.settings.vibrate = e.target.checked; persist(); });
  $('set-diff').addEventListener('change', function (e) { save.settings.difficulty = LF.DIFFICULTY[e.target.value] ? e.target.value : 'normal'; persist(); });
  $('set-preview').addEventListener('change', function (e) { save.settings.preview = e.target.checked; persist(); });
  function exportCode() { var j = JSON.stringify(save); return btoa(unescape(encodeURIComponent(j))); }
  $('save-export').addEventListener('click', function () {
    var code = exportCode(); $('save-io').value = code; $('save-io').select();
    try { navigator.clipboard.writeText(code).then(function () { toastMenu('Код сохранения скопирован'); }, function () { toastMenu('Скопируй код из поля'); }); } catch (e) { toastMenu('Скопируй код из поля'); }
  });
  $('save-import').addEventListener('click', function () {
    var code = $('save-io').value.trim(); if (!code) { toastMenu('Вставь код в поле'); return; }
    var data = null; try { data = JSON.parse(decodeURIComponent(escape(atob(code)))); } catch (e) {}
    if (!data || typeof data !== 'object' || data.v !== 1 || !Array.isArray(data.cleared)) { Audio.play('deny'); toastMenu('Код не подошел'); return; }
    confirmBox('Загрузить сохранение?', 'Текущий прогресс заменится прогрессом из кода', function () {
      try { localStorage.setItem(SAVE_KEY + '_backup', JSON.stringify(save)); localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { memoryStore = JSON.stringify(data); }
      save = load(); persist(); applyVolumes(); show('title'); toastMenu('Сохранение загружено');
    }, function () { show('settings'); });
  });
  function toastMenu(t) { var d = document.createElement('div'); d.className = 'toast menu-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2700); }
  function applyVolumes() { Audio.setVolumes(save.settings.music / 100, save.settings.sfx / 100); }
  $('set-music').addEventListener('input', function (e) { save.settings.music = +e.target.value; applyVolumes(); persist(); });
  $('set-sfx').addEventListener('input', function (e) { save.settings.sfx = +e.target.value; applyVolumes(); persist(); });
  $('set-sfx').addEventListener('change', function () { Audio.unlock(); Audio.play('gem'); });
  $('set-shake').addEventListener('change', function (e) { save.settings.shake = e.target.checked; persist(); });
  $('set-numbers').addEventListener('change', function (e) { save.settings.numbers = e.target.checked; persist(); });
  $('reset').addEventListener('click', function () {
    confirmBox('Сбросить прогресс?', 'Угольки, улучшения, земли и достижения удалятся без возврата', function () {
      var st = save.settings; save = defaults(); save.settings = st; persist(); show('title');
    }, function () { show('settings'); });
  });
  applyVolumes();

  var confirmCb = null, cancelCb = null;
  function confirmBox(title, text, yes, no) { $('conf-title').textContent = title; $('conf-text').textContent = text; confirmCb = yes; cancelCb = no; show('confirm'); }
  $('conf-yes').addEventListener('click', function () { Audio.play('click'); var c = confirmCb; confirmCb = null; if (c) c(); });
  $('conf-no').addEventListener('click', function () { Audio.play('click'); var c = cancelCb; cancelCb = null; if (c) c(); });

  // ---------------- input ----------------
  var keys = {};
  var joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, R: 64 };
  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0 && game) e.preventDefault();
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'KeyF') toggleFullscreen();
    if (!game || current === 'result') {
      if (e.code === 'Enter') {
        if (current === 'title') { if (!$('quick').classList.contains('hidden')) $('quick').click(); else show('map'); }
        else if (current === 'result') { if (!$('res-next').classList.contains('hidden')) $('res-next').click(); else $('res-again').click(); }
        else if (current === 'confirm') $('conf-yes').click();
      }
      if (e.code === 'Escape') {
        if (current === 'confirm') $('conf-no').click();
        else if (current === 'result') $('res-menu').click();
        else if (current !== 'title' && current !== 'none') { Audio.play('click'); show('title'); }
      }
      return;
    }
    if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && current === 'none' && !e.repeat) tryBurst();
    if (current === 'confirm') { if (e.code === 'Enter') $('conf-yes').click(); return; }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (current === 'pause') resume(); else if (current === 'none') pause(); else if (current === 'settings' && paused) show('pause');
    }
    if (current === 'level') {
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4) pickCard(n - 1);
      if (e.code === 'KeyR') doReroll();
    }
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; joy.active = false; if (game && current === 'none') pause(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { keys = {}; joy.active = false; if (game && current === 'none') pause(); Audio.suspend(); }
    else Audio.resume();
  });
  canvas.addEventListener('pointerdown', function (e) {
    Audio.unlock();
    if (!game || current !== 'none') return;
    if (joy.active && e.pointerId !== joy.id) return;
    joy.active = true; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.dx = 0; joy.dy = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    var dx = e.clientX - joy.ox, dy = e.clientY - joy.oy, d = Math.sqrt(dx * dx + dy * dy);
    if (d > joy.R) { // drag the base along so the stick never feels stuck
      joy.ox = e.clientX - dx / d * joy.R; joy.oy = e.clientY - dy / d * joy.R; dx = e.clientX - joy.ox; dy = e.clientY - joy.oy; d = joy.R;
    }
    joy.dx = dx / joy.R; joy.dy = dy / joy.R;
  });
  function endJoy(e) { if (e.pointerId === joy.id) { joy.active = false; joy.dx = joy.dy = 0; } }
  canvas.addEventListener('pointerup', endJoy); canvas.addEventListener('pointercancel', endJoy); canvas.addEventListener('lostpointercapture', endJoy);
  document.addEventListener('contextmenu', function (e) { if (game) e.preventDefault(); });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });

  var padPauseWas = false, padBurstWas = false;
  function tryBurst() {
    if (!game || current !== 'none') return;
    if (game.lanternBurst()) { save.seenBurstTip = true; vibrate(25); } else Audio.play('deny');
  }
  var SVG_SND_ON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 6h3l4-3.2v10.4L5 10H2V6zm9.2-.8a4 4 0 0 1 0 5.6l-1-1a2.6 2.6 0 0 0 0-3.6l1-1zm1.9-1.9a6.6 6.6 0 0 1 0 9.4l-1-1a5.2 5.2 0 0 0 0-7.4l1-1z"/></svg>';
  var SVG_SND_OFF = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 6h3l4-3.2v10.4L5 10H2V6zm8.8.4l1.1-1.1 1.6 1.6 1.6-1.6 1.1 1.1-1.6 1.6 1.6 1.6-1.1 1.1-1.6-1.6-1.6 1.6-1.1-1.1 1.6-1.6-1.6-1.6z"/></svg>';
  function syncMuteIcons(m) { var h = m ? SVG_SND_OFF : SVG_SND_ON; $('mutebtn').innerHTML = h; $('title-mute').innerHTML = h; }
  function vibrate(p) { if (save.settings.vibrate !== false && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} }
  function toggleMute() { var m = Audio.toggleMute(); save.settings.muted = m; persist(); syncMuteIcons(m); }
  function toggleFullscreen() {
    var d = document, el = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else if (el.requestFullscreen) el.requestFullscreen().catch(function () {}); else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) {}
  }
  function readInput() {
    if (window.__lfBot && game) return window.__lfBot(game);
    var x = 0, y = 0;
    if (keys.KeyA || keys.ArrowLeft) x -= 1; if (keys.KeyD || keys.ArrowRight) x += 1;
    if (keys.KeyW || keys.ArrowUp) y -= 1; if (keys.KeyS || keys.ArrowDown) y += 1;
    if (x || y) { var l = Math.sqrt(x * x + y * y); x /= l; y /= l; }
    if (joy.active) { var m = Math.sqrt(joy.dx * joy.dx + joy.dy * joy.dy); if (m > 0.12) { x = joy.dx; y = joy.dy; } }
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < pads.length; i++) {
      var gp = pads[i]; if (!gp) continue;
      var ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.sqrt(ax * ax + ay * ay) > 0.2) { x = ax; y = ay; }
      if (gp.buttons[14] && gp.buttons[14].pressed) x = -1; if (gp.buttons[15] && gp.buttons[15].pressed) x = 1;
      if (gp.buttons[12] && gp.buttons[12].pressed) y = -1; if (gp.buttons[13] && gp.buttons[13].pressed) y = 1;
      var st = gp.buttons[9] && gp.buttons[9].pressed;
      if (st && !padPauseWas) { if (current === 'none') pause(); else if (current === 'pause') resume(); }
      padPauseWas = st;
      var bb = (gp.buttons[0] && gp.buttons[0].pressed) || (gp.buttons[7] && gp.buttons[7].pressed);
      if (bb && !padBurstWas && current === 'none') tryBurst();
      padBurstWas = bb;
      if (current === 'level') for (var b = 0; b < 4; b++) if (gp.buttons[b] && gp.buttons[b].pressed && performance.now() - cardsShownAt > 500) pickCard(b);
      break;
    }
    return { x: x, y: y };
  }

  // ---------------- run lifecycle ----------------
  var game = null, paused = false, zoneIdx = 0, saveTick = 0, hintTimer = 0;
  var runDaily = null, heartT = 0, tipStage = 0;
  function startRun(zi, extra) {
    Audio.unlock();
    zoneIdx = zi; extra = extra || {};
    runDaily = extra.daily || null;
    var zone = zi === 5 ? LF.ENDLESS : LF.ZONES[zi];
    var ch = LF.CHARACTERS.filter(function (c) { return c.id === save.char && charUnlocked(c); })[0] || LF.CHARACTERS[0];
    var gopts = { zone: zone, character: ch, meta: save.meta, hooks: hooks, difficulty: save.settings.difficulty };
    if (runDaily) { gopts.mods = runDaily.ch.mods; gopts.rand = LF.mulberry32(runDaily.seed); }
    game = new window.LFGame(gopts);
    save.lastZone = zi;
    tipStage = 0;
    resize();
    paused = false; joy.active = false; keys = {};
    save.activeRun = { zone: zi, embers: 0, t: Date.now() }; persist();
    hideAll(); $('hud').classList.remove('hidden'); $('hud').classList.remove('boss-active'); $('bossbar').classList.add('hidden'); $('bossbar').classList.remove('enraged'); $('toasts').innerHTML = '';
    $('timer').classList.remove('boss');
    Audio.music('z' + zi);
    lastHud = {};
    toast((runDaily ? 'Испытание дня: ' + runDaily.ch.name + ' · ' : '') + zone.name + (zone.endless ? '' : ' · босс через 5:00'));
    if (!save.seenHint) {
      var h = $('hint'); h.textContent = isTouch ? 'Веди пальцем по экрану, чтобы двигаться. Атака сама' : 'WASD или стрелки, чтобы двигаться. Атака сама';
      h.classList.remove('hidden'); hintTimer = 7;
    }
  }
  var hooks = {
    sfx: function (n) { Audio.play(n); if (n === 'hurt') vibrate(20); else if (n === 'boss') vibrate([80, 60, 120]); else if (n === 'evolve' || n === 'bosskill') vibrate(60); },
    toast: function (t) { toast(t); },
    onChest: function (t) { toast('Сундук: ' + t); },
    onBoss: function (def) { $('bossname').textContent = def.name; $('bossbar').classList.remove('hidden'); $('bossbar').classList.remove('enraged'); $('hud').classList.add('boss-active'); $('timer').classList.add('boss'); Audio.music('boss'); toast(def.name + ' пробуждается!'); },
    onLevelUp: function (choices) { showCards(choices); },
    onEnd: function (res) { finishRun(res); }
  };
  function showHint(t, sec) { var h = $('hint'); h.textContent = t; h.classList.remove('hidden'); hintTimer = sec; }
  function toast(t) {
    var box = $('toasts'), maxT = (view.ch < 500 || (game && game.boss)) ? 1 : 2;
    while (box.children.length >= maxT) box.removeChild(box.firstChild);
    var d = document.createElement('div'); d.className = 'toast'; d.textContent = t; box.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 2700);
  }
  function pause() {
    if (!game || game.phase === 'dead' || game.phase === 'won') return;
    paused = true; joy.active = false;
    var b = $('pausebuild'); b.innerHTML = game.player.weapons.map(function (w) { var d = LF.WEAPONS[w.key]; return '<span>' + ico(w.key, d.icon, 18) + ' ' + esc(w.evo ? d.evo : d.name + ' ' + w.lv) + '</span>'; }).join('') +
      Object.keys(game.player.passives).map(function (k) { return '<span>' + ico(k, LF.PASSIVES[k].icon, 18) + ' ' + esc(LF.PASSIVES[k].name) + ' ' + game.player.passives[k] + '</span>'; }).join('');
    var st = game.stats;
    $('pausestats').innerHTML = ['Время ' + fmtTime(game.t), 'Врагов ' + game.kills, 'Урон x' + st.dmg.toFixed(2), 'Перезарядка x' + st.cd.toFixed(2), 'Свет ' + Math.floor(game.player.light) + '%']
      .map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + (runDaily ? '<span>☀ ' + esc(runDaily.ch.name) + '</span>' : '') + (save.settings.difficulty === 'easy' ? '<span>Легкая сложность</span>' : '');
    show('pause');
  }
  function resume() { if (!game) return; paused = false; hideAll(); if (game.phase === 'levelup') showCards(game.choices); }
  $('pausebtn').addEventListener('click', function () { if (current === 'none') pause(); });
  $('mutebtn').addEventListener('click', function () { toggleMute(); });
  $('burstbtn').addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); tryBurst(); });
  $('title-mute').addEventListener('click', function () { Audio.unlock(); toggleMute(); });
  $('title-fs').addEventListener('click', toggleFullscreen);
  $('resume').addEventListener('click', function () { Audio.play('click'); resume(); });
  $('pause-settings').addEventListener('click', function () { Audio.play('click'); show('settings'); });
  $('quit').addEventListener('click', function () {
    confirmBox('Сдаться?', 'Забег закончится, собранные угольки останутся', function () { if (!game) return; game.phase = 'dead'; finishRun(game.result()); }, function () { show('pause'); });
  });

  var cardsShownAt = 0;
  function showCards(choices) {
    joy.active = false;
    var box = $('cards'); box.innerHTML = '';
    choices.forEach(function (c, i) {
      var b = document.createElement('button');
      b.className = 'card' + (c.kind === 'evo' ? ' evo' : '');
      var lvl = c.kind === 'evo' ? 'Эволюция' : c.kind === 'weapon' ? (c.isNew ? 'Новое оружие' : 'Оружие · ур. ' + c.lv) : c.kind === 'passive' ? (c.isNew ? 'Новое усиление' : 'Усиление · ур. ' + c.lv) : '';
      b.innerHTML = (c.isNew ? '<span class="new">НОВОЕ</span>' : '') + '<div class="ic" style="color:' + c.color + '">' + ico(c.kind === 'heal' ? 'heart' : c.key, c.icon, 44) + '</div><div class="body"><div class="nm">' + esc(c.title) + '</div><div class="lv">' + lvl + '</div><div class="ds">' + esc(c.desc) + '</div>' + (c.stat ? '<div class="st">' + esc(c.stat) + '</div>' : '') + (c.hint ? '<div class="hn">' + esc(c.hint) + '</div>' : '') + '</div><span class="key">' + (i + 1) + '</span>';
      b.addEventListener('click', function () { pickCard(i); });
      box.appendChild(b);
    });
    $('rerolls').textContent = game.player.rerolls;
    $('reroll').classList.toggle('hidden', game.player.rerolls <= 0);
    cardsShownAt = performance.now();
    show('level');
  }
  function pickCard(i) {
    if (!game || game.phase !== 'levelup') return;
    if (performance.now() - cardsShownAt < 380) return; // protects from a stray tap of the movement finger
    Audio.play('click');
    game.choose(i);
    if (game.phase === 'levelup') return; // another level queued: showCards is called by the hook
    hideAll();
    if (game.pendingLevels > 0) game.startLevelUp();
  }
  function doReroll() { if (game && game.reroll()) { Audio.play('buy'); cardsShownAt = performance.now() - 200; } }
  $('reroll').addEventListener('click', doReroll);

  function dmgBars(by) {
    if (!by) return '';
    var ks = Object.keys(by).filter(function (k) { return LF.WEAPONS[k] && by[k] > 0; }).sort(function (a, b) { return by[b] - by[a]; });
    if (!ks.length) return '';
    var total = ks.reduce(function (a, k) { return a + by[k]; }, 0);
    return '<div class="big dmg">' + ks.slice(0, 7).map(function (k) {
      var d = LF.WEAPONS[k], pct = by[k] / total * 100;
      return '<div class="dr"><span>' + ico(k, d.icon, 16) + ' ' + esc(d.name) + '</span><span class="dr-bar"><i style="width:' + Math.min(100, pct).toFixed(1) + '%;background:' + d.color + '"></i></span><b>' + Math.round(pct) + '%</b></div>';
    }).join('') + '</div>';
  }
  function finishRun(res) {
    if (!game || game.finished) return;
    game.finished = true;
    var unlocks = [];
    var beforeChars = LF.CHARACTERS.filter(charUnlocked).map(function (c) { return c.id; });
    save.embers += res.embers; save.stats.embersTotal += res.embers;
    save.stats.kills += res.kills; save.stats.runs++; save.stats.time += res.time;
    save.stats.bestLevel = Math.max(save.stats.bestLevel, res.level);
    var record = false;
    if (res.endless) {
      record = res.time > (save.stats.endlessBest || 0) && res.time > 30;
      save.stats.endlessBest = Math.max(save.stats.endlessBest, res.time);
      save.endlessTop.push(Math.round(res.time)); save.endlessTop.sort(function (a, b) { return b - a; }); save.endlessTop = save.endlessTop.slice(0, 5);
    }
    save.stats.bursts = (save.stats.bursts || 0) + (res.bursts || 0); save.stats.shrines = (save.stats.shrines || 0) + (res.shrines || 0);
    if (runDaily && res.won && !save.daily[runDaily.key]) { save.daily = {}; save.daily[runDaily.key] = true; save.embers += 100; unlocks.push('Испытание дня пройдено: +◆ 100'); }
    var firstClear = false;
    if (res.won && !res.endless) {
      save.stats.wins++;
      if (!save.cleared[res.zone]) { firstClear = true; save.cleared[res.zone] = true; var bonus = 80 * (res.zone + 1); save.embers += bonus; unlocks.push('Первая победа в этой земле: +◆ ' + bonus); if (res.zone < 4) unlocks.push('Открыта земля: ' + LF.ZONES[res.zone + 1].name); else unlocks.push('Открыт режим: Вечная ночь'); }
      if (save.best[res.zone] && res.time < save.best[res.zone]) record = true;
      if (!save.best[res.zone] || res.time < save.best[res.zone]) save.best[res.zone] = Math.round(res.time);
    }
    LF.ACHIEVEMENTS.forEach(function (a) {
      if (save.ach[a.id]) return;
      var ok = false; try { ok = a.test(res, save); } catch (e) {}
      if (ok) { save.ach[a.id] = true; save.embers += a.reward; unlocks.push('Достижение «' + a.name + '»: +◆ ' + a.reward); }
    });
    LF.CHARACTERS.forEach(function (c) { if (beforeChars.indexOf(c.id) < 0 && charUnlocked(c)) unlocks.push('Новый хранитель: ' + c.name); });
    save.activeRun = null; save.seenHint = true;
    persist();
    // screen
    var z = res.endless ? LF.ENDLESS : LF.ZONES[res.zone];
    $('res-title').textContent = res.won ? 'Свет победил!' : (res.endless ? 'Ночь взяла свое' : 'Фонарь погас');
    $('res-sub').textContent = z.name + (res.won ? ' · ' + z.boss.name + ' повержен' : '');
    $('res-stats').innerHTML = '<div class="big">Угольков получено<b>◆ ' + res.embers + '</b></div>' +
      '<div>Время<b>' + fmtTime(res.time) + '</b></div><div>Уровень<b>' + res.level + '</b></div><div>Врагов<b>' + res.kills + '</b></div><div>Эволюций<b>' + res.evolved + '</b></div>' +
      '<div class="big" style="font-size:13px;color:#cfc8ea">' + res.build.map(esc).join(' · ') + '</div>' + dmgBars(res.dmgBy) +
      (res.bursts || res.shrines ? '<div class="big" style="font-size:12px;color:#aaa3c8">Вспышек: ' + (res.bursts || 0) + ' · Благословений: ' + (res.shrines || 0) + (res.difficulty === 'easy' ? ' · легкая сложность' : '') + '</div>' : '');
    $('res-title').classList.toggle('record', record);
    if (record) $('res-title').textContent += ' Рекорд!';
    $('res-unlocks').innerHTML = unlocks.map(function (u) { return '<div>' + esc(u) + '</div>'; }).join('');
    var hasNext = res.won && !res.endless && res.zone < 4;
    $('res-next').classList.toggle('hidden', !hasNext);
    $('res-next').textContent = hasNext ? 'Дальше: ' + LF.ZONES[res.zone + 1].name : '';
    $('res-again').classList.toggle('btn', true);
    Audio.play(res.won ? 'win' : 'lose');
    Audio.music('menu');
    $('hud').classList.add('hidden');
    show('result');
  }
  $('res-next').addEventListener('click', function () { Audio.play('click'); startRun(zoneIdx + 1); });
  $('res-again').addEventListener('click', function () { Audio.play('click'); startRun(zoneIdx); });
  $('res-altar').addEventListener('click', function () { Audio.play('click'); game = null; show('altar'); });
  $('res-menu').addEventListener('click', function () { Audio.play('click'); game = null; show('title'); });

  // ---------------- HUD ----------------
  var lastHud = {};
  function setText(id, v) { if (lastHud[id] !== v) { lastHud[id] = v; $(id).textContent = v; } }
  function setWidth(id, v) { var s = (Math.max(0, Math.min(1, v)) * 100).toFixed(1) + '%'; if (lastHud[id] !== s) { lastHud[id] = s; $(id).style.width = s; } }
  function updateHud() {
    var g = game, p = g.player;
    setWidth('xpfill', p.xp / p.xpNext); setWidth('hpfill', p.hp / p.maxHp);
    setText('hptext', Math.ceil(p.hp) + ' / ' + p.maxHp);
    var tLeft = g.zone.endless ? g.t : (g.boss || g.bossKilled ? g.t : LF.RUN_TIME - g.t);
    setText('timer', g.boss && !g.zone.endless ? 'БОСС' : fmtTime(tLeft));
    setText('lvl', 'ур. ' + p.level);
    setWidth('lightfill', p.light / 100);
    var ready = p.light >= 50;
    if (lastHud.ready !== ready) {
      lastHud.ready = ready;
      $('burstbtn').classList.toggle('ready', ready);
      $('lightwrap').classList.toggle('ready', ready);
      var lbl = $('lightlbl'); if (lbl) lbl.innerHTML = uiSvg('burst', 'sm') + (!isTouch && ready ? ' Пробел' : '');
    }
    var bsig = Object.keys(p.buffs).map(function (k) { return k + Math.ceil(p.buffs[k]); }).join();
    if (lastHud.bsig !== bsig) {
      lastHud.bsig = bsig;
      $('buffs').innerHTML = Object.keys(p.buffs).map(function (k) { return '<span class="buff ' + k + '">' + uiSvg(k, 'sm') + ' ' + Math.ceil(p.buffs[k]) + 'с</span>'; }).join('');
    }
    setText('kills', String(g.kills));
    setText('embersrun', String(g.embersEarned(false)));
    if (g.boss) {
      setWidth('bossfill', g.boss.hp / g.boss.maxHp);
      var enr = !!(g.boss.half || g.boss.phase2 || g.boss.enraged);
      if (lastHud.bossEnr !== enr) { lastHud.bossEnr = enr; $('bossbar').classList.toggle('enraged', enr); }
    }
    else if (lastHud.bossOn) { $('bossbar').classList.add('hidden'); $('bossbar').classList.remove('enraged'); $('hud').classList.remove('boss-active'); $('timer').classList.remove('boss'); lastHud.bossEnr = false; if (g.zone.endless) Audio.music('z5'); }
    lastHud.bossOn = !!g.boss;
    var wsig = p.weapons.map(function (w) { return w.key + w.lv + (w.evo ? 'e' : ''); }).join() + '|' + JSON.stringify(p.passives);
    if (lastHud.wsig !== wsig) {
      lastHud.wsig = wsig;
      $('wslots').innerHTML = p.weapons.map(function (w) { var d = LF.WEAPONS[w.key]; return '<div class="slot' + (w.evo ? ' evo' : '') + '" style="color:' + d.color + '" title="' + esc(w.evo ? d.evo : d.name) + '">' + ico(w.key, d.icon, 24) + '<i>' + (w.evo ? '★' : w.lv) + '</i></div>'; }).join('');
      $('pslots').innerHTML = Object.keys(p.passives).map(function (k) { return '<div class="slot" title="' + esc(LF.PASSIVES[k].name) + '">' + ico(k, LF.PASSIVES[k].icon, 18) + '<i>' + p.passives[k] + '</i></div>'; }).join('');
    }
  }

  // ---------------- menu ambience (live animated fireflies + lantern bloom over keyart) ----------------
  var motes = [], titleFx = $('title-fx'), tctx = titleFx ? titleFx.getContext('2d') : null;
  for (var i = 0; i < 75; i++) motes.push({ x: Math.random(), y: Math.random(), s: 1.0 + Math.random() * 2.6, v: 0.008 + Math.random() * 0.025, ph: Math.random() * 6.28, ember: i < 20 });
  function drawMenuBg(t) {
    var W = view.cw, H = view.ch, dpr = view.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#07050b'; ctx.fillRect(0, 0, W, H);
    if (!tctx || current !== 'title') return;
    if (titleFx.width !== Math.round(W * dpr) || titleFx.height !== Math.round(H * dpr)) { titleFx.width = Math.round(W * dpr); titleFx.height = Math.round(H * dpr); }
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tctx.clearRect(0, 0, W, H);
    // breathing lantern bloom centered near the keeper's lantern in keyart
    var pulse = 0.22 + 0.08 * Math.sin(t * 2.7) + 0.04 * Math.sin(t * 6.1);
    var lx = W * 0.5, ly = H * 0.64, lr = Math.min(W, H) * 0.42;
    var g = tctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
    g.addColorStop(0, 'rgba(255,214,120,' + pulse.toFixed(3) + ')');
    g.addColorStop(0.45, 'rgba(255,150,60,' + (pulse * 0.35).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    tctx.globalCompositeOperation = 'lighter';
    tctx.fillStyle = g; tctx.fillRect(0, 0, W, H);
    for (var j = 0; j < motes.length; j++) {
      var m = motes[j];
      m.y -= m.v * (m.ember ? 0.022 : 0.011);
      if (m.y < -0.03) { m.y = 1.03; m.x = Math.random(); }
      var mx = m.x * W + Math.sin(t * (m.ember ? 1.8 : 0.9) + m.ph) * (m.ember ? 16 : 24);
      var my = m.y * H;
      var a = (0.3 + 0.45 * Math.sin(t * 2.4 + m.ph));
      tctx.globalAlpha = a * 0.35;
      tctx.fillStyle = m.ember ? '#ff9436' : '#ffe27a';
      tctx.beginPath(); tctx.arc(mx, my, m.s * 2.8, 0, 6.283); tctx.fill();
      tctx.globalAlpha = Math.min(1, a + 0.2);
      tctx.fillStyle = m.ember ? '#ffd080' : '#fff7d6';
      tctx.beginPath(); tctx.arc(mx, my, m.s * 0.85, 0, 6.283); tctx.fill();
    }
    tctx.globalAlpha = 1; tctx.globalCompositeOperation = 'source-over';
  }

  // ---------------- performance: fps counter and adaptive quality ----------------
  var perf = { t: 0, n: 0, slow: 0 };
  function perfTrack(dt) {
    perf.t += dt; perf.n++;
    if (perf.t >= 1) {
      var fps = perf.n / perf.t;
      if (save.settings.fps) $('fps').textContent = Math.round(fps) + ' fps' + (view.lowQuality ? ' · эконом' : '');
      if (game && current === 'none') { perf.slow = fps < 40 ? perf.slow + 1 : Math.max(0, perf.slow - 1); }
      if (perf.slow >= 4 && !view.lowQuality) {
        view.lowQuality = true; if (game) game.lowFx = true;
        var d = view.dpr; view.dprCap = Math.max(1, d * 0.75); resize();
      }
      perf.t = 0; perf.n = 0;
    }
  }

  // ---------------- main loop ----------------
  var lastT = performance.now(), acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (game) {
      if (!paused && current !== 'pause' && current !== 'settings' && current !== 'confirm') {
        var inp = readInput(); game.input.x = inp.x; game.input.y = inp.y;
        // fixed-ish steps for stable physics on slow devices
        acc += dt; var steps = 0;
        while (acc > 0 && steps < 3) { var st = Math.min(acc, 1 / 30); game.update(st); acc -= st; steps++; }
        acc = Math.min(acc, 0.05);
        saveTick += dt;
        if (saveTick > 3 && save.activeRun && game.phase !== 'dead' && game.phase !== 'won') { saveTick = 0; save.activeRun.embers = game.embersEarned(false); persist(); }
        if (game.phase === 'run' || game.phase === 'boss') {
          if (game.player.hp / game.player.maxHp < 0.25) { heartT -= dt; if (heartT <= 0) { heartT = 0.9; Audio.play('heart'); } } else heartT = 0;
          if (!save.seenBurstTip && tipStage === 0 && game.t > 25 && game.player.light >= 50) { tipStage = 1; showHint(isTouch ? 'Свет накопился! Жми кнопку ✦ справа внизу: вспышка оглушит врагов' : 'Свет накопился! Пробел или Shift: вспышка оглушит врагов', 6); }
          if (tipStage < 2 && !save.stats.shrines && game.gems.some(function (g2) { return g2.kind === 'shrine'; })) { tipStage = 2; showHint('Появился алтарь ✧. Дойди до него за благословением, стрелка у края экрана подскажет путь', 6); }
        }
        if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0 || (tipStage === 0 && game.t > 12)) { $('hint').classList.add('hidden'); hintTimer = 0; save.seenHint = true; } }
      } else readInput();
      try { window.LFRender.draw(ctx, game, view, { shake: save.settings.shake, numbers: save.settings.numbers, joy: current === 'none' ? joy : null }); }
      catch (e) { console.error(e); }
      if (!$('hud').classList.contains('hidden')) updateHud();
      perfTrack(dt);
    } else drawMenuBg(now / 1000);
  }

  // ---------------- boot ----------------
  window.addEventListener('error', function (e) { showError(e.message || String(e)); });
  window.addEventListener('unhandledrejection', function (e) { var m = e.reason && e.reason.message || ''; if (m && !/play|fullscreen|clipboard/i.test(m)) showError(m); });
  function showError(m) {
    var b = $('errbox'); if (!b || !b.classList.contains('hidden')) return;
    $('errmsg').textContent = String(m).slice(0, 200);
    b.classList.remove('hidden');
  }
  $('errreload').addEventListener('click', function () { try { if (game && save.activeRun) { save.activeRun.embers = game.embersEarned(false); persist(); } } catch (e) {} location.reload(); });
  $('errclose').addEventListener('click', function () { $('errbox').classList.add('hidden'); });
  if (save.settings.fps) $('fps').classList.remove('hidden');
  if (save.settings.muted) { Audio.muted = false; Audio.toggleMute(); }
  syncMuteIcons(!!save.settings.muted);
  if (isTouch) document.body.classList.add('touch');
  resize();
  if (save.activeRun) {
    var lost = Math.max(0, Math.floor(save.activeRun.embers || 0));
    save.embers += lost; save.stats.runs++; save.activeRun = null; persist();
    if (lost > 0) setTimeout(function () { var t = document.createElement('div'); t.className = 'toast'; t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:5'; t.textContent = 'Прошлый забег прервался, угольки зачислены: ◆ ' + lost; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2700); }, 300);
  }
  show('title');
  document.addEventListener('pointerdown', function once() { Audio.unlock(); Audio.music(game ? 'z' + zoneIdx : 'menu'); document.removeEventListener('pointerdown', once); });
  document.addEventListener('keydown', function once2() { Audio.unlock(); Audio.music(game ? 'z' + zoneIdx : 'menu'); document.removeEventListener('keydown', once2); });
  requestAnimationFrame(frame);
  window.__lf = { get game() { return game; }, save: function () { return save; }, startRun: startRun };
})();
