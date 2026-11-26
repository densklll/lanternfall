# Lanternfall v1.2 art pipeline: key out sheet backgrounds, cut sprites, downscale, pack atlases.
import numpy as np, json, sys
from PIL import Image
from scipy import ndimage as ndi
SRC = '/home/box/workspace-denis/gamesup42/art-src/'
OUT = '/home/box/workspace-denis/gamesup42/lanternfall/assets/art/'
DBG = '/home/box/workspace-denis/gamesup42/art-src/dbg/'
import os; os.makedirs(DBG, exist_ok=True)

def key(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    H, W, _ = a.shape
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    alpha = np.clip((d - 70) / 70, 0, 1)
    # despill: remove background contribution from edge pixels
    am = np.maximum(alpha, 1e-3)[..., None]
    col = np.clip((a - (1 - am) * bg) / am, 0, 255)
    col = np.where(alpha[..., None] > 0.98, a, col)
    return col, alpha, bg

def cut(path, min_frac=0.002, group=14, expect=None):
    col, alpha, bg = key(path)
    H, W = alpha.shape
    m = alpha > 0.5
    m = ndi.binary_opening(m, iterations=1)
    grp = ndi.binary_dilation(m, iterations=group)
    lab, n = ndi.label(grp, structure=np.ones((3, 3)))
    objs = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        if sl is None: continue
        region = (lab[sl] == i + 1) & m[sl]
        area = region.sum()
        if area < min_frac * H * W: continue
        ys, xs = np.nonzero(region)
        y0, y1, x0, x1 = sl[0].start + ys.min(), sl[0].start + ys.max() + 1, sl[1].start + xs.min(), sl[1].start + xs.max() + 1
        objs.append(dict(y0=y0, y1=y1, x0=x0, x1=x1, cy=(y0 + y1) / 2, cx=(x0 + x1) / 2, lab=i + 1))
    # rows
    objs.sort(key=lambda o: o['cy'])
    rows = []
    for o in objs:
        if rows and abs(o['cy'] - np.mean([r['cy'] for r in rows[-1]])) < H * 0.16: rows[-1].append(o)
        else: rows.append([o])
    out = []
    for r in rows:
        for o in sorted(r, key=lambda o: o['cx']):
            sl = (slice(o['y0'], o['y1']), slice(o['x0'], o['x1']))
            msk = (lab[sl] == o['lab'])
            a2 = alpha[sl] * ndi.binary_dilation(msk & (alpha[sl] > 0.1), iterations=1)
            rgba = np.dstack([col[sl], a2 * 255]).astype(np.uint8)
            out.append(Image.fromarray(rgba, 'RGBA'))
    if expect and len(out) != expect: print('WARN', path, 'found', len(out), 'expected', expect)
    return out

def shrink(im, maxdim):
    w, h = im.size; s = maxdim / max(w, h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    a = np.asarray(im).astype(np.float32) / 255
    pm = a.copy(); pm[..., :3] *= pm[..., 3:4]
    img = Image.fromarray((pm * 255).astype(np.uint8), 'RGBA').resize((nw, nh), Image.LANCZOS)
    b = np.asarray(img).astype(np.float32) / 255
    al = b[..., 3:4]
    rgb = np.where(al > 0.01, b[..., :3] / np.maximum(al, 1e-3), 0)
    al2 = np.clip((al - 0.3) / 0.4, 0, 1)  # crisp silhouette edge
    res = np.dstack([np.clip(rgb, 0, 1), al2]) * 255
    return Image.fromarray(res.astype(np.uint8), 'RGBA')

def pack(name, sprites, names, maxdim, pad=2):
    ims = [shrink(s, maxdim) for s in sprites]
    W = sum(i.size[0] + pad for i in ims) + pad; H = max(i.size[1] for i in ims) + pad * 2
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0)); meta = {}; x = pad
    for nm, im in zip(names, ims):
        atlas.paste(im, (x, pad)); meta[nm] = [x, pad, im.size[0], im.size[1]]; x += im.size[0] + pad
    q = atlas.quantize(colors=255, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    q.save(OUT + name + '.png', optimize=True)
    atlas.save(DBG + name + '_full.png')
    return meta

def seamless(t):
    n = t.shape[0]
    s = np.roll(np.roll(t, n // 2, 0), n // 2, 1)
    yy, xx = np.mgrid[0:n, 0:n]
    e = np.minimum(np.minimum(yy, n - 1 - yy), np.minimum(xx, n - 1 - xx)) / (n / 2)
    w = np.clip(e * 2.2, 0, 1)[..., None]
    w = w * w * (3 - 2 * w)
    return t * w + s * (1 - w)

def grade(t, mul, sat):
    g = t.mean(-1, keepdims=True)
    t = g + (t - g) * sat
    return np.clip(t * mul, 0, 255)

META = {}
names_e = ['crawler', 'bat', 'brute', 'spitter', 'splitter', 'mini', 'charger', 'wraith']
META['enemies'] = pack('enemies', cut(SRC + 'enemies.jpg', expect=8), names_e, 128)
names_b = ['b0', 'b1', 'b2', 'b3', 'b4']
META['bosses'] = pack('bosses', cut(SRC + 'bosses.jpg', expect=5, group=8), names_b, 256)
META['hero'] = pack('hero', cut(SRC + 'hero.jpg', expect=4), ['h0', 'h1', 'h2', 'h3'], 128)
for z in range(5):
    sp = cut(SRC + 'props%d.jpg' % z, expect=6, group=10)
    META['props%d' % z] = pack('props%d' % z, sp, ['p%d' % i for i in range(len(sp))], 176)
ic = cut(SRC + 'icons.jpg', group=10)
print('icons found', len(ic))
icon_names = ['spark', 'orbit', 'nova', 'chain', 'lance', 'moths', 'meteor', 'meteor2', 'might', 'echo', 'halo', 'wind', 'heart', 'regen', 'magnet', 'focus', 'luck', 'armor', 'multi']
# icons into a fixed 64px grid (for CSS sprites)
cell = 64; icons = Image.new('RGBA', (cell * len(ic), cell), (0, 0, 0, 0)); META['icons'] = {}
for i, (nm, im) in enumerate(zip(icon_names, ic)):
    s = shrink(im, cell - 6); icons.paste(s, (i * cell + (cell - s.size[0]) // 2, (cell - s.size[1]) // 2)); META['icons'][nm] = i
icons.save(OUT + 'icons.png', optimize=True)
# ground tiles
g4 = np.asarray(Image.open(SRC + 'ground4.jpg').convert('RGB')).astype(np.float32)
h = g4.shape[0] // 2
tiles = [g4[24:h - 24, 24:h - 24], g4[24:h - 24, h + 24:-24], g4[h + 24:-24, 24:h - 24], g4[h + 24:-24, h + 24:-24]]
gh = np.asarray(Image.open(SRC + 'ground_heart.jpg').convert('RGB')).astype(np.float32)[40:-40, 40:-40]
tiles.append(gh)
grades = [(1.05, 0.9), (0.95, 0.85), (1.05, 0.9), (0.72, 0.75), (1.2, 1.0)]
for z, t in enumerate(tiles):
    im = Image.fromarray(t.astype(np.uint8)).resize((256, 256), Image.LANCZOS)
    t2 = seamless(np.asarray(im).astype(np.float32))
    t2 = grade(t2, *grades[z])
    Image.fromarray(t2.astype(np.uint8)).save(OUT + 'ground%d.jpg' % z, quality=86)
json.dump(META, open(OUT + 'meta.json', 'w'))
print(json.dumps({k: (len(v) if isinstance(v, dict) else v) for k, v in META.items()}))
js = '// generated by build_art.py: sprite atlas rectangles [x, y, w, h]\n(function (LF) { LF.ART_META = ' + json.dumps(META) + '; })(typeof window !== "undefined" ? window.LF : globalThis.LF);\n'
open('/home/box/workspace-denis/gamesup42/lanternfall/js/art.js', 'w').write(js)
