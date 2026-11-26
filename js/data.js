// Lanternfall: game data (weapons, passives, enemies, zones, meta, characters, achievements)
// Pure data, no DOM. Loaded both in the browser and in the node balance simulator.
var LF = (typeof LF !== 'undefined') ? LF : {};

LF.VERSION = '2.2.0';

// small seeded RNG (mulberry32): the daily challenge is the same for everyone on a given day
LF.mulberry32 = function (a) {
  a = a >>> 0;
  return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};
LF.RUN_TIME = 300; // seconds until the boss of the zone appears

// Difficulty: "easy" is for people who want to see all lands quickly (reviewers, casual players)
LF.DIFFICULTY = {
  normal: { name: 'Обычная', enemyHp: 1, enemyDmg: 1, embers: 1 },
  easy: { name: 'Легкая', enemyHp: 0.85, enemyDmg: 0.6, embers: 0.8 }
};

// Daily challenge modifiers (one is picked by date)
LF.CHALLENGES = [
  { id: 'horde', name: 'Орда', desc: 'Врагов на 40% больше, опыта на 40% больше', mods: { enemyCount: 1.4, xp: 1.4 } },
  { id: 'glass', name: 'Стеклянная пушка', desc: 'Урон +60%, здоровье -40%', mods: { playerDmg: 1.6, playerHp: 0.6 } },
  { id: 'swift', name: 'Быстрые тени', desc: 'Враги на 20% быстрее, угольков на 50% больше', mods: { enemySpd: 1.2, embers: 1.5 } },
  { id: 'titans', name: 'Титаны', desc: 'Враги вдвое крепче, но их на 30% меньше', mods: { enemyHp: 2, enemyCount: 0.7, embers: 1.3 } },
  { id: 'bright', name: 'Яркая ночь', desc: 'Вспышка фонаря шире на 50%, враги бьют на 25% сильнее', mods: { light: 1.5, enemyDmg: 1.25 } }
];

// Weapons. lv arrays are levels 1..5, index 5 is the evolved form.
LF.WEAPONS = {
  spark: {
    name: 'Искра', evo: 'Солнечный залп', icon: '✦', color: '#ffe27a', pair: 'focus',
    desc: ['Стреляет в ближайшего врага', '+урон, пробивает 1 врага', '+1 снаряд', '+урон, пробивает еще 1', '+1 снаряд, быстрее'],
    evoDesc: 'Залп из 5 искр, каждая взрывается',
    cd: [0.95, 0.85, 0.8, 0.7, 0.6, 0.42], dmg: [16, 19, 21, 25, 29, 36], count: [1, 1, 2, 2, 3, 5], pierce: [0, 1, 1, 2, 2, 3], speed: 540
  },
  orbit: {
    name: 'Хоровод огней', evo: 'Корона солнца', icon: '◎', color: '#ff9a4a', pair: 'halo',
    desc: ['2 огня кружат вокруг тебя', '+1 огонь', '+урон, шире круг', '+1 огонь', '+1 огонь, +урон'],
    evoDesc: '7 огней на двух орбитах, сжигают все рядом',
    count: [2, 3, 3, 4, 5, 7], dmg: [10, 12, 15, 17, 21, 28], radius: [64, 68, 78, 82, 88, 96], rot: [3.0, 3.1, 3.2, 3.4, 3.6, 4.2], hitCd: 0.45
  },
  nova: {
    name: 'Вспышка', evo: 'Сверхновая', icon: '✺', color: '#9ff3ff', pair: 'armor',
    desc: ['Волна света отбрасывает врагов', '+урон', '+радиус', 'чаще', '+урон, +радиус'],
    evoDesc: 'Двойная волна, оглушает врагов',
    cd: [3.2, 3.0, 2.8, 2.4, 2.2, 1.7], dmg: [20, 27, 32, 38, 48, 62], radius: [115, 125, 145, 150, 175, 210], knock: 150
  },
  chain: {
    name: 'Цепная молния', evo: 'Буря', icon: 'ϟ', color: '#b9a4ff', pair: 'echo',
    desc: ['Молния прыгает по 3 врагам', '+1 прыжок', '+урон', '+1 прыжок, чаще', '+урон, +1 прыжок'],
    evoDesc: 'Две молнии сразу, по 8 прыжков',
    cd: [1.6, 1.45, 1.35, 1.15, 1.05, 0.8], dmg: [16, 19, 23, 26, 31, 38], chains: [3, 4, 4, 5, 6, 8], bolts: [1, 1, 1, 1, 1, 2], range: 270
  },
  lance: {
    name: 'Копье рассвета', evo: 'Луч рассвета', icon: '➶', color: '#fff4c2', pair: 'wind',
    desc: ['Пронзает всех по направлению движения', '+урон', 'длиннее', 'чаще, шире', '+урон, длиннее'],
    evoDesc: 'Копье бьет вперед и назад',
    cd: [1.9, 1.75, 1.6, 1.4, 1.25, 0.95], dmg: [28, 35, 40, 46, 56, 70], length: [260, 280, 320, 330, 380, 440], width: [14, 15, 17, 20, 22, 28]
  },
  moths: {
    name: 'Светлячки', evo: 'Рой', icon: '❋', color: '#c6ff8a', pair: 'magnet',
    desc: ['2 светлячка сами ищут врагов', '+урон', '+1 светлячок', 'чаще', '+1 светлячок, +урон'],
    evoDesc: '6 светлячков, живут вдвое дольше',
    cd: [2.4, 2.2, 2.1, 1.8, 1.6, 1.3], dmg: [11, 14, 15, 17, 20, 25], count: [2, 2, 3, 3, 4, 6], life: [3, 3, 3.2, 3.4, 3.6, 6.5]
  },
  meteor: {
    name: 'Звездопад', evo: 'Метеоритный дождь', icon: '☄', color: '#ff7ad9', pair: 'luck',
    desc: ['Звезды падают на врагов', '+1 звезда', '+урон, +радиус', '+1 звезда, чаще', '+урон, +радиус'],
    evoDesc: '6 звезд за раз, огромный радиус',
    cd: [2.7, 2.5, 2.4, 2.1, 1.9, 1.5], dmg: [32, 34, 44, 46, 58, 72], count: [1, 2, 2, 3, 3, 6], radius: [56, 58, 66, 68, 78, 96]
  }
};
LF.WEAPON_KEYS = Object.keys(LF.WEAPONS);

LF.PASSIVES = {
  might:  { name: 'Сила', icon: '⚔', desc: '+10% урона', max: 5 },
  echo:   { name: 'Эхо', icon: '↻', desc: '-7% перезарядки', max: 5 },
  halo:   { name: 'Ореол', icon: '◌', desc: '+12% к радиусу атак и света', max: 5 },
  wind:   { name: 'Ветер', icon: '➳', desc: '+8% скорости', max: 5 },
  heart:  { name: 'Сердце', icon: '♥', desc: '+20 к здоровью и лечит', max: 5 },
  regen:  { name: 'Росток', icon: '❀', desc: '+0.5 здоровья в секунду', max: 5 },
  magnet: { name: 'Магнит', icon: '◉', desc: '+35% радиус сбора', max: 5 },
  focus:  { name: 'Фокус', icon: '◈', desc: '+6% шанс крита', max: 5 },
  luck:   { name: 'Удача', icon: '✿', desc: '+10% опыта, чаще трофеи', max: 5 },
  armor:  { name: 'Броня', icon: '⛨', desc: '-6% входящего урона', max: 5 },
  multi:  { name: 'Близнецы', icon: '⁑', desc: '+1 снаряд к оружию', max: 2 }
};
LF.PASSIVE_KEYS = Object.keys(LF.PASSIVES);

// Enemies: base stats before zone and time scaling
LF.ENEMIES = {
  crawler:  { name: 'Ползун', hp: 12, spd: 64, dmg: 8, r: 12, xp: 1, shape: 'blob' },
  bat:      { name: 'Нетопырь', hp: 9, spd: 112, dmg: 6, r: 9, xp: 1, shape: 'bat', weave: true },
  brute:    { name: 'Громила', hp: 75, spd: 46, dmg: 16, r: 20, xp: 4, shape: 'brute', mass: 3 },
  spitter:  { name: 'Плеватель', hp: 26, spd: 52, dmg: 7, r: 13, xp: 3, shape: 'eye', ranged: true },
  splitter: { name: 'Делитель', hp: 36, spd: 58, dmg: 9, r: 15, xp: 2, shape: 'split', splits: 3 },
  mini:     { name: 'Осколок', hp: 9, spd: 92, dmg: 5, r: 8, xp: 1, shape: 'blob' },
  charger:  { name: 'Таран', hp: 44, spd: 54, dmg: 12, r: 15, xp: 3, shape: 'horn', charge: true },
  wraith:   { name: 'Морок', hp: 32, spd: 76, dmg: 11, r: 13, xp: 2, shape: 'ghost', phase: true }
};

// Zones. mix: [type, weight, fromSecond]
LF.ZONES = [
  {
    id: 0, name: 'Тихая роща', sub: 'Где погас первый фонарь', hp: 1.0, hpEnd: 3.0, dmg: 1.0, embers: 1.0, density: 1.0,
    pal: { bg: '#0d1a14', ground: '#16301f', deco: '#2c5a37', deco2: '#4b8a4f', fog: '8,14,12', enemy: '#8a6bff', accent: '#9dff9a' },
    mix: [['crawler', 10, 0], ['bat', 5, 50], ['brute', 2, 140], ['splitter', 2, 200]],
    boss: { name: 'Пустой Древень', hp: 4500, r: 46, spd: 40, dmg: 18, color: '#6b4cff', patterns: ['ring', 'summon'], period: 3.4 }
  },
  {
    id: 1, name: 'Затопленные руины', sub: 'Вода помнит свет', hp: 1.15, hpEnd: 4.4, dmg: 1.2, embers: 1.4, density: 1.1,
    pal: { bg: '#081521', ground: '#0e2436', deco: '#1f4d66', deco2: '#3a86a8', fog: '5,12,20', enemy: '#4fd1c5', accent: '#7fe7ff' },
    mix: [['crawler', 8, 0], ['bat', 5, 20], ['splitter', 4, 60], ['spitter', 3, 100], ['brute', 2, 150]],
    boss: { name: 'Утопленная Королева', hp: 4800, r: 44, spd: 46, dmg: 22, color: '#2bb6c9', patterns: ['spiral', 'blink', 'ring'], period: 3.0 }
  },
  {
    id: 2, name: 'Пепельные пустоши', sub: 'Здесь горело солнце', hp: 1.25, hpEnd: 5.8, dmg: 1.3, embers: 1.9, density: 1.15,
    pal: { bg: '#1a0d0a', ground: '#2a1510', deco: '#5a2a1a', deco2: '#a8502a', fog: '16,7,5', enemy: '#ff6a3d', accent: '#ffb36b' },
    mix: [['crawler', 7, 0], ['bat', 4, 30], ['charger', 3, 60], ['brute', 3, 90], ['spitter', 3, 120], ['splitter', 2, 160]],
    boss: { name: 'Пепельный Колосс', hp: 8800, r: 54, spd: 44, dmg: 26, color: '#ff5a2a', patterns: ['charge', 'shock', 'ring'], period: 2.8 }
  },
  {
    id: 3, name: 'Хрустальный перевал', sub: 'Холод без отражений', hp: 1.45, hpEnd: 8.4, dmg: 1.6, embers: 2.5, density: 1.2,
    pal: { bg: '#0c1020', ground: '#151c35', deco: '#2c3c6e', deco2: '#7aa2ff', fog: '7,9,18', enemy: '#9db8ff', accent: '#d6e4ff' },
    mix: [['bat', 6, 0], ['wraith', 5, 20], ['charger', 3, 60], ['spitter', 3, 90], ['brute', 3, 120], ['splitter', 2, 150]],
    boss: { name: 'Хрустальный Змей', hp: 13500, r: 48, spd: 70, dmg: 28, color: '#8fb0ff', patterns: ['spiral', 'charge', 'aimed', 'summon'], period: 2.5 }
  },
  {
    id: 4, name: 'Сердце Тьмы', sub: 'Последний фонарь против ночи', hp: 1.6, hpEnd: 11, dmg: 1.8, embers: 3.2, density: 1.25,
    pal: { bg: '#0b0610', ground: '#160c1f', deco: '#3a1a4a', deco2: '#a03ad0', fog: '6,3,9', enemy: '#d14bff', accent: '#ff9df0' },
    mix: [['crawler', 5, 0], ['wraith', 5, 0], ['bat', 4, 0], ['charger', 3, 40], ['spitter', 3, 60], ['splitter', 3, 90], ['brute', 3, 120]],
    boss: { name: 'Пожиратель Света', hp: 21000, r: 60, spd: 50, dmg: 32, color: '#c03aff', patterns: ['ring', 'spiral', 'charge', 'summon', 'aimed', 'blink'], period: 2.2, phases: true }
  }
];
LF.ENDLESS = {
  id: 5, name: 'Вечная ночь', sub: 'Сколько продержится твой свет?', hp: 1.5, dmg: 1.7, embers: 2.6, density: 1.3, endless: true,
  pal: { bg: '#05060a', ground: '#0d0f18', deco: '#24283d', deco2: '#e6c36a', fog: '3,3,6', enemy: '#e6c36a', accent: '#fff1b8' },
  mix: [['crawler', 5, 0], ['wraith', 5, 0], ['bat', 4, 0], ['charger', 3, 0], ['spitter', 3, 0], ['splitter', 3, 0], ['brute', 3, 0]],
  boss: { name: 'Отголосок', hp: 18000, r: 50, spd: 55, dmg: 30, color: '#e6c36a', patterns: ['ring', 'spiral', 'charge', 'summon', 'aimed'], period: 2.4 }
};

// Meta progression bought at the Altar with embers
LF.META = {
  hp:      { name: 'Свет жизни', icon: '♥', desc: '+10% здоровья', max: 5, base: 30, grow: 1.55 },
  dmg:     { name: 'Острота', icon: '⚔', desc: '+7% урона', max: 5, base: 40, grow: 1.6 },
  cd:      { name: 'Ритм', icon: '↻', desc: '-4% перезарядки', max: 5, base: 45, grow: 1.6 },
  speed:   { name: 'Легкий шаг', icon: '➳', desc: '+5% скорости', max: 3, base: 35, grow: 1.6 },
  magnet:  { name: 'Притяжение', icon: '◉', desc: '+20% радиуса сбора', max: 3, base: 25, grow: 1.6 },
  xp:      { name: 'Мудрость', icon: '✧', desc: '+8% опыта', max: 5, base: 40, grow: 1.6 },
  armor:   { name: 'Закалка', icon: '⛨', desc: '-5% урона по тебе', max: 3, base: 50, grow: 1.7 },
  regen:   { name: 'Тепло', icon: '❀', desc: '+0.3 здоровья в секунду', max: 3, base: 45, grow: 1.7 },
  embers:  { name: 'Жадность', icon: '◆', desc: '+12% угольков', max: 5, base: 50, grow: 1.6 },
  reroll:  { name: 'Переброс', icon: '⟳', desc: '+1 переброс улучшений за забег', max: 3, base: 60, grow: 1.8 },
  choice:  { name: 'Четвертый путь', icon: '⁂', desc: '4 варианта при повышении уровня', max: 1, base: 220, grow: 1 },
  revive:  { name: 'Второе дыхание', icon: '✚', desc: 'Один раз за забег встаешь с 50% здоровья', max: 1, base: 320, grow: 1 }
};
LF.META_KEYS = Object.keys(LF.META);
LF.metaCost = function (key, rank) { var m = LF.META[key]; return Math.round(m.base * Math.pow(m.grow, rank)); };

LF.CHARACTERS = [
  { id: 'keeper', name: 'Хранитель', weapon: 'spark', bonus: 'Без слабых мест', mods: {}, unlock: null, color: '#ffe27a' },
  { id: 'pyro', name: 'Пиромантка', weapon: 'orbit', bonus: '+15% радиус атак, -10% здоровья', mods: { area: 0.15, hp: -0.1 }, unlock: { type: 'clear', zone: 0, text: 'Пройди Тихую рощу' }, color: '#ff9a4a' },
  { id: 'storm', name: 'Громовержец', weapon: 'chain', bonus: '-10% перезарядки, -10% скорости', mods: { cd: 0.1, speed: -0.1 }, unlock: { type: 'clear', zone: 2, text: 'Пройди Пепельные пустоши' }, color: '#b9a4ff' },
  { id: 'astro', name: 'Звездочет', weapon: 'meteor', bonus: '+20% опыта, +1 удача', mods: { xp: 0.2, luck: 1 }, unlock: { type: 'kills', value: 15000, text: 'Победи 15000 врагов за все время' }, color: '#ff7ad9' }
];

LF.ACHIEVEMENTS = [
  { id: 'first_blood', name: 'Первый свет', desc: 'Победи 100 врагов за забег', reward: 20, test: function (r, s) { return r.kills >= 100; } },
  { id: 'survive3', name: 'Не погаснуть', desc: 'Продержись 3 минуты', reward: 25, test: function (r) { return r.time >= 180; } },
  { id: 'boss1', name: 'Корни тьмы', desc: 'Победи Пустого Древня', reward: 40, test: function (r, s) { return s.cleared[0]; } },
  { id: 'lvl20', name: 'Разгорелся', desc: 'Достигни 20 уровня за забег', reward: 40, test: function (r) { return r.level >= 20; } },
  { id: 'evolve', name: 'Перерождение', desc: 'Эволюционируй оружие', reward: 50, test: function (r) { return r.evolved >= 1; } },
  { id: 'kills1000', name: 'Тысяча теней', desc: 'Победи 1000 врагов за забег', reward: 60, test: function (r) { return r.kills >= 1000; } },
  { id: 'boss3', name: 'Пепел к пеплу', desc: 'Пройди Пепельные пустоши', reward: 80, test: function (r, s) { return s.cleared[2]; } },
  { id: 'full', name: 'Полный фонарь', desc: 'Собери 5 оружий за забег', reward: 60, test: function (r) { return r.weapons >= 5; } },
  { id: 'nohit', name: 'Тень меня не тронет', desc: 'Победи босса, потеряв не больше 30% здоровья за бой', reward: 90, test: function (r) { return r.cleanBoss; } },
  { id: 'heart', name: 'Рассвет', desc: 'Победи Пожирателя Света', reward: 200, test: function (r, s) { return s.cleared[4]; } },
  { id: 'burst10', name: 'Ослепительно', desc: 'Используй вспышку фонаря 10 раз за забег', reward: 40, test: function (r) { return (r.bursts || 0) >= 10; } },
  { id: 'shrine3', name: 'Паломник', desc: 'Получи 3 благословения алтарей за забег', reward: 50, test: function (r) { return (r.shrines || 0) >= 3; } },
  { id: 'daily', name: 'Испытание дня', desc: 'Пройди зону с модификатором дня', reward: 80, test: function (r) { return r.challenge && r.won; } },
  { id: 'endless10', name: 'Вечный фонарь', desc: 'Продержись 10 минут в Вечной ночи', reward: 150, test: function (r) { return r.endless && r.time >= 600; } }
];

// Deterministic world prop placement (shared by game.js collision and render.js Y-sorting)
LF.PROP_CELL = 190;
LF.PROP_DATA = [
  { sz: [100, 84, 72, 54, 96, 74], w: [1.1, 1.0, 2.0, 3.8, 0.9, 1.4], solid: [20, 18, 0, 0, 18, 0] },
  { sz: [108, 92, 108, 80, 56, 108], w: [1.0, 0.7, 1.2, 1.8, 3.2, 0.6], solid: [20, 22, 0, 18, 0, 22] },
  { sz: [106, 86, 72, 72, 82, 92], w: [1.1, 1.3, 2.4, 0.9, 1.1, 0.7], solid: [16, 20, 0, 18, 20, 20] },
  { sz: [90, 82, 106, 58, 78, 84], w: [1.2, 1.3, 1.0, 2.2, 2.0, 0.6], solid: [18, 20, 15, 16, 0, 13] },
  { sz: [96, 90, 74, 78, 104, 64], w: [1.3, 1.1, 0.9, 1.5, 0.7, 2.8], solid: [18, 16, 18, 0, 18, 0] }
];
LF.propHash = function (x, y) { var h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
LF._propCache = new Map();
LF.worldProp = function (artZ, ax, ay) {
  var ck = ((artZ & 7) * 67108864) + ((ax + 4096) * 8192) + (ay + 4096);
  var cached = LF._propCache.get(ck);
  if (cached !== undefined) return cached;
  var h = LF.propHash(ax + 101, ay - 77);
  if (h > 0.36) { if (LF._propCache.size > 8000) LF._propCache.clear(); LF._propCache.set(ck, null); return null; }
  var ps = LF.PROP_CELL;
  if (Math.abs(ax * ps) < 210 && Math.abs(ay * ps) < 210) { LF._propCache.set(ck, null); return null; } // keep spawn clear
  var pd = LF.PROP_DATA[artZ] || LF.PROP_DATA[0], pw = pd.w, tot = 0;
  for (var q = 0; q < 6; q++) tot += pw[q];
  var pick = LF.propHash(ax * 13 + 5, ay * 17 + 3) * tot, idx = 0;
  while (idx < 5 && pick > pw[idx]) { pick -= pw[idx]; idx++; }
  var sz = pd.sz[idx] * (0.86 + LF.propHash(ax * 7, ay * 7) * 0.28);
  var bx = ax * ps + 28 + LF.propHash(ax * 3, ay) * (ps - 56);
  var by = ay * ps + 28 + LF.propHash(ax, ay * 5) * (ps - 56);
  var sr = pd.solid[idx] ? Math.round(pd.solid[idx] * (sz / pd.sz[idx])) : 0;
  var res = { idx: idx, x: bx, y: by, sz: sz, solid: sr, flip: LF.propHash(ax, ay * 3) < 0.5 };
  if (LF._propCache.size > 8000) LF._propCache.clear();
  LF._propCache.set(ck, res);
  return res;
};

if (typeof module !== 'undefined') module.exports = LF;
