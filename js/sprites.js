// Lanternfall v1.2: sprite art. Loads atlases, builds tinted / white / rim / dissolve variants once and caches them.
// Pure presentation: game logic never reads anything from here.
(function () {
  var LF = window.LF, M = LF.ART_META || {};
  var S = window.LFSprites = { ready: false, failed: false, img: {} };
  var BASE = 'assets/art/', pending = 0, cache = {};
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function load(name) {
    pending++;
    var im = new Image();
    im.onload = function () { S.img[name] = im; if (--pending === 0 && !S.failed) { S.ready = true; prep(); } };
    im.onerror = function () { S.failed = true; pending--; };
    im.src = BASE + name + (name.indexOf('ground') === 0 ? '.jpg' : '.png') + '?v=' + LF.VERSION;
  }
  ['enemies', 'bosses', 'hero', 'icons', 'props0', 'props1', 'props2', 'props3', 'props4', 'ground0', 'ground1', 'ground2', 'ground3', 'ground4'].forEach(load);

  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  // crop one sprite from an atlas
  S.base = function (atlas, name) {
    var k = 'b' + atlas + name; if (cache[k]) return cache[k];
    var r = M[atlas] && M[atlas][name], im = S.img[atlas]; if (!r || !im) return null;
    // regular enemies are shown at 30-60 px, so keep them at most 80 px to cut fill cost on phones
    var cap = atlas === 'enemies' ? 80 : 4096, sc = Math.min(1, cap / Math.max(r[2], r[3])), cw = Math.max(1, Math.round(r[2] * sc)), ch = Math.max(1, Math.round(r[3] * sc));
    var c = mk(cw, ch), cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(im, r[0], r[1], r[2], r[3], 0, 0, cw, ch);
    return (cache[k] = c);
  };
  // recolor dark pixels toward a palette color, keep bright pixels (eyes, lava, lantern) as painted
  S.tint = function (src, color, amount, key) {
    var k = 't' + key + color + amount; if (cache[k]) return cache[k];
    var c = mk(src.width, src.height), x = c.getContext('2d'); x.drawImage(src, 0, 0);
    if (color && amount > 0) {
      var d = x.getImageData(0, 0, c.width, c.height), p = d.data, cr = hexRgb(color);
      for (var i = 0; i < p.length; i += 4) {
        if (!p[i + 3]) continue;
        var r = p[i], g = p[i + 1], b = p[i + 2], mx = Math.max(r, g, b), lum = 0.3 * r + 0.59 * g + 0.11 * b;
        if (mx > 175 && lum > 120) continue;
        var k2 = lum / 255 * 1.7;
        p[i] = r + (Math.min(255, cr[0] * k2) - r) * amount; p[i + 1] = g + (Math.min(255, cr[1] * k2) - g) * amount; p[i + 2] = b + (Math.min(255, cr[2] * k2) - b) * amount;
      }
      x.putImageData(d, 0, 0);
    }
    return (cache[k] = c);
  };
  S.flip = function (src) {
    if (src._flip) return src._flip;
    var c = mk(src.width, src.height), x = c.getContext('2d'); x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0);
    src._flip = c; c._flip = src; return c;
  };
  S.white = function (src) {
    if (src._white) return src._white;
    var c = mk(src.width, src.height), x = c.getContext('2d'); x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
    return (src._white = c);
  };
  // outline pixels only: used as rim light on the side that faces the lantern
  S.rim = function (src, color) {
    var k = '_rim' + color; if (src[k]) return src[k];
    var w = src.width, h = src.height, c = mk(w, h), x = c.getContext('2d');
    var a = src.getContext('2d').getImageData(0, 0, w, h).data, d = x.createImageData(w, h), q = d.data, cr = hexRgb(color);
    for (var y = 0; y < h; y++) for (var xx = 0; xx < w; xx++) {
      var i = (y * w + xx) * 4; if (a[i + 3] < 128) continue;
      var edge = false;
      for (var dy = -2; dy <= 2 && !edge; dy++) for (var dx = -2; dx <= 2; dx++) {
        var ny = y + dy, nx = xx + dx;
        if (ny < 0 || nx < 0 || ny >= h || nx >= w || a[(ny * w + nx) * 4 + 3] < 128) { edge = true; break; }
      }
      if (edge) { q[i] = cr[0]; q[i + 1] = cr[1]; q[i + 2] = cr[2]; q[i + 3] = 230; }
    }
    x.putImageData(d, 0, 0); return (src[k] = c);
  };
  // three dissolve frames for the death animation
  S.dissolve = function (src) {
    if (src._dis) return src._dis;
    var w = src.width, h = src.height, out = [];
    var base = src.getContext('2d').getImageData(0, 0, w, h);
    [0.3, 0.6, 0.86].forEach(function (f, n) {
      var c = mk(w, h), x = c.getContext('2d'), d = x.createImageData(w, h), q = d.data, p = base.data;
      for (var y = 0; y < h; y++) for (var xx = 0; xx < w; xx++) {
        var i = (y * w + xx) * 4; if (!p[i + 3]) continue;
        var cell = ((xx >> 2) * 73856093 ^ (y >> 2) * 19349663) >>> 0, rnd = (cell % 1000) / 1000;
        if (rnd < f) continue;
        var lift = 0.35 + n * 0.25;
        q[i] = p[i] + (255 - p[i]) * lift; q[i + 1] = p[i + 1] + (240 - p[i + 1]) * lift; q[i + 2] = p[i + 2] + (255 - p[i + 2]) * lift; q[i + 3] = p[i + 3] * (1 - n * 0.22);
      }
      x.putImageData(d, 0, 0); out.push(c);
    });
    return (src._dis = out);
  };
  S.shadow = (function () {
    var c = mk(64, 32), x = c.getContext('2d'), g = x.createRadialGradient(32, 16, 0, 32, 16, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.setTransform(1, 0, 0, 0.5, 0, 8); x.fillStyle = g; x.beginPath(); x.arc(32, 16, 32, 0, Math.PI * 2); x.fill(); return c;
  })();

  // draw a sprite with smooth expressive animation, anchored at its feet (x, y)
  // style: legs | squash | flap | float
  S.drawAnim = function (ctx, c, x, y, w, h, style, f, ph) {
    var p = (ph !== undefined) ? ph : (f * 1.57);
    ctx.save();
    if (style === 'squash') {
      var s = Math.sin(p * 8);
      var sx = 1 + s * 0.1, sy = 1 - s * 0.09;
      ctx.translate(x, y);
      ctx.rotate(Math.cos(p * 8) * 0.06);
      ctx.drawImage(c, -w * sx / 2, -h * sy, w * sx, h * sy);
    } else if (style === 'flap') {
      var fl = Math.sin(p * 14);
      var fy = 0.82 + fl * 0.22, fx = 1.04 - fl * 0.08, lift = -fl * 4.5;
      ctx.translate(x, y - h * 0.5 + lift);
      ctx.rotate(Math.cos(p * 7) * 0.1);
      ctx.drawImage(c, -w * fx / 2, -h * fy / 2, w * fx, h * fy);
    } else if (style === 'float') {
      var bob = Math.sin(p * 4.2) * 4.5, tilt = Math.sin(p * 2.4) * 0.065;
      ctx.translate(x, y + bob);
      ctx.rotate(tilt);
      ctx.drawImage(c, -w / 2, -h, w, h);
    } else {
      // heavy stomping walk (brute, charger)
      var st = Math.sin(p * 9.5), hop = Math.abs(st) * 4.5, lean = st * 0.085;
      ctx.translate(x, y - hop);
      ctx.rotate(lean);
      ctx.drawImage(c, -w / 2, -h, w, h);
    }
    ctx.restore();
  };

  // lantern position inside the hero sprite (found once from the warm bright pixels)
  S.heroLantern = [0.82, 0.7];
  function prep() {
    try {
      var h0 = S.base('hero', 'h0'), x = h0.getContext('2d'), d = x.getImageData(0, 0, h0.width, h0.height).data, sx = 0, sy = 0, n = 0;
      for (var y = 0; y < h0.height; y++) for (var xx = 0; xx < h0.width; xx++) { var i = (y * h0.width + xx) * 4; if (d[i + 3] > 128 && d[i] > 220 && d[i + 1] > 170 && d[i + 2] < 150) { sx += xx; sy += y; n++; } }
      if (n > 4) S.heroLantern = [sx / n / h0.width, sy / n / h0.height];
    } catch (e) {}
  }

  // icons for cards / HUD / codex (CSS sprite from the icon atlas)
  S.iconCount = M.icons ? Object.keys(M.icons).length : 0;
  S.iconHtml = function (key, size, color) {
    var map = { moth: 'moths' }, k = map[key] || key, idx = M.icons ? M.icons[k] : undefined;
    if (idx === undefined) return null;
    size = size || 40;
    return '<span class="icon-img" style="width:' + size + 'px;height:' + size + 'px;background-size:' + (S.iconCount * size) + 'px ' + size + 'px;background-position:-' + (idx * size) + 'px 0"></span>';
  };
})();
