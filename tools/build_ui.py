# pixel UI frames for CSS border-image (art pixel = 3 css px)
import numpy as np
from PIL import Image
OUT = '/home/box/workspace-denis/gamesup42/lanternfall/assets/art/'
def hexc(h, a=255): h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)
def frame(name, n, fill, rim_hi, rim, rim_lo, ink='#06040a', corner=True, fill_a=240, inner=None):
    a = np.zeros((n, n, 4), np.uint8)
    for y in range(n):
        for x in range(n):
            d = min(x, y, n - 1 - x, n - 1 - y)
            if d == 0: c = hexc(ink)
            elif d == 1:
                c = hexc(rim_hi) if (y == 1 or x == 1) and not (y == n - 2 or x == n - 2) else (hexc(rim_lo) if (y == n - 2 or x == n - 2) else hexc(rim))
            elif d == 2: c = hexc(ink)
            elif d == 3 and inner: c = hexc(inner, fill_a)
            else: c = hexc(fill, fill_a)
            a[y, x] = c
    # cut rounded corners
    for (cx, cy) in [(0, 0), (n - 1, 0), (0, n - 1), (n - 1, n - 1)]:
        a[cy, cx] = (0, 0, 0, 0)
    if corner:  # gold studs in corners
        for (cx, cy) in [(1, 1), (n - 2, 1), (1, n - 2), (n - 2, n - 2)]:
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if abs(dx) + abs(dy) <= 1:
                        yy, xx = cy + dy, cx + dx
                        if 0 <= yy < n and 0 <= xx < n: a[yy, xx] = hexc('#ffe9a8') if dx == 0 and dy == 0 else hexc(rim_hi)
    im = Image.fromarray(a, 'RGBA').resize((n * 3, n * 3), Image.NEAREST)
    im.save(OUT + name + '.png', optimize=True)
frame('ui-panel', 12, '#140f1d', '#f0c36a', '#b9853d', '#6e4a22', fill_a=238, inner='#1d1529')
frame('ui-btn', 10, '#1e1730', '#8f7bb8', '#5d4c82', '#2f2547', corner=False, fill_a=245)
frame('ui-btn-hi', 10, '#2a2045', '#f0c36a', '#b9853d', '#6e4a22', corner=False, fill_a=250)
frame('ui-btn-gold', 10, '#e9a443', '#fff0b8', '#ffd36b', '#a8621f', corner=False, fill_a=255, inner='#f6bc58')
frame('ui-card', 12, '#191226', '#9c88c9', '#62528c', '#2f2547', fill_a=245, inner='#211836')
frame('ui-card-evo', 12, '#2b1d0c', '#fff0b8', '#f0c36a', '#8a5a1e', fill_a=245, inner='#3a2810')
frame('ui-slot', 8, '#0d0a14', '#7d6aa6', '#4f4170', '#251d38', corner=False, fill_a=220)
print('ok')
