// Lanternfall: canvas renderer (procedural art, sprite caches, lightmap)
(function () {
  var TAU = Math.PI * 2;
  var R = window.LFRender = {};
  var spriteCache = {};

  function makeCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
  function hash(x, y) { var h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
  R.hexA = hexA;

  // One reusable 128x128 glow canvas per color (ZERO per-frame canvas leaks!)
  function glowSprite(color) {
    var k = 'g' + color;
    if (spriteCache[k]) return spriteCache[k];
    var s = 64, c = makeCanvas(s * 2, s * 2), x = c.getContext('2d');
    var g = x.createRadialGradient(s, s, 0, s, s, s);
    g.addColorStop(0, hexA(color, 0.9)); g.addColorStop(0.25, hexA(color, 0.45)); g.addColorStop(1, hexA(color, 0));
    x.fillStyle = g; x.fillRect(0, 0, s * 2, s * 2);
    spriteCache[k] = c; return c;
  }
  function drawGlow(ctx, color, x, y, r) {
    ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  }
  // Soft volumetric feathered light cone (smooth horizontal & vertical falloff, zero hard edges!)
  function beamSprite(color) {
    var k = 'bm2' + color;
    if (spriteCache[k]) return spriteCache[k];
    var W = 96, H = 260, c = makeCanvas(W, H), x = c.getContext('2d');
    var base = hexA(color, 1).replace(/,1\)$/, ',');
    // Layer 3 tapered cones from wide soft outer halo to bright narrow core
    var layers = [[W * 0.48, 0.08], [W * 0.28, 0.14], [W * 0.12, 0.24]];
    for (var i = 0; i < layers.length; i++) {
      var hw = layers[i][0], al = layers[i][1];
      var g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, base + '0)');
      g.addColorStop(0.55, base + (al * 0.7).toFixed(3) + ')');
      g.addColorStop(0.92, base + al.toFixed(3) + ')');
      g.addColorStop(1, base + '0)');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(W / 2 - hw * 0.45, 0);
      x.lineTo(W / 2 + hw * 0.45, 0);
      x.lineTo(W / 2 + hw, H);
      x.lineTo(W / 2 - hw, H);
      x.closePath();
      x.fill();
    }
    spriteCache[k] = c; return c;
  }
  var lightPuff = (function () {
    var s = 128, c = makeCanvas(s * 2, s * 2), x = c.getContext('2d');
    var g = x.createRadialGradient(s, s, 0, s, s, s);
    // inverse-square-like falloff: bright core, long soft tail
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.3, 'rgba(0,0,0,0.97)'); g.addColorStop(0.5, 'rgba(0,0,0,0.82)'); g.addColorStop(0.68, 'rgba(0,0,0,0.55)'); g.addColorStop(0.84, 'rgba(0,0,0,0.24)'); g.addColorStop(0.94, 'rgba(0,0,0,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, s * 2, s * 2); return c;
  })();

  // ---- enemy sprites ----
  function enemySprite(shape, color, r, white) {
    var k = 'e' + shape + color + Math.round(r) + (white ? 'w' : '');
    if (spriteCache[k]) return spriteCache[k];
    var pad = r * 1.9, c = makeCanvas(pad * 2, pad * 2), x = c.getContext('2d');
    x.translate(pad, pad);
    var body = white ? '#ffffff' : color;
    var dark = white ? '#ffffff' : 'rgba(5,3,12,0.9)';
    // soft aura
    if (!white) { var g = x.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.8); g.addColorStop(0, hexA(color, 0.35)); g.addColorStop(1, hexA(color, 0)); x.fillStyle = g; x.beginPath(); x.arc(0, 0, r * 1.8, 0, TAU); x.fill(); }
    x.fillStyle = dark; x.strokeStyle = body; x.lineWidth = Math.max(2, r * 0.16);
    x.beginPath();
    if (shape === 'blob' || shape === 'split') {
      for (var i = 0; i <= 24; i++) { var a = i / 24 * TAU, rr = r * (1 + Math.sin(a * 5) * 0.07); x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.92 + r * 0.05); }
    } else if (shape === 'bat') {
      x.moveTo(0, -r * 0.6); x.quadraticCurveTo(r * 0.9, -r * 1.1, r * 1.6, -r * 0.2); x.quadraticCurveTo(r * 1.0, -r * 0.1, r * 0.9, r * 0.5);
      x.quadraticCurveTo(r * 0.4, r * 0.2, 0, r * 0.8); x.quadraticCurveTo(-r * 0.4, r * 0.2, -r * 0.9, r * 0.5); x.quadraticCurveTo(-r * 1.0, -r * 0.1, -r * 1.6, -r * 0.2); x.quadraticCurveTo(-r * 0.9, -r * 1.1, 0, -r * 0.6);
    } else if (shape === 'brute') {
      x.moveTo(-r, -r * 0.5); x.lineTo(-r * 0.75, -r * 1.25); x.lineTo(-r * 0.35, -r * 0.8); x.lineTo(r * 0.35, -r * 0.8); x.lineTo(r * 0.75, -r * 1.25); x.lineTo(r, -r * 0.5);
      x.quadraticCurveTo(r * 1.15, r * 0.7, r * 0.6, r); x.lineTo(-r * 0.6, r); x.quadraticCurveTo(-r * 1.15, r * 0.7, -r, -r * 0.5);
    } else if (shape === 'eye') {
      x.arc(0, 0, r, 0, TAU);
    } else if (shape === 'horn') {
      x.moveTo(0, -r * 1.3); x.lineTo(r * 1.05, r * 0.85); x.quadraticCurveTo(0, r * 0.45, -r * 1.05, r * 0.85); x.closePath();
    } else if (shape === 'ghost') {
      x.arc(0, -r * 0.15, r, Math.PI, 0); x.lineTo(r, r * 0.9);
      for (var j = 0; j < 4; j++) { var xx = r - (j + 0.5) * r * 0.5; x.quadraticCurveTo(xx, r * 0.4, xx - r * 0.25, r * 0.9); }
      x.closePath();
    } else { x.arc(0, 0, r, 0, TAU); }
    x.fill(); x.stroke();
    if (shape === 'split' && !white) { x.strokeStyle = hexA(color, 0.8); x.lineWidth = 2; x.beginPath(); x.moveTo(-r * 0.2, -r * 0.9); x.lineTo(r * 0.1, -r * 0.2); x.lineTo(-r * 0.15, r * 0.3); x.lineTo(r * 0.1, r * 0.9); x.stroke(); }
    spriteCache[k] = c; c.pad = pad; return c;
  }

  // ---- decorations per zone ----
  function decoSprite(zoneId, kind, pal) {
    var k = 'd' + zoneId + kind;
    if (spriteCache[k]) return spriteCache[k];
    var c = makeCanvas(96, 96), x = c.getContext('2d'); x.translate(48, 60);
    var d1 = pal.deco, d2 = pal.deco2;
    x.lineCap = 'round';
    if (zoneId === 0 || zoneId === 5) {
      if (kind === 0) { x.strokeStyle = d2; x.lineWidth = 2; for (var i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(i * 3, 8); x.quadraticCurveTo(i * 5, -6, i * 7, -14 - Math.abs(i) * -1); x.stroke(); } }
      else if (kind === 1) { x.fillStyle = d1; x.beginPath(); x.ellipse(0, 6, 16, 9, 0, 0, TAU); x.fill(); x.fillStyle = d2; x.beginPath(); x.ellipse(-3, 3, 7, 3, -0.3, 0, TAU); x.globalAlpha = 0.4; x.fill(); }
      else if (kind === 2) { x.fillStyle = '#d8d0ff'; x.fillRect(-2, -6, 4, 12); x.fillStyle = pal.accent; x.beginPath(); x.ellipse(0, -8, 9, 6, 0, Math.PI, 0); x.fill(); x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.arc(-3, -10, 1.5, 0, TAU); x.arc(3, -9, 1.2, 0, TAU); x.fill(); }
      else { x.fillStyle = d1; x.beginPath(); x.arc(0, 0, 26, 0, TAU); x.globalAlpha = 0.35; x.fill(); }
    } else if (zoneId === 1) {
      if (kind === 0) { x.fillStyle = d1; x.globalAlpha = 0.7; x.beginPath(); x.ellipse(0, 4, 26, 11, 0, 0, TAU); x.fill(); x.strokeStyle = d2; x.globalAlpha = 0.5; x.lineWidth = 1.5; x.beginPath(); x.ellipse(0, 4, 16, 6, 0, 0, TAU); x.stroke(); }
      else if (kind === 1) { x.fillStyle = d1; x.fillRect(-9, -30, 18, 38); x.fillStyle = d2; x.globalAlpha = 0.6; x.fillRect(-12, -34, 24, 6); x.fillRect(-12, 6, 24, 5); }
      else if (kind === 2) { x.strokeStyle = d2; x.lineWidth = 2; x.globalAlpha = 0.8; for (var a = 0; a < 5; a++) { x.beginPath(); x.moveTo(a * 4 - 8, 8); x.quadraticCurveTo(a * 6 - 14, -8, a * 3 - 6, -20); x.stroke(); } }
      else { x.fillStyle = d1; x.globalAlpha = 0.5; x.beginPath(); x.moveTo(-18, 8); x.lineTo(-6, -4); x.lineTo(14, 2); x.lineTo(20, 10); x.closePath(); x.fill(); }
    } else if (zoneId === 2) {
      if (kind === 0) { x.strokeStyle = d2; x.globalAlpha = 0.55; x.lineWidth = 2; x.beginPath(); x.moveTo(-24, 0); x.lineTo(-8, -4); x.lineTo(0, 6); x.lineTo(14, 0); x.lineTo(26, 6); x.moveTo(0, 6); x.lineTo(4, 16); x.stroke(); }
      else if (kind === 1) { x.fillStyle = d1; x.beginPath(); x.moveTo(-14, 10); x.lineTo(-10, -12); x.lineTo(2, -18); x.lineTo(12, -6); x.lineTo(14, 10); x.closePath(); x.fill(); }
      else if (kind === 2) { var g = x.createRadialGradient(0, 0, 0, 0, 0, 12); g.addColorStop(0, '#ffd27a'); g.addColorStop(1, 'rgba(255,90,30,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 12, 0, TAU); x.fill(); }
      else { x.strokeStyle = d1; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 10); x.lineTo(0, -22); x.moveTo(0, -8); x.lineTo(10, -16); x.moveTo(0, -2); x.lineTo(-9, -10); x.stroke(); }
    } else if (zoneId === 3) {
      if (kind === 0 || kind === 2) { var s = kind === 0 ? 1 : 0.6; x.fillStyle = d1; x.strokeStyle = d2; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, -30 * s); x.lineTo(8 * s, 8); x.lineTo(-8 * s, 8); x.closePath(); x.fill(); x.stroke(); x.beginPath(); x.moveTo(-12 * s, -14 * s); x.lineTo(-6 * s, 8); x.lineTo(-16 * s, 8); x.closePath(); x.fill(); x.stroke(); }
      else if (kind === 1) { x.fillStyle = 'rgba(200,220,255,0.12)'; x.beginPath(); x.ellipse(0, 4, 28, 12, 0, 0, TAU); x.fill(); }
      else { x.fillStyle = '#ffffff'; x.globalAlpha = 0.5; x.beginPath(); x.arc(0, 0, 1.5, 0, TAU); x.arc(8, -6, 1, 0, TAU); x.arc(-10, 4, 1.2, 0, TAU); x.fill(); }
    } else {
      if (kind === 0) { x.strokeStyle = d1; x.lineWidth = 4; x.beginPath(); x.moveTo(-20, 10); x.bezierCurveTo(-10, -20, 10, 20, 22, -12); x.stroke(); }
      else if (kind === 1) { x.fillStyle = d1; x.beginPath(); x.ellipse(0, 0, 12, 7, 0, 0, TAU); x.fill(); x.fillStyle = d2; x.beginPath(); x.arc(0, 0, 3, 0, TAU); x.fill(); }
      else if (kind === 2) { x.strokeStyle = d2; x.globalAlpha = 0.5; x.lineWidth = 1.5; x.beginPath(); x.arc(0, 0, 14, 0, TAU); x.moveTo(0, -14); x.lineTo(0, 14); x.moveTo(-14, 0); x.lineTo(14, 0); x.stroke(); }
      else { x.fillStyle = d1; x.globalAlpha = 0.5; x.beginPath(); x.arc(0, 0, 22, 0, TAU); x.fill(); }
    }
    spriteCache[k] = c; return c;
  }

  var solidProps = [], yq = [];
  // ---- main draw ----
  R.draw = function (ctx, g, view, opts) {
    var W = view.cw, H = view.ch, sc = view.scale, dpr = view.dpr;
    var p = g.player, pal = g.zone.pal;
    var vw = W / sc, vh = H / sc;
    var shake = opts.shake ? g.shake : 0;
    var camX = p.x - vw / 2 + (Math.random() - 0.5) * shake, camY = p.y - vh / 2 + (Math.random() - 0.5) * shake;
    var t = g.realT;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, -camX * dpr * sc, -camY * dpr * sc);

    var SP = window.LFSprites, ART = SP && SP.ready && !opts.noArt;
    var azi = LF.ZONES.indexOf(g.zone); if (azi < 0) azi = 5;
    var artZ = azi > 4 ? 4 : azi;
    solidProps.length = 0;
    if (ART) drawGroundArt(ctx, g, artZ, azi, camX, camY, vw, vh, t, view, solidProps);
    // ground patches + decorations
    var cs = 150, x0 = Math.floor(camX / cs) - 1, x1 = Math.floor((camX + vw) / cs) + 1, y0 = Math.floor(camY / cs) - 1, y1 = Math.floor((camY + vh) / cs) + 1;
    var zid = g.zone.id;
    for (var cx = x0; cx <= x1 && !ART; cx++) for (var cy = y0; cy <= y1; cy++) {
      var h = hash(cx, cy);
      if (h < 0.22) { ctx.fillStyle = pal.ground; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.ellipse(cx * cs + 75, cy * cs + 75, 70 + h * 120, 40 + h * 80, h * 6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      var n = Math.floor(hash(cx + 7, cy - 3) * 2.6);
      ctx.globalAlpha = 0.75;
      for (var i = 0; i < n; i++) {
        var hx = hash(cx * 3 + i, cy * 5 - i), hy = hash(cx * 7 - i, cy * 11 + i), hk = hash(cx + i * 13, cy + i * 17);
        var kind = hk < 0.5 ? 0 : hk < 0.75 ? 1 : hk < 0.9 ? 2 : 3;
        var spr = decoSprite(zid, kind, pal);
        ctx.drawImage(spr, cx * cs + hx * cs - 48, cy * cs + hy * cs - 60);
      }
      ctx.globalAlpha = 1;
    }

    // zones under entities
    for (var zi = 0; zi < g.zones.length; zi++) {
      var z = g.zones[zi];
      if (z.type === 'meteor') {
        if (z.t < 0) {
          var k = Math.max(0, Math.min(1, 1 + z.t / 0.67));
          // Pulsing arcane targeting sigil on ground
          ctx.save(); ctx.translate(z.x, z.y);
          ctx.strokeStyle = hexA(z.color, 0.35 + k * 0.5); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, z.r, 0, TAU); ctx.stroke();
          ctx.fillStyle = hexA(z.color, 0.08 + 0.16 * k);
          ctx.beginPath(); ctx.arc(0, 0, z.r * Math.max(0.08, k), 0, TAU); ctx.fill();
          ctx.rotate(t * 2.5);
          ctx.strokeStyle = hexA('#ffe9a8', 0.45 + k * 0.4); ctx.lineWidth = 1.5;
          for (var mc = 0; mc < 4; mc++) {
            var ma = mc * Math.PI / 2;
            ctx.beginPath(); ctx.moveTo(Math.cos(ma) * (z.r * 0.65), Math.sin(ma) * (z.r * 0.65));
            ctx.lineTo(Math.cos(ma) * (z.r * 1.08), Math.sin(ma) * (z.r * 1.08)); ctx.stroke();
          }
          ctx.restore();
          // Blazing angled comet with 3-layer plasma tail
          var dist = 340 * Math.max(0, -z.t) / 0.55;
          var cx2 = z.x + dist * 0.34, cy2 = z.y - dist;
          var tx2 = cx2 + 48, ty2 = cy2 - 140;
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          var tg = ctx.createLinearGradient(cx2, cy2, tx2, ty2);
          tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.2, '#ffd27a'); tg.addColorStop(0.55, hexA(z.color, 0.85)); tg.addColorStop(1, 'rgba(255,80,180,0)');
          ctx.strokeStyle = tg; ctx.lineCap = 'round'; ctx.lineWidth = 16;
          ctx.beginPath(); ctx.moveTo(cx2, cy2); ctx.lineTo(tx2, ty2); ctx.stroke();
          ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,250,230,0.9)';
          ctx.beginPath(); ctx.moveTo(cx2, cy2); ctx.lineTo(cx2 + 20, cy2 - 58); ctx.stroke();
          drawGlow(ctx, z.color, cx2, cy2, 34);
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx2, cy2, 7.5, 0, TAU); ctx.fill();
          ctx.restore();
        } else {
          var kk = Math.min(1, z.t / z.dur), inv = 1 - kk;
          // Scorched crater + glowing magma fissures + expanding shockwave
          ctx.fillStyle = 'rgba(12,6,14,' + (0.55 * inv) + ')';
          ctx.beginPath(); ctx.ellipse(z.x, z.y + 4, z.r * 0.92, z.r * 0.52, 0, 0, TAU); ctx.fill();
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = hexA('#ff9a3c', 0.85 * inv); ctx.lineWidth = 2.5;
          for (var cr = 0; cr < 6; cr++) {
            var ca = cr * TAU / 6 + (z.x * 0.05);
            ctx.beginPath(); ctx.moveTo(z.x, z.y);
            ctx.lineTo(z.x + Math.cos(ca) * z.r * 0.85, z.y + Math.sin(ca) * z.r * 0.48); ctx.stroke();
          }
          ctx.fillStyle = hexA(z.color, 0.55 * inv);
          ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (0.45 + kk * 0.65), 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,240,190,' + (0.9 * inv) + ')'; ctx.lineWidth = 4 * inv + 1;
          ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (0.55 + kk * 0.75), 0, TAU); ctx.stroke();
          ctx.restore();
        }
      } else if (z.type === 'shock') {
        if (z.t < 0) { ctx.strokeStyle = 'rgba(255,80,80,' + (0.25 + 0.25 * Math.sin(t * 20)) + ')'; ctx.lineWidth = 3; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.arc(z.x, z.y, 120, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
        else { ctx.strokeStyle = 'rgba(255,110,70,0.85)'; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(z.x, z.y, Math.max(1, z.r), 0, TAU); ctx.stroke(); ctx.strokeStyle = 'rgba(255,230,180,0.8)'; ctx.lineWidth = 4; ctx.stroke(); }
      }
    }

    // gems
    for (var gi = 0; gi < g.gems.length; gi++) {
      var gm = g.gems[gi];
      if (gm.x < camX - 30 || gm.x > camX + vw + 30 || gm.y < camY - 30 || gm.y > camY + vh + 30) continue;
      var bob = Math.sin(t * 4 + gi) * 2;
      if (gm.kind === 'xp') {
        var big = gm.v >= 10, col = gm.v >= 25 ? '#ff7ad9' : big ? '#7ad7ff' : pal.accent, s2 = big ? 7 : 4.5;
        if (gm.pull && !view.lowQuality) {
          ctx.strokeStyle = hexA(col, 0.45); ctx.lineWidth = big ? 3 : 2;
          ctx.beginPath(); ctx.moveTo(gm.x, gm.y + bob); ctx.lineTo(gm.x - gm.vx * 0.035, gm.y - gm.vy * 0.035 + bob); ctx.stroke();
        }
        var tw = 0.75 + 0.25 * Math.sin(t * 6 + gi * 1.7);
        ctx.globalAlpha = tw; drawGlow(ctx, col, gm.x, gm.y + bob, 14); ctx.globalAlpha = 1;
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(gm.x, gm.y - s2 + bob); ctx.lineTo(gm.x + s2 * 0.7, gm.y + bob); ctx.lineTo(gm.x, gm.y + s2 + bob); ctx.lineTo(gm.x - s2 * 0.7, gm.y + bob); ctx.fill();
      } else if (gm.kind === 'ember') { drawGlow(ctx, '#ff9a3c', gm.x, gm.y + bob, 16); ctx.fillStyle = '#ffcf6b'; ctx.beginPath(); ctx.arc(gm.x, gm.y + bob, 4, 0, TAU); ctx.fill(); }
      else if (gm.kind === 'heal') { drawGlow(ctx, '#7dff9a', gm.x, gm.y + bob, 22); ctx.fillStyle = '#d9ffe2'; ctx.fillRect(gm.x - 2.5, gm.y - 8 + bob, 5, 16); ctx.fillRect(gm.x - 8, gm.y - 2.5 + bob, 16, 5); }
      else if (gm.kind === 'magnet') { drawGlow(ctx, '#7ad7ff', gm.x, gm.y + bob, 22); ctx.strokeStyle = '#e6f6ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(gm.x, gm.y + bob, 7, Math.PI, 0); ctx.stroke(); ctx.fillStyle = '#ff6b6b'; ctx.fillRect(gm.x - 9, gm.y + bob, 4, 5); ctx.fillRect(gm.x + 5, gm.y + bob, 4, 5); }
      else if (gm.kind === 'shrine') {
        var sp = 1 + Math.sin(t * 3) * 0.08, fade = gm.age > 42 ? (Math.floor(t * 8) % 2 ? 0.4 : 1) : 1;
        ctx.globalAlpha = fade;
        // Soft volumetric golden light cone (feathered, zero hard edges)
        if (!view.lowQuality) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = fade * (0.75 + 0.2 * Math.sin(t * 2.8));
          ctx.drawImage(beamSprite('#ffe9a8'), gm.x - 48, gm.y - 246, 96, 260);
          ctx.restore();
        }
        // Rotating golden arcane rune circle on ground
        ctx.save(); ctx.translate(gm.x, gm.y + 8); ctx.scale(1, 0.55); ctx.rotate(t * 0.8);
        ctx.strokeStyle = 'rgba(255,232,150,0.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 38, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,210,100,0.35)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 28, 0, TAU); ctx.stroke();
        for (var sr = 0; sr < 6; sr++) {
          var sra = sr * TAU / 6;
          ctx.beginPath(); ctx.moveTo(Math.cos(sra) * 28, Math.sin(sra) * 28); ctx.lineTo(Math.cos(sra) * 41, Math.sin(sra) * 41); ctx.stroke();
        }
        ctx.restore();
        drawGlow(ctx, '#ffe27a', gm.x, gm.y, 64 * sp);
        // Carved obsidian obelisk pedestal with golden runic trim
        ctx.fillStyle = '#1b1628'; ctx.fillRect(gm.x - 18, gm.y + 8, 36, 8);
        ctx.fillStyle = '#2d2642'; ctx.beginPath(); ctx.moveTo(gm.x - 14, gm.y + 8); ctx.lineTo(gm.x + 14, gm.y + 8); ctx.lineTo(gm.x + 10, gm.y - 8); ctx.lineTo(gm.x - 10, gm.y - 8); ctx.fill();
        ctx.strokeStyle = '#f0c36a'; ctx.lineWidth = 1.5;
        ctx.strokeRect(gm.x - 14, gm.y + 8, 28, 1);
        ctx.beginPath(); ctx.moveTo(gm.x, gm.y - 4); ctx.lineTo(gm.x, gm.y + 5); ctx.moveTo(gm.x - 4, gm.y); ctx.lineTo(gm.x + 4, gm.y); ctx.stroke();
        // Levitating faceted crystal with warm core
        var cb = Math.sin(t * 4.2) * 3.5;
        ctx.fillStyle = '#f0c36a';
        ctx.beginPath(); ctx.moveTo(gm.x, gm.y - 36 + cb); ctx.lineTo(gm.x + 9, gm.y - 20 + cb); ctx.lineTo(gm.x, gm.y - 6 + cb); ctx.lineTo(gm.x - 9, gm.y - 20 + cb); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff9df';
        ctx.beginPath(); ctx.moveTo(gm.x, gm.y - 32 + cb); ctx.lineTo(gm.x + 4.5, gm.y - 20 + cb); ctx.lineTo(gm.x, gm.y - 10 + cb); ctx.lineTo(gm.x - 4.5, gm.y - 20 + cb); ctx.closePath(); ctx.fill();
        // Orbiting golden light motes spiraling up
        if (!view.lowQuality) {
          ctx.fillStyle = '#fff4c2';
          for (var sm = 0; sm < 5; sm++) {
            var mp = (t * 0.9 + sm * 0.2) % 1, ma2 = t * 3 + sm * 1.26;
            ctx.globalAlpha = fade * (1 - mp) * 0.9;
            ctx.beginPath(); ctx.arc(gm.x + Math.cos(ma2) * (16 - mp * 8), gm.y + 6 - mp * 52, 2.2, 0, TAU); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }
      else if (gm.kind === 'chest') {
        if (!view.lowQuality) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7;
          ctx.drawImage(beamSprite('#ffd23f'), gm.x - 36, gm.y - 172, 72, 184);
          ctx.restore();
        }
        drawGlow(ctx, '#ffd23f', gm.x, gm.y + bob, 40); ctx.drawImage(chestSprite(), gm.x - 16, gm.y - 16 + bob, 32, 28);
      }
    }

    // enemy bullets
    for (var bi = 0; bi < g.ebullets.length; bi++) {
      var b = g.ebullets[bi];
      var ebs = ebulletSprite(Math.floor(t * 10 + bi) & 1), ebr = b.r * 2.4;
      ctx.drawImage(ebs, b.x - ebr, b.y - ebr, ebr * 2, ebr * 2);
    }

    // enemies + Y-sorted solid props + hero (true 2.5D depth sorting!)
    var lightR0 = (Math.min(vw, vh) * 0.42 + 110) * (0.88 + 0.12 * g.stats.area) * (g.lightFrac ? g.lightFrac() : 1);
    var heroDrawnInSort = false;
    if (ART) {
      if (!view.lowQuality) for (var sh = 0, nsh = 0; sh < g.enemies.length && nsh < 160; sh++) {
        var se = g.enemies[sh]; if (se.x < camX - 120 || se.x > camX + vw + 120 || se.y < camY - 120 || se.y > camY + vh + 120) continue; nsh++;
        var sdx = se.x - p.x, sdy = se.y - p.y, sdl = Math.sqrt(sdx * sdx + sdy * sdy) || 1, sw2 = se.r * (se.boss ? 2.6 : 2.4);
        ctx.drawImage(SP.shadow, se.x - sw2 / 2 + sdx / sdl * 4, se.y + se.r * 0.55 - sw2 * 0.18 + sdy / sdl * 3, sw2, sw2 * 0.42);
      }
      // Build unified Y-sorted draw queue (reused array, zero GC churn)
      yq.length = 0;
      for (var spI = 0; spI < solidProps.length; spI++) yq.push(solidProps[spI]);
      for (var ei2 = 0; ei2 < g.enemies.length; ei2++) {
        var e2 = g.enemies[ei2];
        if (e2.x < camX - 140 || e2.x > camX + vw + 140 || e2.y < camY - 160 || e2.y > camY + vh + 140) continue;
        yq.push({ k: e2.boss ? 2 : 1, fy: e2.boss ? (e2.y + e2.r * 0.95) : (e2.y + e2.r * 0.62), e: e2 });
      }
      yq.push({ k: 3, fy: p.y + 16 });
      yq.sort(function (a, b) { return a.fy - b.fy; });
      for (var yi = 0; yi < yq.length; yi++) {
        var it = yq[yi];
        if (it.k === 0) {
          if (!view.lowQuality) ctx.drawImage(SP.shadow, it.x - it.w * 0.45, it.y - it.h * 0.08, it.w * 0.9, it.h * 0.22);
          ctx.drawImage(it.cpc, it.x - it.w / 2, it.y - it.h, it.w, it.h);
        } else if (it.k === 1) {
          drawEnemyArt(ctx, it.e, g, t, azi, lightR0, view);
        } else if (it.k === 2) {
          drawBossArt(ctx, it.e, g, t, azi, view);
        } else {
          var bf0 = p.buffs || {};
          if (bf0.fury > 0 || bf0.haste > 0 || bf0.aegis > 0) {
            var bc0 = bf0.aegis > 0 ? '#9ff3ff' : bf0.fury > 0 ? '#ff6b6b' : '#c6ff8a';
            ctx.strokeStyle = R.hexA(bc0, 0.5 + 0.3 * Math.sin(t * 8)); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 24 + Math.sin(t * 5) * 2, 0, TAU); ctx.stroke();
          }
          drawHeroArt(ctx, g, t, view);
          heroDrawnInSort = true;
        }
      }
      // rim light pass, batched so the composite mode switches once per frame
      if (rimQ.length) { ctx.globalCompositeOperation = 'lighter'; for (var rq = 0; rq < rimQ.length; rq++) { var RQ = rimQ[rq]; ctx.globalAlpha = RQ[7]; SP.drawAnim(ctx, RQ[0], RQ[1], RQ[2], RQ[3], RQ[4], RQ[5], RQ[6], RQ[8]); } ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; rimQ.length = 0; }
    }
    for (var ei = 0; ei < g.enemies.length && !ART; ei++) {
      var e = g.enemies[ei];
      if (e.x < camX - 120 || e.x > camX + vw + 120 || e.y < camY - 120 || e.y > camY + vh + 120) continue;
      if (e.boss) { drawBoss(ctx, e, g, t); continue; }
      var bobE = Math.sin(e.ph * 6) * (e.shape === 'bat' ? 3 : 1.5);
      if (e.elite) { ctx.drawImage(glowSprite('#ffd23f', e.r * 2.6), e.x - e.r * 2.6, e.y - e.r * 2.6); }
      var spr = enemySprite(e.shape, e.color, e.r, e.flash > 0);
      ctx.globalAlpha = e.shape === 'ghost' ? 0.7 + Math.sin(e.ph * 3) * 0.2 : 1;
      var sx = 1, sy = 1;
      if (e.shape === 'blob' || e.shape === 'split') { sx = 1 + Math.sin(e.ph * 8) * 0.06; sy = 2 - sx; }
      if (e.type === 'charger' && e.st === 1) { ctx.drawImage(glowSprite('#ff4d4d', e.r * 2.4), e.x - e.r * 2.4, e.y - e.r * 2.4); }
      ctx.drawImage(spr, e.x - spr.pad * sx, e.y - spr.pad * sy + bobE, spr.width * sx, spr.height * sy);
      ctx.globalAlpha = 1;
      // eyes looking at the player
      if (e.flash <= 0) {
        var dx = p.x - e.x, dy = p.y - e.y, dl = Math.sqrt(dx * dx + dy * dy) || 1, ex = dx / dl * e.r * 0.15, ey = dy / dl * e.r * 0.15 + bobE;
        if (e.shape === 'eye') { ctx.fillStyle = '#ffeeb0'; ctx.beginPath(); ctx.arc(e.x + ex * 0.6, e.y + ey, e.r * 0.55, 0, TAU); ctx.fill(); ctx.fillStyle = '#120818'; ctx.beginPath(); ctx.arc(e.x + ex * 2, e.y + ey + dy / dl * e.r * 0.15, e.r * 0.25, 0, TAU); ctx.fill(); }
        else {
          var eyeC = e.elite ? '#ffd23f' : (e.type === 'charger' && e.st === 1 ? '#ff4d4d' : '#ffffff'), er = Math.max(1.6, e.r * 0.16), sep = e.r * 0.36;
          var oy = e.shape === 'horn' ? e.r * 0.15 : e.shape === 'bat' ? -e.r * 0.2 : -e.r * 0.1;
          ctx.fillStyle = eyeC;
          ctx.beginPath(); ctx.arc(e.x - sep + ex, e.y + oy + ey, er, 0, TAU); ctx.arc(e.x + sep + ex, e.y + oy + ey, er, 0, TAU); ctx.fill();
        }
      }
      if (e.elite) { var hpw = e.r * 2; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - hpw / 2, e.y - e.r - 12, hpw, 4); ctx.fillStyle = '#ffd23f'; ctx.fillRect(e.x - hpw / 2, e.y - e.r - 12, hpw * Math.max(0, e.hp / e.maxHp), 4); }
    }

    // player weapons visuals
    for (var wi = 0; wi < p.weapons.length; wi++) {
      var w = p.weapons[wi];
      if (w.key === 'orbit' && w.orbs) for (var oi = 0; oi < w.orbs.length; oi++) {
        var o = w.orbs[oi]; drawGlow(ctx, w.evo ? '#ffd23f' : '#ff9a4a', o.x, o.y, o.r * 2.6);
        var fb = fireSprite(w.evo, (Math.floor(t * 12) + oi) % 3), fr = o.r * 1.5;
        ctx.drawImage(fb, o.x - fr, o.y - fr * 1.25, fr * 2, fr * 2);
      }
    }
    // shots
    ctx.globalCompositeOperation = 'lighter';
    for (var si = 0; si < g.shots.length; si++) {
      var s = g.shots[si];
      drawGlow(ctx, s.color, s.x, s.y, s.r * 3.2);
      if (s.type === 'spark') {
        var va = Math.atan2(s.vy, s.vx), bl = boltSprite(s.evo), L = s.r * 7, Wd = s.r * 2.6;
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(va); ctx.drawImage(bl, -L * 0.82, -Wd / 2, L, Wd); ctx.restore();
      } else if (ART) {
        var mf = [1, 0.55, 0.2, 0.55][Math.floor(s.ph * 4) & 3], ms = 11, mi = mothSprite();
        ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(mi, s.x - ms * mf, s.y - ms, ms * 2 * mf, ms * 2); ctx.globalCompositeOperation = 'lighter';
      } else { var fl = Math.sin(s.ph * 6) * 4; ctx.fillStyle = s.color; ctx.beginPath(); ctx.ellipse(s.x - 4, s.y, 5, 3 + fl * 0.3, 0.6, 0, TAU); ctx.ellipse(s.x + 4, s.y, 5, 3 - fl * 0.3, -0.6, 0, TAU); ctx.fill(); }
    }
    // beams
    for (var mi = 0; mi < g.beams.length; mi++) {
      var bm = g.beams[mi], a = Math.max(0, bm.life / bm.max);
      if (bm.type === 'chain') {
        ctx.strokeStyle = hexA(bm.color, a); ctx.lineWidth = 3; ctx.beginPath();
        for (var pi = 0; pi < bm.pts.length - 1; pi++) {
          var A = bm.pts[pi], B = bm.pts[pi + 1]; ctx.moveTo(A.x, A.y);
          for (var q = 1; q <= 4; q++) { var f = q / 5; ctx.lineTo(A.x + (B.x - A.x) * f + (Math.random() - 0.5) * 16, A.y + (B.y - A.y) * f + (Math.random() - 0.5) * 16); }
          ctx.lineTo(B.x, B.y);
        }
        ctx.stroke(); ctx.strokeStyle = hexA(bm.color, a * 0.25); ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,' + a + ')'; ctx.lineWidth = 1.5; ctx.stroke();
        for (var cp = 1; cp < bm.pts.length; cp++) drawGlow(ctx, bm.color, bm.pts[cp].x, bm.pts[cp].y, 14);
      } else if (bm.type === 'lance') {
        ctx.strokeStyle = hexA(bm.color, a * 0.22); ctx.lineWidth = bm.w * 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bm.x, bm.y); ctx.lineTo(bm.x2, bm.y2); ctx.stroke();
        ctx.strokeStyle = hexA(bm.color, a * 0.6); ctx.lineWidth = bm.w * 1.5; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + a + ')'; ctx.lineWidth = bm.w * 0.45; ctx.stroke(); ctx.lineCap = 'butt';
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (var mj = 0; mj < g.beams.length; mj++) {
      var tb = g.beams[mj];
      if (tb.type === 'tele') { ctx.fillStyle = 'rgba(255,60,60,' + (0.12 + 0.12 * Math.sin(t * 25)) + ')'; ctx.save(); ctx.translate(tb.x, tb.y); ctx.rotate(Math.atan2(tb.y2 - tb.y, tb.x2 - tb.x)); ctx.fillRect(0, -tb.w / 2, Math.hypot(tb.x2 - tb.x, tb.y2 - tb.y), tb.w); ctx.restore(); }
    }
    // nova rings
    for (var ni = 0; ni < g.zones.length; ni++) {
      var nz = g.zones[ni]; if (nz.type !== 'nova' || nz.t < 0) continue;
      var na = 1 - nz.t / nz.dur;
      var nc = nz.burst ? '255,226,122' : '160,240,255';
      ctx.strokeStyle = 'rgba(' + nc + ',' + na + ')'; ctx.lineWidth = (nz.burst ? 12 : 6) * na + 1; ctx.beginPath(); ctx.arc(nz.x, nz.y, nz.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(' + nc + ',' + ((nz.burst ? 0.2 : 0.08) * na) + ')'; ctx.fill();
      if (nz.burst && !view.lowQuality) {
        ctx.strokeStyle = 'rgba(255,248,210,' + (na * 0.75) + ')'; ctx.lineWidth = 3 * na + 1;
        ctx.beginPath(); ctx.arc(nz.x, nz.y, nz.r * 0.72, 0, TAU); ctx.stroke();
        ctx.save(); ctx.translate(nz.x, nz.y); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,232,145,' + (na * 0.55) + ')'; ctx.lineWidth = 2;
        for (var rr = 0; rr < 12; rr++) {
          var ra = rr * TAU / 12 + nz.t * 1.4;
          ctx.beginPath(); ctx.moveTo(Math.cos(ra) * nz.r * 0.3, Math.sin(ra) * nz.r * 0.3);
          ctx.lineTo(Math.cos(ra) * nz.r * 0.96, Math.sin(ra) * nz.r * 0.96); ctx.stroke();
        }
        ctx.restore();
      }
    }

    // player (only drawn here in fallback non-ART mode; ART mode draws hero Y-sorted with props & enemies)
    if (!heroDrawnInSort) {
      var bf = p.buffs || {};
      if (bf.fury > 0 || bf.haste > 0 || bf.aegis > 0) {
        var bc = bf.aegis > 0 ? '#9ff3ff' : bf.fury > 0 ? '#ff6b6b' : '#c6ff8a';
        ctx.strokeStyle = R.hexA(bc, 0.5 + 0.3 * Math.sin(t * 8)); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 24 + Math.sin(t * 5) * 2, 0, TAU); ctx.stroke();
      }
      if (ART) drawHeroArt(ctx, g, t, view); else drawPlayer(ctx, g, t);
    }

    // particles
    ctx.globalCompositeOperation = 'lighter';
    for (var fi = 0; fi < g.fx.length; fi++) {
      var fx = g.fx[fi], fa = Math.max(0, fx.life / fx.max);
      if (fx.type === 'p') { ctx.globalAlpha = fa; ctx.fillStyle = fx.color; ctx.fillRect(fx.x - fx.size / 2, fx.y - fx.size / 2, fx.size, fx.size); }
      else if (fx.type === 'sp') {
        ctx.globalAlpha = fa; ctx.strokeStyle = fx.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(fx.x, fx.y); ctx.lineTo(fx.x - fx.vx * 0.045, fx.y - fx.vy * 0.045); ctx.stroke();
      }
      else if (fx.type === 'pillar') {
        ctx.globalAlpha = fa * 0.9;
        var pw = 110 * (1.2 - fa * 0.5);
        ctx.drawImage(beamSprite(fx.color), fx.x - pw / 2, fx.y - 340, pw, 360);
      }
      else if (fx.type === 'hit') { var hs = hitSprite(fa > 0.66 ? 0 : fa > 0.33 ? 1 : 2), hz = fx.crit ? 26 : 16; ctx.globalAlpha = 1; ctx.drawImage(hs, fx.x - hz, fx.y - hz, hz * 2, hz * 2); }
      else if (fx.type === 'die') {
        if (ART && fx.etype) {
          ctx.globalCompositeOperation = 'source-over';
          var dd2 = ETYPE[fx.etype] || ETYPE.crawler, dc = enemyCanvas(fx.etype, azi, fx.flip), dfr = SP.dissolve(dc), di = fa > 0.66 ? 0 : fa > 0.33 ? 1 : 2;
          var dsz = fx.r * dd2.k, dw = dc.width >= dc.height ? dsz : dsz * dc.width / dc.height, dh = dw * dc.height / dc.width, rise = (1 - fa) * 12;
          ctx.globalAlpha = Math.min(1, fa * 1.6); ctx.drawImage(dfr[di], fx.x - dw / 2, fx.y + fx.r * 0.62 - dh - rise, dw, dh);
          ctx.globalCompositeOperation = 'lighter';
        }
      }
      else if (fx.type === 'ring') { ctx.globalAlpha = fa; ctx.strokeStyle = fx.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * (1.6 - fa * 0.6), 0, TAU); ctx.stroke(); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // ambient particles per land (leaves, bubbles, ash, snow, spores)
    if (!view.lowQuality) {
      var zi = LF.ZONES.indexOf(g.zone); if (zi < 0) zi = 5;
      var amb = view.amb || (view.amb = []), AK = ['#9fd36b', '#8fe3ff', '#ff9a5a', '#e8f4ff', '#d98aff', '#d98aff'][zi];
      while (amb.length < 46) amb.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), ph: Math.random() * 6.3 });
      ctx.fillStyle = AK;
      for (var ab = 0; ab < amb.length; ab++) {
        var am = amb[ab], ax2, ay2, drift = t * 0.02 * am.s;
        if (zi === 1) { ax2 = am.x + Math.sin(t * 0.8 + am.ph) * 0.01; ay2 = am.y - drift * 1.4; }
        else if (zi === 3) { ax2 = am.x + Math.sin(t * 0.5 + am.ph) * 0.02; ay2 = am.y + drift * 1.6; }
        else if (zi === 2) { ax2 = am.x + drift; ay2 = am.y - drift * 0.8; }
        else { ax2 = am.x + Math.sin(t * 0.4 + am.ph) * 0.03 + drift * 0.5; ay2 = am.y + drift * 0.6; }
        ax2 = ((ax2 % 1) + 1) % 1; ay2 = ((ay2 % 1) + 1) % 1;
        var wx2 = camX + ax2 * vw, wy2 = camY + ay2 * vh;
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 2 + am.ph);
        if (zi === 0) ctx.fillRect(wx2, wy2, 4 * am.s, 2 * am.s);
        else { ctx.beginPath(); ctx.arc(wx2, wy2, (zi === 1 ? 2.5 : 1.6) * am.s, 0, TAU); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }

    // warm lantern light on the world (additive), skipped in low quality
    if (ART && !view.lowQuality && g.phase !== 'dead') {
      var lp = heroLanternPos(g, t), wr = lightR0 * 0.8;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + Math.sin(t * 7.3) * 0.03 + Math.sin(t * 2.1) * 0.04;
      ctx.drawImage(warmLight(), lp.x - wr, lp.y - wr, wr * 2, wr * 2);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // lightmap (darkness around the lantern)
    var lm = view.lightmap, lx = lm.getContext('2d'), ls = lm.width / W;
    lx.setTransform(1, 0, 0, 1, 0, 0);
    lx.globalCompositeOperation = 'source-over';
    lx.clearRect(0, 0, lm.width, lm.height);
    lx.fillStyle = 'rgba(' + pal.fog + ',0.87)'; lx.fillRect(0, 0, lm.width, lm.height);
    lx.globalCompositeOperation = 'destination-out';
    function hole(wx, wy, r, a) { var sx = (wx - camX) * sc * ls, sy = (wy - camY) * sc * ls, rr = r * sc * ls; if (sx < -rr || sy < -rr || sx > lm.width + rr || sy > lm.height + rr) return; lx.globalAlpha = a; lx.drawImage(lightPuff, sx - rr, sy - rr, rr * 2, rr * 2); }
    var lightR = (Math.min(vw, vh) * 0.42 + 110) * (0.88 + 0.12 * g.stats.area) * (g.lightFrac ? g.lightFrac() : 1) + Math.sin(t * 2.3) * 6;
    if (g.phase === 'dead') lightR *= Math.max(0.05, 1 - g.endT);
    var lpos = ART ? heroLanternPos(g, t) : p;
    hole(lpos.x, lpos.y, lightR, 1); hole(lpos.x, lpos.y, lightR * 0.6, 1);
    for (var s3 = 0; s3 < g.shots.length && s3 < 50; s3++) hole(g.shots[s3].x, g.shots[s3].y, 60, 0.7);
    for (var z3 = 0; z3 < g.zones.length; z3++) { var zz = g.zones[z3]; if (zz.type === 'meteor' && zz.t >= 0) hole(zz.x, zz.y, zz.r * 2.2, 1); if (zz.type === 'nova' && zz.t >= 0) hole(zz.x, zz.y, zz.r * 1.2, 0.6); }
    for (var g3 = 0; g3 < g.gems.length; g3++) { var gg = g.gems[g3]; if (gg.kind !== 'xp' || gg.v >= 10) hole(gg.x, gg.y, gg.kind === 'chest' ? 110 : gg.kind === 'shrine' ? 150 : 50, 0.8); }
    if (g.boss) hole(g.boss.x, g.boss.y, g.boss.r * 3.2, 0.9);
    for (var e3 = 0; e3 < g.enemies.length; e3++) { var ee = g.enemies[e3]; if (ee.elite) hole(ee.x, ee.y, ee.r * 3, 0.7); }
    lx.globalAlpha = 1;
    // vignette is baked into the half-res lightmap, so it costs no extra full-screen pass
    if (ART && !view.lowQuality) { lx.globalCompositeOperation = 'source-over'; lx.drawImage(vignette(), 0, 0, lm.width, lm.height); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lm, 0, 0, W * dpr, H * dpr);

    // world-space overlay text (damage numbers) above darkness
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, -camX * dpr * sc, -camY * dpr * sc);
    if (opts.numbers) {
      ctx.textAlign = 'center';
      for (var ti = 0; ti < g.texts.length; ti++) {
        var tx = g.texts[ti]; ctx.globalAlpha = Math.min(1, tx.life * 2.5);
        var pop = tx.big && tx.life > 0.55 ? (1 + (tx.life - 0.55) * 2.2) : 1;
        ctx.font = (tx.big ? ('800 ' + Math.round(19 * pop) + 'px ') : '700 13px ') + '"Rubik", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillText(tx.s, tx.x + 1.2, tx.y + 1.2); ctx.fillStyle = tx.color; ctx.fillText(tx.s, tx.x, tx.y);
      }
      ctx.globalAlpha = 1;
    }
    // player hp bar under the lantern
    var hw = 34, hy = p.y + (ART ? 24 : 22); ctx.fillStyle = 'rgba(6,4,10,0.75)'; ctx.fillRect(p.x - hw / 2 - 1, hy - 1, hw + 2, 6);
    ctx.fillStyle = p.hp / p.maxHp < 0.3 ? '#ff4d6d' : '#7dff9a'; ctx.fillRect(p.x - hw / 2, hy, hw * Math.max(0, p.hp / p.maxHp), 4);

    // screen-space: boss pointer, hurt vignette, joystick
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (g.boss) {
      var bx = (g.boss.x - camX) * sc, by = (g.boss.y - camY) * sc;
      if (bx < 0 || by < 0 || bx > W || by > H) {
        var ang = Math.atan2(by - H / 2, bx - W / 2), mxr = W / 2 - 30, myr = H / 2 - 30;
        var k2 = Math.min(Math.abs(mxr / Math.cos(ang)), Math.abs(myr / Math.sin(ang)));
        var ax = W / 2 + Math.cos(ang) * k2, ay = H / 2 + Math.sin(ang) * k2;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang); ctx.fillStyle = g.boss.color; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.fill(); ctx.restore();
      }
    }
    for (var ai = 0; ai < g.gems.length; ai++) {
      var ag = g.gems[ai]; if (ag.kind !== 'chest' && ag.kind !== 'shrine') continue;
      var gx = (ag.x - camX) * sc, gy = (ag.y - camY) * sc;
      if (gx >= 0 && gy >= 0 && gx <= W && gy <= H) continue;
      var an = Math.atan2(gy - H / 2, gx - W / 2), mx2 = W / 2 - 34, my2 = H / 2 - 34;
      var kk2 = Math.min(Math.abs(mx2 / Math.cos(an)), Math.abs(my2 / Math.sin(an)));
      var px2 = W / 2 + Math.cos(an) * kk2, py2 = H / 2 + Math.sin(an) * kk2;
      var colA = ag.kind === 'chest' ? '#ffd23f' : '#fff1b8';
      var pulseA = 0.65 + 0.35 * Math.sin(t * 6);
      ctx.save(); ctx.translate(px2, py2);
      ctx.globalAlpha = pulseA * 0.35; ctx.fillStyle = colA; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
      ctx.globalAlpha = pulseA;
      ctx.rotate(an); ctx.fillStyle = colA; ctx.strokeStyle = '#140f1d'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-7, -8); ctx.lineTo(-4, 0); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore(); ctx.globalAlpha = 1;
    }
    if (g.flashGold > 0) { ctx.fillStyle = 'rgba(255,236,170,' + Math.min(0.35, g.flashGold) + ')'; ctx.fillRect(0, 0, W, H); }
    if (g.flash > 0) {
      var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      var fcol = g.phase === 'won' ? '255,240,200' : '255,40,60';
      vg.addColorStop(0, 'rgba(' + fcol + ',0)'); vg.addColorStop(1, 'rgba(' + fcol + ',' + Math.min(0.55, g.flash * 1.6) + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    if (p.hp / p.maxHp < 0.25 && g.phase !== 'dead') {
      var pulse = 0.18 + 0.12 * Math.sin(t * 6);
      var vg2 = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg2.addColorStop(0, 'rgba(255,0,40,0)'); vg2.addColorStop(1, 'rgba(255,0,40,' + pulse + ')'); ctx.fillStyle = vg2; ctx.fillRect(0, 0, W, H);
    }
    var js = opts.joy;
    if (js && js.active) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(js.ox, js.oy, js.R, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,226,122,0.35)'; ctx.beginPath(); ctx.arc(js.ox + js.dx * js.R, js.oy + js.dy * js.R, 22, 0, TAU); ctx.fill();
    }
  };

  function drawPlayer(ctx, g, t) {
    var p = g.player, col = g.char.color || '#ffe27a';
    if (g.phase === 'dead' && g.endT > 0.3) return;
    var bob = Math.sin(p.anim) * 2.5;
    var blink = p.invuln > 0 && Math.floor(t * 30) % 2 === 0;
    ctx.drawImage(glowSprite(col, 70), p.x - 70, p.y - 70 + bob);
    if (blink) return;
    // cloak
    ctx.fillStyle = '#1b1530';
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 14 + bob); ctx.quadraticCurveTo(p.x + 15, p.y - 4 + bob, p.x + 12, p.y + 16); ctx.quadraticCurveTo(p.x + 4, p.y + 12, p.x, p.y + 17); ctx.quadraticCurveTo(p.x - 4, p.y + 12, p.x - 12, p.y + 16); ctx.quadraticCurveTo(p.x - 15, p.y - 4 + bob, p.x, p.y - 14 + bob); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
    // face glow / eyes
    ctx.fillStyle = '#0a0812'; ctx.beginPath(); ctx.arc(p.x + p.fx * 2, p.y - 5 + bob + p.fy * 1.5, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x - 2.5 + p.fx * 3, p.y - 5.5 + bob + p.fy * 2, 1.6, 0, TAU); ctx.arc(p.x + 2.5 + p.fx * 3, p.y - 5.5 + bob + p.fy * 2, 1.6, 0, TAU); ctx.fill();
    // lantern held in movement direction
    var lx = p.x + p.fx * 15, ly = p.y + 4 + p.fy * 10 + Math.sin(p.anim * 0.5) * 2;
    ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x + p.fx * 8, p.y + p.fy * 4); ctx.lineTo(lx, ly - 6); ctx.stroke();
    ctx.drawImage(glowSprite('#ffd27a', 22), lx - 22, ly - 22);
    ctx.fillStyle = '#fff6d8'; ctx.fillRect(lx - 3.5, ly - 5, 7, 9);
    ctx.fillStyle = '#5a4a30'; ctx.fillRect(lx - 4.5, ly - 6.5, 9, 2); ctx.fillRect(lx - 4.5, ly + 4, 9, 2);
  }

  function drawBoss(ctx, b, g, t) {
    var r = b.r, col = b.color;
    drawGlow(ctx, col, b.x, b.y, r * 3);
    // rotating runes
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.rotate(t * (b.enraged ? 1.6 : 0.6));
    ctx.strokeStyle = hexA(col, 0.6); ctx.lineWidth = 2;
    for (var i = 0; i < 6; i++) { ctx.rotate(TAU / 6); ctx.beginPath(); ctx.moveTo(r * 1.35, -6); ctx.lineTo(r * 1.5, 0); ctx.lineTo(r * 1.35, 6); ctx.stroke(); }
    ctx.restore();
    // body
    var pulse = 1 + Math.sin(t * 3) * 0.04;
    ctx.fillStyle = b.flash > 0 ? '#ffffff' : '#07040c';
    ctx.beginPath();
    for (var k = 0; k <= 40; k++) { var a = k / 40 * TAU, rr = r * pulse * (1 + Math.sin(a * 7 + t * 2) * 0.06 + Math.sin(a * 3 - t) * 0.04); ctx.lineTo(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr); }
    ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke();
    if (b.shield) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.4 + 0.3 * Math.sin(t * 10)) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.25, 0, TAU); ctx.stroke(); }
    // eye
    var p = g.player, dx = p.x - b.x, dy = p.y - b.y, dl = Math.sqrt(dx * dx + dy * dy) || 1;
    var ex = b.x + dx / dl * r * 0.2, ey = b.y + dy / dl * r * 0.2;
    ctx.fillStyle = b.st === 'tele' ? '#ff4d4d' : col; ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.38, r * 0.26, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex + dx / dl * 4, ey + dy / dl * 3, r * 0.08, r * 0.2, 0, 0, TAU); ctx.fill();
  }
  // ================= v1.2 art helpers =================
  var ETYPE = {
    crawler: { k: 3.72, anim: 'squash', face: 1 }, bat: { k: 4.44, anim: 'flap', face: 0 }, brute: { k: 3.60, anim: 'legs', face: 0 },
    spitter: { k: 3.60, anim: 'float', face: 0 }, splitter: { k: 3.36, anim: 'squash', face: 0 }, mini: { k: 4.08, anim: 'float', face: 0 },
    charger: { k: 3.84, anim: 'legs', face: -1 }, wraith: { k: 3.72, anim: 'float', face: 0 }
  };
  var ZTINT = [['#b49cff', 0.3], ['#3fc1c9', 0.5], ['#ff6a3d', 0.5], ['#8fb0ff', 0.45], ['#d14bff', 0.35], ['#e6c36a', 0.5]];
  function enemyCanvas(type, zi, flip) {
    var SP = window.LFSprites, b = SP.base('enemies', type) || SP.base('enemies', 'crawler'), z = ZTINT[zi] || ZTINT[0];
    var c = SP.tint(b, z[0], z[1], 'e' + type);
    return flip ? SP.flip(c) : c;
  }
  function eliteCanvas(c, affix) { return window.LFSprites.rim(c, affix === 'swift' ? '#8ff3ff' : affix === 'armored' ? '#d9d4e8' : '#ffd23f'); }
  var rimQ = [];
  function drawEnemyArt(ctx, e, g, t, zi, lightR, view) {
    var SP = window.LFSprites, d = ETYPE[e.type] || ETYPE.crawler, p = g.player;
    var flip = d.face !== 0 && ((p.x - e.x) * d.face < 0);
    var c = enemyCanvas(e.type, zi, flip), size = e.r * d.k, w, h;
    if (c.width >= c.height) { w = size; h = size * c.height / c.width; } else { h = size; w = size * c.width / c.height; }
    var f = Math.floor(e.ph * (d.anim === 'flap' ? 14 : 8)) & 3, fx = e.x, fy = e.y + e.r * 0.62;
    if (d.anim === 'flap' || d.anim === 'float') fy -= e.r * 0.35;
    if (e.elite) drawGlow(ctx, e.affix === 'swift' ? '#7ad7ff' : '#ffd23f', e.x, e.y, e.r * 2.4);
    if (e.type === 'charger' && e.st === 1) drawGlow(ctx, '#ff4d4d', e.x, e.y, e.r * 2.4);
    if (e.affix === 'swift' && !view.lowQuality) { ctx.globalAlpha = 0.25; SP.drawAnim(ctx, c, fx - (e.vx || 0) * 0.05 - (p.x > e.x ? 6 : -6), fy, w, h, d.anim, (f + 1) & 3, e.ph - 0.12); ctx.globalAlpha = 1; }
    if (e.type === 'wraith') ctx.globalAlpha = 0.78 + Math.sin(e.ph * 3) * 0.15;
    if (e.flash > 0) { SP.drawAnim(ctx, SP.white(c), fx, fy + 1, w * 1.06, h * 0.94, d.anim, f, e.ph); ctx.globalAlpha = 1; return; }
    SP.drawAnim(ctx, c, fx, fy, w, h, d.anim, f, e.ph);
    ctx.globalAlpha = 1;
    if (e.elite) { ctx.globalAlpha = 0.65 + Math.sin(t * 6) * 0.25; SP.drawAnim(ctx, eliteCanvas(c, e.affix), fx, fy, w, h, d.anim, f, e.ph); ctx.globalAlpha = 1; }
    // rim light from the lantern on the facing side (capped at 40 closest for high FPS)
    if (!view.lowQuality && rimQ.length < 40) {
      var dx = p.x - e.x, dy = p.y - e.y, dd = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dd < lightR) {
        rimQ.push([SP.rim(c, '#ffcf8a'), fx + dx / dd * 1.6, fy + dy / dd * 1.6, w, h, d.anim, f, Math.min(0.85, (1 - dd / lightR) * 1.3), e.ph]);
      }
    }
    if (e.elite) { var hpw = e.r * 2; ctx.fillStyle = 'rgba(6,4,10,0.75)'; ctx.fillRect(e.x - hpw / 2 - 1, e.y - e.r - h * 0.55 - 1, hpw + 2, 6); ctx.fillStyle = e.affix === 'swift' ? '#7ad7ff' : '#ffd23f'; ctx.fillRect(e.x - hpw / 2, e.y - e.r - h * 0.55, hpw * Math.max(0, e.hp / e.maxHp), 4); }
  }
  function bossKey(g) { var zi = LF.ZONES.indexOf(g.zone); return zi < 0 ? 'b4' : 'b' + zi; }
  function drawBossArt(ctx, b, g, t, zi, view) {
    var SP = window.LFSprites, r = b.r, col = b.color, p = g.player;
    drawGlow(ctx, col, b.x, b.y, r * 3);
    ctx.save(); ctx.translate(b.x, b.y + r * 0.6); ctx.scale(1, 0.45); ctx.rotate(t * (b.enraged ? 1.6 : 0.6));
    ctx.strokeStyle = hexA(col, 0.55); ctx.lineWidth = 3;
    for (var i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.beginPath(); ctx.moveTo(r * 1.5, -7); ctx.lineTo(r * 1.7, 0); ctx.lineTo(r * 1.5, 7); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, TAU); ctx.stroke(); ctx.restore();
    var key = bossKey(g), base = SP.base('bosses', key); if (!base) return drawBoss(ctx, b, g, t);
    if (zi === 5) base = SP.tint(base, '#e6c36a', 0.55, 'echo');
    var flip = p.x < b.x && key !== 'b1', c = flip ? SP.flip(base) : base;
    var size = r * 3.7, w, h; if (c.width >= c.height) { w = size; h = size * c.height / c.width; } else { h = size; w = size * c.width / c.height; }
    var breathe = 1 + Math.sin(t * 3.8) * 0.035, bobB = Math.sin(t * 2.4) * 5, tiltB = Math.sin(t * 1.9) * 0.04;
    var fy = b.y + r * 0.95;
    ctx.drawImage(SP.shadow, b.x - r * 1.5, fy - r * 0.35, r * 3, r * 0.75);
    var ww = w * (2 - breathe), hh = h * breathe;
    if (b.st === 'tele' || b.st === 'dash' || b.st === 'spiral' || b.st === 'aimed') {
      drawGlow(ctx, b.st === 'tele' || b.st === 'dash' ? '#ff4d4d' : col, b.x, b.y, r * 2.3);
    }
    ctx.save(); ctx.translate(b.x, fy + bobB); ctx.rotate(tiltB);
    ctx.drawImage(b.flash > 0 ? SP.white(c) : c, -ww / 2, -hh, ww, hh);
    if (b.enraged || b.half || b.phase2) { ctx.globalAlpha = 0.42 + 0.35 * Math.sin(t * 9); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(SP.rim(c, '#ff5a6a'), -ww / 2, -hh, ww, hh); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    else if (!view.lowQuality) { var dx = p.x - b.x, dy = p.y - b.y, dd = Math.sqrt(dx * dx + dy * dy) || 1; ctx.globalAlpha = 0.5; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(SP.rim(c, '#ffcf8a'), -ww / 2 + dx / dd * 2, -hh + dy / dd * 2, ww, hh); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    ctx.restore();
    if (b.shield) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.4 + 0.3 * Math.sin(t * 10)) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.35, 0, TAU); ctx.stroke(); }
  }
  function heroCanvas(g, f, flip) {
    var SP = window.LFSprites, b = SP.base('hero', 'h' + f) || SP.base('hero', 'h0');
    var cid = g.char && g.char.id, col = cid && cid !== 'keeper' ? g.char.color : null;
    var c = col ? SP.tint(b, col, 0.45, 'h' + f + cid) : b;
    return flip ? SP.flip(c) : c;
  }
  var lastFace = 1;
  function heroDims(c) { var h = 60, w = h * c.width / c.height; return { w: w, h: h }; }
  function heroFrame(p) { return p.moving ? (Math.floor(p.anim * 1.1) & 3) : 1; }
  function heroLanternPos(g, t) {
    var SP = window.LFSprites, p = g.player; if (Math.abs(p.fx) > 0.2) lastFace = p.fx < 0 ? -1 : 1;
    var f = heroFrame(p), c = SP.base('hero', 'h' + f) || SP.base('hero', 'h0'); if (!c) return p;
    var d = heroDims(c), lf = (SP.heroLanterns && SP.heroLanterns[f]) || SP.heroLantern;
    var bob = p.moving ? [0, -2, 0, -2][f] : Math.sin(t * 2.4) * 1.2;
    var lx = (lf[0] - 0.5) * d.w * lastFace;
    return { x: p.x + lx, y: p.y + 16 - d.h + lf[1] * d.h + bob };
  }
  function drawHeroArt(ctx, g, t, view) {
    var SP = window.LFSprites, p = g.player;
    if (g.phase === 'dead' && g.endT > 0.3) return;
    if (Math.abs(p.fx) > 0.2) lastFace = p.fx < 0 ? -1 : 1;
    var f = heroFrame(p), c = heroCanvas(g, f, lastFace < 0), d = heroDims(c);
    var bob = p.moving ? [0, -2, 0, -2][f] : Math.sin(t * 2.4) * 1.2, footY = p.y + 16;
    ctx.drawImage(SP.shadow, p.x - 19, footY - 6, 38, 13);
    var lp = heroLanternPos(g, t);
    drawGlow(ctx, '#ffc86a', lp.x, lp.y, 52 + Math.sin(t * 7) * 3);
    if (p.invuln > 0 && Math.floor(t * 30) % 2 === 0) { ctx.globalAlpha = 0.45; }
    var prevSm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, p.x - d.w / 2, footY - d.h + bob, d.w, d.h);
    ctx.imageSmoothingEnabled = prevSm;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, '#fff1c2', lp.x, lp.y, 11);
    if (p.light >= 50 && !view.lowQuality) {
      var pr = 12 + (t * 18 % 14), pa = (1 - (pr - 12) / 14) * 0.42;
      ctx.strokeStyle = 'rgba(255,232,140,' + pa.toFixed(3) + ')'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(lp.x, lp.y, pr, 0, TAU); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function drawGroundArt(ctx, g, artZ, azi, camX, camY, vw, vh, t, view, solidProps) {
    var SP = window.LFSprites, img = SP.img['ground' + artZ];
    if (!view.pat || view.patZ !== azi || view.patCtx !== ctx) { view.pat = ctx.createPattern(img, 'repeat'); view.patZ = azi; view.patCtx = ctx; }
    ctx.fillStyle = view.pat; ctx.fillRect(camX - 2, camY - 2, vw + 4, vh + 4);
    if (azi === 5) { ctx.fillStyle = 'rgba(8,8,14,0.45)'; ctx.fillRect(camX - 2, camY - 2, vw + 4, vh + 4); }
    // large soft patches break the tile repetition
    var cs = 300, x0 = Math.floor(camX / cs) - 1, x1 = Math.floor((camX + vw) / cs) + 1, y0 = Math.floor(camY / cs) - 1, y1 = Math.floor((camY + vh) / cs) + 1;
    var bl = blotSprite();
    for (var cx = x0; cx <= x1; cx++) for (var cy = y0; cy <= y1; cy++) {
      var h = hash(cx * 3 + 11, cy * 5 - 7);
      if (h < 0.55) { ctx.globalAlpha = 0.28 + h * 0.4; var bs = 260 + h * 300; ctx.drawImage(bl, cx * cs + hash(cx, cy + 9) * cs - bs / 2, cy * cs + hash(cx + 4, cy) * cs - bs / 2, bs, bs * 0.7); }
    }
    ctx.globalAlpha = 1;
    // deterministic world props: walkable ground cover draws now, solid tall obstacles go into Y-sort queue
    var ps = LF.PROP_CELL || 190, px0 = Math.floor(camX / ps) - 1, px1 = Math.floor((camX + vw) / ps) + 1, py0 = Math.floor(camY / ps) - 1, py1 = Math.floor((camY + vh) / ps) + 1;
    for (var ax = px0; ax <= px1; ax++) for (var ay = py0; ay <= py1; ay++) {
      var pr = LF.worldProp ? LF.worldProp(artZ, ax, ay) : null;
      if (!pr) continue;
      var pc = SP.base('props' + artZ, 'p' + pr.idx); if (!pc) continue;
      var cpc = pr.flip ? SP.flip(pc) : pc;
      var w = cpc.width >= cpc.height ? pr.sz : pr.sz * cpc.width / cpc.height, h2 = w * cpc.height / cpc.width;
      if (pr.solid && solidProps) {
        solidProps.push({ k: 0, fy: pr.y, x: pr.x, y: pr.y, w: w, h: h2, cpc: cpc });
      } else {
        if (!view.lowQuality) ctx.drawImage(SP.shadow, pr.x - w * 0.42, pr.y - h2 * 0.08, w * 0.84, h2 * 0.2);
        ctx.drawImage(cpc, pr.x - w / 2, pr.y - h2, w, h2);
      }
    }
  }
  var artCache = {};
  function once(k, fn) { return artCache[k] || (artCache[k] = fn()); }
  function blotSprite() { return once('blot', function () { var c = makeCanvas(128, 128), x = c.getContext('2d'), g2 = x.createRadialGradient(64, 64, 0, 64, 64, 64); g2.addColorStop(0, 'rgba(0,0,0,0.6)'); g2.addColorStop(0.6, 'rgba(0,0,0,0.25)'); g2.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g2; x.fillRect(0, 0, 128, 128); return c; }); }
  function warmLight() { return once('warm', function () { var c = makeCanvas(256, 256), x = c.getContext('2d'), g2 = x.createRadialGradient(128, 128, 0, 128, 128, 128); g2.addColorStop(0, 'rgba(255,190,110,0.34)'); g2.addColorStop(0.25, 'rgba(255,160,80,0.18)'); g2.addColorStop(0.6, 'rgba(255,130,60,0.06)'); g2.addColorStop(1, 'rgba(255,120,50,0)'); x.fillStyle = g2; x.fillRect(0, 0, 256, 256); return c; }); }
  function vignette() { return once('vig', function () { var c = makeCanvas(256, 256), x = c.getContext('2d'), g2 = x.createRadialGradient(128, 128, 70, 128, 128, 182); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,0.55)'); x.fillStyle = g2; x.fillRect(0, 0, 256, 256); return c; }); }
  function boltSprite(evo) { return once('bolt' + evo, function () {
    var c = makeCanvas(64, 20), x = c.getContext('2d'), g2 = x.createLinearGradient(0, 0, 64, 0);
    g2.addColorStop(0, 'rgba(255,180,60,0)'); g2.addColorStop(0.55, evo ? 'rgba(255,214,90,0.7)' : 'rgba(255,200,80,0.55)'); g2.addColorStop(0.85, 'rgba(255,245,200,1)'); g2.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = g2; x.beginPath(); x.moveTo(0, 10); x.quadraticCurveTo(40, 2, 58, 4); x.arc(56, 10, 6, -Math.PI / 2, Math.PI / 2); x.quadraticCurveTo(40, 18, 0, 10); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(55, 10, 6, 3.2, 0, 0, TAU); x.fill(); return c; }); }
  function fireSprite(evo, n) { return once('fire' + evo + n, function () {
    var c = makeCanvas(32, 32), x = c.getContext('2d'), cols = evo ? ['#fff6d0', '#ffd23f', '#ff9a2a'] : ['#fff0c8', '#ffb347', '#ff5a1f'];
    var s2 = [0, 1.5, -1.5][n];
    x.fillStyle = cols[2]; x.beginPath(); x.moveTo(16, 2 + s2); x.quadraticCurveTo(28, 16, 22, 26); x.quadraticCurveTo(16, 31, 10, 26); x.quadraticCurveTo(4, 16, 16, 2 + s2); x.fill();
    x.fillStyle = cols[1]; x.beginPath(); x.moveTo(16, 9 - s2); x.quadraticCurveTo(24, 18, 20, 25); x.quadraticCurveTo(16, 28, 12, 25); x.quadraticCurveTo(8, 18, 16, 9 - s2); x.fill();
    x.fillStyle = cols[0]; x.beginPath(); x.ellipse(16, 22, 3.5, 4.5, 0, 0, TAU); x.fill(); return c; }); }
  function ebulletSprite(n) { return once('eb' + n, function () {
    var c = makeCanvas(32, 32), x = c.getContext('2d'), g2 = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g2.addColorStop(0, 'rgba(255,240,250,1)'); g2.addColorStop(0.3, 'rgba(255,90,150,1)'); g2.addColorStop(0.45, 'rgba(120,10,60,0.95)'); g2.addColorStop(0.55, 'rgba(255,60,120,0.5)'); g2.addColorStop(1, 'rgba(255,40,100,0)');
    x.fillStyle = g2; x.fillRect(0, 0, 32, 32);
    x.strokeStyle = 'rgba(255,200,220,0.8)'; x.lineWidth = 1.5; x.beginPath();
    for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2 + n * Math.PI / 4; x.moveTo(16 + Math.cos(a) * 8, 16 + Math.sin(a) * 8); x.lineTo(16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12); }
    x.stroke(); return c; }); }
  function hitSprite(n) { return once('hit' + n, function () {
    var c = makeCanvas(32, 32), x = c.getContext('2d'), L = [14, 11, 7][n], W2 = [3, 2.2, 1.4][n];
    x.fillStyle = ['#ffffff', '#fff1c2', '#ffc86a'][n];
    x.beginPath(); x.moveTo(16, 16 - L); x.lineTo(16 + W2, 16 - W2); x.lineTo(16 + L, 16); x.lineTo(16 + W2, 16 + W2); x.lineTo(16, 16 + L); x.lineTo(16 - W2, 16 + W2); x.lineTo(16 - L, 16); x.lineTo(16 - W2, 16 - W2); x.closePath(); x.fill();
    if (n === 0) { x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.arc(16, 16, 5, 0, TAU); x.fill(); }
    return c; }); }
  function iconCanvas(key) {
    var SP = window.LFSprites, M2 = LF.ART_META && LF.ART_META.icons, im = SP && SP.img.icons; if (!M2 || !im || M2[key] === undefined) return null;
    return once('ic' + key, function () { var c = makeCanvas(64, 64); c.getContext('2d').drawImage(im, M2[key] * 64, 0, 64, 64, 0, 0, 64, 64); return c; });
  }
  function mothSprite() { return iconCanvas('moths') || glowSprite('#c6ff8a', 8); }
  function chestSprite() { return once('chest', function () {
    // 16x14 pixel chest, drawn at 2x
    var rows = ['....oooooooo....', '..oowwwwwwwwoo..', '.owwbbbbbbbbwwo.', '.owbbbbbbbbbbwo.', 'oggggggyyggggggo', 'owwwwwwyywwwwwwo', 'owbbbbbyybbbbbwo', 'owbbbbbbbbbbbbwo', 'owbbbbbbbbbbbbwo', 'oggggggggggggggo', 'owbbbbbbbbbbbbwo', 'owwwwwwwwwwwwwwo', '.oooooooooooooo.', '................'];
    var C = { o: '#1a0e06', w: '#8a4f1e', b: '#5c3412', g: '#e2a93a', y: '#fff1a8' };
    var c = makeCanvas(32, 28), x = c.getContext('2d');
    rows.forEach(function (r, y) { for (var i = 0; i < r.length; i++) { var k = r[i]; if (C[k]) { x.fillStyle = C[k]; x.fillRect(i * 2, y * 2, 2, 2); } } });
    return c; }); }
})();
