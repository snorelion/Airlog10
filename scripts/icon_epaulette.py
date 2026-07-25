#!/usr/bin/env python3
"""AirLog10 앱 아이콘 손보기 — 기장 견장(금색 4줄) + 제트기 1.3배.

배경: 07-21 리디자인 때 아이콘을 그린 생성기는 커밋되지 않았고 PNG만 남아 있다.
그래서 기존 PNG에서 '빨간 바'와 '제트기'를 찾아 그 부분만 다시 그린다.
(라이언님 요청: 노트 왼쪽 빨간 줄 하나 → 기장 견장처럼 얇은 금색 4줄, 비행기는 더 크게)

- 견장: 빨간 바를 책등 색으로 덮고, 그 위 band(260~525 @1024)에 금색 4줄.
  줄 두께 비율 0.56 — 큰 화면에서 견장 느낌이 나면서 홈화면 60px에서도 4줄이 구분되는 지점.
  40px 이하에서는 어떤 값이든 금색 띠 하나로 뭉친다(4줄×최소1px+간격이 물리적으로 안 들어감).
- 제트기: 몸통 한 점에서 BFS로 이어진 획만 마스크로 잡는다. 색 기준만 쓰면
  페이지 둥근 모서리의 안티에일리어싱(파랑 섞임)까지 잡혀 페이지에 자국이 남는다.
  확대본은 항상 1024 마스터의 스프라이트를 원본으로 리샘플 → 작은 파일도 선명하다.
  '지금 페이지 색인 픽셀에만' 그려서 연필 뒤로 들어가게 한다.

일반 5종은 프레이밍이 같아 1024를 고쳐 축소하고, maskable 2종은 안전영역(82%)이라
프레이밍이 달라 512를 따로 고쳐 192로 축소한다.

실행: python3 scripts/icon_epaulette.py [--out DIR]
"""
from PIL import Image, ImageDraw
from collections import deque
import argparse
import os

ICONS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'icons')

SPINE = (21, 24, 28)          # 책등(검은띠) 색
# 금색은 거의 한 톤으로 — 위/아래를 뚜렷한 2색으로 칠하면 한 줄이 두 줄처럼 보여
# 4줄이 8줄처럼 번잡해진다(첫 시도에서 확대 검증하다 발견). 아래 25%만 살짝 어둡게.
GOLD = (228, 186, 88)
GOLD_EDGE = (198, 154, 58)
# 줄이 놓일 영역은 '빨간 바' 위치를 기준으로 잡는다 — 아이콘 높이 비율로 잡으면
# maskable(안전영역 82%)처럼 프레이밍이 다른 판에서 노트 대비 위치가 어긋난다.
# 1024에서 확정한 값(260~525, 빨간 바 262~391)을 바 높이의 배수로 환산했다.
BAND_TOP_OFF = -0.02   # 바 위쪽에서 시작 (바 높이 비율)
BAND_SPAN = 2.04       # 바 높이의 몇 배를 쓸지
THICK = 0.56                  # band 안에서 줄이 차지하는 비율
JET_K = 1.30                  # 제트기 확대 배율
JET_DY = -12 / 1024           # 확대하면서 살짝 위로 (연필과의 간격 확보)


def _red_bbox(im):
    px = im.load()
    W, H = im.size
    xs, ys = [], []
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a > 200 and r > 170 and g < 90 and b < 100:
                xs.append(x); ys.append(y)
    if not xs:
        raise SystemExit('빨간 바를 찾지 못했어요 — 이미 적용된 아이콘일 수 있어요.')
    return min(xs), min(ys), max(xs), max(ys)


def _page_bbox(im):
    """노트의 흰 페이지 영역 (제트기 탐색 범위를 여기로 한정)."""
    px = im.load()
    W, H = im.size
    xs, ys = [], []
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a > 200 and r > 195 and g > 200 and b > 205 and abs(r - b) < 30:
                xs.append(x); ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def _jet(im, page):
    """제트기 마스크·bbox — 페이지 안쪽에서 가장 파란 픽셀을 씨앗으로 BFS."""
    px = im.load()
    x0, y0, x1, y1 = page

    def blue(x, y):
        r, g, b, a = px[x, y]
        return a > 120 and r < 175 and b - r > 40

    # 씨앗은 페이지 '안쪽'에서만 찾는다 — 페이지 둥근 모서리의 안티에일리어싱은
    # 배경 파랑이 섞여 제트기보다 더 파랗게(b-r 값이 큼) 나오므로 테두리를 넉넉히 피한다.
    ix = round((x1 - x0) * 0.15)
    iy = round((y1 - y0) * 0.15)
    seed, best = None, -1
    for y in range(y0 + iy, y1 - iy, 2):
        for x in range(x0 + ix, x1 - ix, 2):
            r, g, b, a = px[x, y]
            if a > 200 and r < 175 and (b - r) > best:
                best, seed = b - r, (x, y)
    if seed is None:
        raise SystemExit('제트기를 찾지 못했어요.')

    W, H = im.size
    mask = Image.new('L', (W, H), 0)
    mp = mask.load()
    q = deque([seed])
    mp[seed] = 255
    cells = [seed]
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if x0 < nx < x1 and y0 < ny < y1 and mp[nx, ny] == 0 and blue(nx, ny):
                mp[nx, ny] = 255
                cells.append((nx, ny))
                q.append((nx, ny))
    xs = [c[0] for c in cells]
    ys = [c[1] for c in cells]
    bb = (min(xs), min(ys), max(xs), max(ys))
    # 마스크가 페이지 테두리까지 새면(=모서리 안티에일리어싱을 물었으면) 페이지에 자국이 남는다.
    m = round(W * 0.02)
    if bb[0] < x0 + m or bb[1] < y0 + m or bb[2] > x1 - m or bb[3] > y1 - m:
        raise SystemExit(f'제트기 마스크가 페이지 테두리까지 번졌어요: {bb} vs 페이지 {page}')
    return mask, bb


def _stripes(im, red):
    """빨간 바를 지우고 금색 4줄을 얹는다."""
    W, H = im.size
    px = im.load()
    d = ImageDraw.Draw(im)
    # 빨간 바 지우기 — 사각형만 덮으면 안티에일리어싱 잔털(빨간 픽셀)이 가장자리에 남는다.
    # 바 주변을 넉넉히 훑어 '붉은 기가 도는 픽셀'을 모두 책등 색으로 바꾼다.
    pad = max(2, round(W * 0.008))
    for y in range(max(0, red[1] - pad), min(H, red[3] + pad + 1)):
        for x in range(max(0, red[0] - pad), min(W, red[2] + pad + 1)):
            r, g, b, a = px[x, y]
            if a > 60 and r > g + 22 and r > b + 22:
                px[x, y] = SPINE + (255,)
    rh = red[3] - red[1] + 1
    t0 = red[1] + BAND_TOP_OFF * rh
    hb = rh * BAND_SPAN
    st = hb * THICK / 4
    gp = hb * (1 - THICK) / 3
    for i in range(4):
        y = t0 + i * (st + gp)
        d.rectangle([red[0], y, red[2], y + st], fill=GOLD + (255,))
        d.rectangle([red[0], y + st * 0.75, red[2], y + st], fill=GOLD_EDGE + (255,))


def retouch(im, jet_src):
    """im을 제자리에서 손본다. jet_src = 1024 마스터에서 떼어낸 제트기 스프라이트."""
    im = im.convert('RGBA')
    W, H = im.size
    page = _page_bbox(im)
    mask, (jx0, jy0, jx1, jy1) = _jet(im, page)
    mp = mask.load()
    px = im.load()
    d = ImageDraw.Draw(im)

    # 1) 원래 제트기 지우기 — 행마다 페이지 색을 샘플해 메운다 (페이지는 세로 그라데이션)
    sample_x = page[0] + max(2, round(W * 0.06))
    for y in range(jy0, jy1 + 1):
        col = px[sample_x, y][:3] + (255,)
        run = None
        for x in range(jx0, jx1 + 2):
            on = mp[x, y] > 0 if x <= jx1 else False
            if on and run is None:
                run = x
            elif not on and run is not None:
                d.rectangle([run, y, x - 1, y], fill=col)
                run = None

    # 2) 확대한 제트기 얹기 — 페이지 색인 곳에만 (연필·책등 보호 = 연필 뒤로)
    tw = round((jx1 - jx0 + 1) * JET_K)
    th = round((jy1 - jy0 + 1) * JET_K)
    sp = jet_src.resize((tw, th), Image.LANCZOS)
    cx, cy = (jx0 + jx1) / 2, (jy0 + jy1) / 2
    ox = round(cx - tw / 2)
    oy = round(cy - th / 2 + JET_DY * H)
    spp = sp.load()
    for yy in range(th):
        for xx in range(tw):
            sr, sg, sb, sa = spp[xx, yy]
            if sa < 8:
                continue
            X, Y = ox + xx, oy + yy
            if not (0 <= X < W and 0 <= Y < H):
                continue
            r, g, b, _ = px[X, Y]
            if r > 185 and g > 190 and b > 195:
                f = sa / 255
                px[X, Y] = (round(sr * f + r * (1 - f)),
                            round(sg * f + g * (1 - f)),
                            round(sb * f + b * (1 - f)), 255)

    _stripes(im, _red_bbox(im))
    return im


def save(im, path, size=None):
    out = im.resize((size, size), Image.LANCZOS) if size else im
    # 전부 풀블리드 배경이라 알파가 필요 없다. iOS 1024는 알파가 있으면 심사에서 반려된다.
    out.convert('RGB').save(path, 'PNG')
    print(f'  저장 {os.path.basename(path)} {out.size[0]}px')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=ICONS)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    master = Image.open(os.path.join(ICONS, 'icon-1024.png')).convert('RGBA')
    # 제트기 스프라이트는 마스터에서 한 번만 떼어내 모든 파일에 재사용 (선명도 유지)
    page = _page_bbox(master)
    jm, jb = _jet(master, page)
    sprite = master.copy()
    sprite.putalpha(jm)
    sprite = sprite.crop((jb[0], jb[1], jb[2] + 1, jb[3] + 1))
    print(f'제트기 스프라이트 {sprite.width}x{sprite.height} (1024 기준)')

    print('일반 아이콘 (1024 편집 → 축소)')
    m = retouch(master.copy(), sprite)
    save(m, os.path.join(a.out, 'icon-1024.png'))
    save(m, os.path.join(a.out, 'icon-512.png'), 512)
    save(m, os.path.join(a.out, 'icon-192.png'), 192)
    save(m, os.path.join(a.out, 'apple-touch-icon.png'), 180)
    save(m, os.path.join(a.out, 'favicon-32.png'), 32)

    print('maskable (안전영역이라 프레이밍이 달라 따로 편집)')
    mk = Image.open(os.path.join(ICONS, 'icon-maskable-512.png')).convert('RGBA')
    mk = retouch(mk, sprite)
    save(mk, os.path.join(a.out, 'icon-maskable-512.png'))
    save(mk, os.path.join(a.out, 'icon-maskable-192.png'), 192)


if __name__ == '__main__':
    main()
