# warpdom logo, version 2 (the plain checkbox, chosen 2026-10-13), redrawn as geometry.
import os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
BLUE, CYAN = '#2563EB', '#22D3EE'
OUT = 'out2'
def mark(check=CYAN, lines=True):
    # Units: the box is 60 high; its bottom-left outer corner is at (0, 60), top shifted right by 8.4 (about 8 degrees).
    box = '<rect x="2.95" y="2.95" width="53.8" height="54.1" rx="6.5" fill="none" stroke="%s" stroke-width="5.9" transform="translate(8.4 0) skewX(-7.97)"/>' % BLUE
    ck = '<path d="M16.5 30.3 L29.7 43.5 L53.4 18.1" fill="none" stroke="%s" stroke-width="6.4" stroke-linejoin="miter"/>' % check
    sl = ''.join('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="5.4" stroke-linecap="round"/>' % (a, y, b, y, BLUE)
                 for a, b, y in [(-15.8, 7.5, 14.3), (-30.1, 4.5, 30.6), (-14.9, 2.5, 45.4)]) if lines else ''
    return sl + box + ck
_f = {}
def font(w, wd):
    if (w, wd) not in _f: _f[(w, wd)] = instantiateVariableFont(TTFont('Saira-Italic.ttf'), {'wght': w, 'wdth': wd})
    return _f[(w, wd)]
def text(s, w, wd, size, x, y, fill):
    f = font(w, wd); k = size / f['head'].unitsPerEm; cmap = f.getBestCmap(); gs = f.getGlyphSet(); pen = SVGPathPen(gs); cur = 0
    for ch in s:
        g = cmap[ord(ch)]; gs[g].draw(TransformPen(pen, (k, 0, 0, -k, x + cur, y))); cur += f['hmtx'][g][0] * k
    return '<path fill="%s" d="%s"/>' % (fill, pen.getCommands()), cur
def xh(w, wd): f = font(w, wd); return f['OS/2'].sxHeight / f['head'].unitsPerEm
def wordmark(color, x0=77.3, base=39.8, xheight=18.8):
    size = xheight / xh(800, 112)
    a, wa = text('warp', 800, 112, size, x0, base, color)
    b, wb = text('dom', 300, 112, size, x0 + wa + 1.2, base, color)
    return a + b, x0 + wa + 1.2 + wb
def svg(vb, body, bg=None):
    x, y, W, H = vb
    r = '<rect x="%s" y="%s" width="%s" height="%s" fill="%s"/>' % (x, y, W, H, bg) if bg else ''
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s %s %s %s">%s%s</svg>\n' % (x, y, W, H, r, body)
if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    LIGHT_CHECK, DARK_TEXT, LIGHT_TEXT = '#0891B2', '#E8E9ED', '#0F172A'
    M = (-34, -4, 106, 68)
    open(f'{OUT}/warpdom-icon.svg', 'w').write(svg(M, mark()))
    open(f'{OUT}/warpdom-icon-light.svg', 'w').write(svg(M, mark(LIGHT_CHECK)))
    open(f'{OUT}/favicon.svg', 'w').write(svg((-1, -1, 72, 62), mark(lines=False)).replace('viewBox="-1 -1 72 62"', 'viewBox="-1 -6 72 72"'))
    for name, tc, ck in [('dark', DARK_TEXT, CYAN), ('light', LIGHT_TEXT, LIGHT_CHECK)]:
        wm, right = wordmark(tc)
        open(f'{OUT}/warpdom-lockup-{name}.svg', 'w').write(svg((-34, -4, right + 4 + 34, 68), mark(ck) + wm))
    wm, right = wordmark(DARK_TEXT); lw = right + 4 + 34; W, H = 1280, 640; sc = 960 / lw
    tag, tw = text('Same test results as jsdom. Faster.', 400, 100, 40, 0, 0, '#94A3B8')
    g = '<g transform="translate(%.1f %.1f) scale(%.4f)">%s%s</g>' % ((W - 960) / 2 + 34 * sc, 190, sc, mark(), wm)
    t = '<g transform="translate(%.1f 520)">%s</g>' % ((W - tw) / 2, tag)
    open(f'{OUT}/social-preview.svg', 'w').write(svg((0, 0, W, H), g + t, bg='#1E1F25'))
    print('lockup width', round(lw, 1))
