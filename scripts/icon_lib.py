#!/usr/bin/env python3
"""앱 아이콘 공통 드로잉 (학생 · 매니저).

두 앱은 같은 그림을 쓰고 색만 다르다 → 여기 한 곳에서만 그린다.
(예전엔 이 그리기 코드가 세 스크립트에 복사돼 있어서 아이콘을 고치려면
세 곳을 똑같이 고쳐야 했다.)

디자인 (2026-07-17 확정):
  - 배경: 메시 그라데이션 (학생=파랑 / 매니저=골드)
  - 노트: 흰 페이지 + 검은 책등 + 빨간 바 → 검은띠의 그것. 두 앱이 공유한다.
  - BJJ: 세로 그라데이션 글자
  - 연필: 학생=노랑 / 매니저=네이비
  - 노트·연필 아래 부드러운 그림자

쓰는 곳: make_icon.py(학생 웹) · make_manager_icons.py(매니저 웹)
        make_ios_icons.py(학생 iOS) · make_manager_ios_icons.py(매니저 iOS)
"""
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SS = 4                      # supersample — 최종은 여기서 축소해 뽑는다
N = 1024 * SS
CORNER_R = 230              # 1024 기준 iOS 둥근모서리
SAFE = 0.82                 # maskable 안전영역 (안드로이드 적응형 아이콘)
# 리디자인 때 노트가 예전(536×712)보다 작아져(452×604) 배경이 너무 보였다(라이언님 지적).
# 그림 전체를 중심 기준으로 키워 예전 노트 크기로 되돌린다. 1.18 × 452 ≈ 533, 1.18 × 604 ≈ 713.
CONTENT_SCALE = 1.18

# 원본 아이콘의 BJJ 글자체 = Arial Bold (날렵하고 멋짐). 리디자인 때 Arial Black으로
# 바뀌어 뭉툭해졌던 걸 되돌린다(라이언님 지적, 2026-07-17).
FONT_PATH = next((p for p in [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
] if os.path.exists(p)), None)

# BJJ 워드마크 글자 설정 — 폰트 실험/교체가 쉽도록 모듈 변수로 둔다.
# 확정: Didot (고전 세리프) — 라이언님 선택(2026-07-17). 클래식하면서 획 대비가 뚜렷해
# 작은 홈화면 크기에서도 또렷하다. 6종 비교 후 결정.
_DIDOT = "/System/Library/Fonts/Supplemental/Didot.ttc"
BJJ_FONT = _DIDOT if os.path.exists(_DIDOT) else FONT_PATH
BJJ_FONT_INDEX = 1 if os.path.exists(_DIDOT) else 0   # .ttc 묶음폰트에서 고를 인덱스(Didot Bold)
BJJ_SIZE = 165       # CONTENT_SCALE(1.18) 확대 후의 최종 존재감
BJJ_LS = 8           # 자간
BJJ_SW = 1           # stroke_width (세리프는 얇게)
BJJ_CX = 560
BJJ_CY = 452

# 두 앱 공통
BAR_RED = (210, 32, 48)         # 검은띠의 빨간 바
SPINE = (21, 24, 28)            # 책등 = 검은띠
PAGE = ((255, 255, 255), (228, 236, 248))

# 옛날(원본) 연필 부속 색 — 지우개·금속 링·나무·심 (라이언님이 원본 연필을 선호, 2026-07-17)
PEN_ERASER = (244, 150, 166)
PEN_FERRULE = (176, 182, 190)
PEN_WOOD = (226, 178, 120)
PEN_GRAPHITE = (45, 45, 48)

STUDENT = dict(
    base=((58, 140, 226), (14, 60, 130)),
    glows=[((180, 140), 760, (120, 220, 255), 150),
           ((900, 320), 680, (86, 142, 255), 110),
           ((620, 980), 760, (0, 214, 224), 96)],
    pencil_body=(242, 183, 5),      # 원본 연필의 노랑
    text=((74, 155, 224), (12, 62, 122)),
)

MANAGER = dict(
    base=((226, 190, 78), (150, 112, 18)),
    glows=[((180, 140), 760, (255, 232, 150), 150),
           ((910, 330), 660, (214, 170, 50), 110),
           ((600, 990), 740, (120, 86, 10), 90)],
    pencil_body=(36, 67, 108),      # 매니저 구분용 네이비 몸통 (지우개·나무·심은 공통)
    text=((58, 96, 148), (12, 34, 66)),
)


def s(v):
    return round(v * SS)


def lin_grad(top, bot, size=N):
    im = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(im)
    for y in range(size):
        t = y / (size - 1)
        d.line([(0, y), (size, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bot)))
    return im.convert("RGBA")


def _radial(cx, cy, r, color, alpha):
    """원형 글로우. 저해상도로 그려 확대한다 — 어차피 뿌옇고, 4096에 직접 그리면 느리다."""
    LO = 512
    k = LO / N
    lay = Image.new("RGBA", (LO, LO), color + (0,))
    m = Image.new("L", (LO, LO), 0)
    d = ImageDraw.Draw(m)
    cx, cy, r = cx * k, cy * k, r * k
    steps = 60
    for i in range(steps, 0, -1):
        rr = r * i / steps
        a = round(alpha * (1 - i / steps) ** 1.6)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=a)
    lay.putalpha(m)
    return lay.resize((N, N), Image.BICUBIC)


def _shadow(mask, blur, dy, alpha):
    sh = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    sh.paste(Image.new("RGBA", (N, N), (4, 18, 36, alpha)), (0, dy), mask)
    return sh.filter(ImageFilter.GaussianBlur(blur))


def _note_mask():
    m = Image.new("L", (N, N), 0)
    ImageDraw.Draw(m).rounded_rectangle([s(286), s(210), s(738), s(814)], radius=s(46), fill=255)
    return m


def background(pal):
    """메시 그라데이션 배경 (풀블리드 정사각)."""
    bg = lin_grad(*pal["base"])
    for (cx, cy), r, col, a in pal["glows"]:
        bg.alpha_composite(_radial(s(cx), s(cy), s(r), col, a))
    return bg.filter(ImageFilter.GaussianBlur(s(6)))


def content(pal):
    """노트 + BJJ + 연필 (+그림자). 배경 없는 투명 레이어."""
    lay = Image.new("RGBA", (N, N), (0, 0, 0, 0))

    # 노트 (그림자 → 페이지)
    nm = _note_mask()
    lay.alpha_composite(_shadow(nm, s(16), s(10), 64))
    lay.paste(lin_grad(*PAGE), (0, 0), nm)

    # 책등 = 검은띠 (왼쪽만 둥글게)
    spine = Image.new("L", (N, N), 0)
    ds = ImageDraw.Draw(spine)
    ds.rounded_rectangle([s(286), s(210), s(428), s(814)], radius=s(46), fill=255)
    ds.rectangle([s(382), s(210), s(428), s(814)], fill=0)
    lay.paste(Image.new("RGBA", (N, N), SPINE + (255,)), (0, 0), spine)

    # 빨간 바
    ImageDraw.Draw(lay).rectangle([s(286), s(300), s(382), s(410)], fill=BAR_RED)

    # BJJ — 원본의 멋진 글자체(Arial Bold) + 자간 + 큰 크기, 세로 그라데이션.
    # 크기 BJJ_SIZE=150은 아래 CONTENT_SCALE(1.18) 확대 후 최종 ≈177 → 원본(176)과 같은 존재감.
    # 폰트·크기·자간은 모듈 변수로 빼 두어 실험/교체가 쉽다(BJJ_* 참고).
    tm = Image.new("L", (N, N), 0)
    td = ImageDraw.Draw(tm)
    f = ImageFont.truetype(BJJ_FONT, s(BJJ_SIZE), index=BJJ_FONT_INDEX) if BJJ_FONT else ImageFont.load_default()
    word, ls, sw = "BJJ", s(BJJ_LS), s(BJJ_SW)
    widths = [td.textlength(c, font=f) for c in word]
    total = sum(widths) + ls * (len(word) - 1)
    bb = td.textbbox((0, 0), word, font=f, stroke_width=sw)
    cx, cy = s(BJJ_CX), s(BJJ_CY)
    x = cx - total / 2
    ty = cy - (bb[3] - bb[1]) / 2 - bb[1]
    for i, c in enumerate(word):
        td.text((x, ty), c, font=f, fill=255, stroke_width=sw, stroke_fill=255)
        x += widths[i] + ls
    lay.paste(lin_grad(*pal["text"]), (0, 0), tm)

    # 연필 — 옛날(원본) 연필 모양: 몸통+금속 링+분홍 지우개+나무+심 (심이 왼쪽 아래).
    # 원본 스크립트의 좌표·크기를 그대로 쓰되, 아래 CONTENT_SCALE 확대를 감안해
    # 1/CONTENT_SCALE로 미리 줄여 얹는다 → 최종 연필이 원본과 같은 크기·위치가 된다.
    pw, ph = s(700), s(132)
    p = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    pd = ImageDraw.Draw(p)
    by0, by1 = s(40), s(92)
    bx0, bx1 = s(170), s(584)
    pd.rounded_rectangle([bx0, by0, bx1, by1], radius=s(7), fill=pal["pencil_body"])
    pd.rectangle([s(124), by0, bx0, by1], fill=PEN_FERRULE)
    pd.rounded_rectangle([s(72), by0, s(134), by1], radius=s(13), fill=PEN_ERASER)
    tipx = s(676)
    pd.polygon([(bx1, by0), (tipx, (by0 + by1) // 2), (bx1, by1)], fill=PEN_WOOD)
    gx = s(642)
    pd.polygon([(gx, s(54)), (tipx, (by0 + by1) // 2), (gx, s(78))], fill=PEN_GRAPHITE)
    p = p.transpose(Image.FLIP_LEFT_RIGHT)
    p = p.rotate(30, expand=True, resample=Image.BICUBIC)
    k = 1 / CONTENT_SCALE
    p = p.resize((round(p.width * k), round(p.height * k)), Image.LANCZOS)
    # 원본 중심 (566, 700) → 확대 전 좌표로 환산: (c-512)/CONTENT_SCALE + 512
    pl = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    pl.alpha_composite(p, (round(s(558) - p.width / 2), round(s(671) - p.height / 2)))
    lay.alpha_composite(_shadow(pl.split()[3], s(9), s(5), 60))
    lay.alpha_composite(pl)

    # 중심 기준 확대 → 예전 노트 크기 복원 (CONTENT_SCALE 참고).
    # 4× 슈퍼샘플 상태에서 스케일하므로 최종 축소 후 선명도 손실은 없다.
    big = round(N * CONTENT_SCALE)
    lay = lay.resize((big, big), Image.LANCZOS)
    off = (big - N) // 2
    return lay.crop((off, off, off + N, off + N))


def _compose(pal, rounded, safe):
    bg = background(pal)
    if rounded:
        m = Image.new("L", (N, N), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, N - 1, N - 1], radius=s(CORNER_R), fill=255)
        bg.putalpha(m)
    c = content(pal)
    if safe < 1.0:
        inner = round(N * safe)
        bg.alpha_composite(c.resize((inner, inner), Image.LANCZOS), ((N - inner) // 2, (N - inner) // 2))
    else:
        bg.alpha_composite(c)
    return bg


def icon_any(pal):
    """웹/PWA 기본 아이콘 — 둥근 모서리 + 투명 바깥."""
    return _compose(pal, rounded=True, safe=1.0)


def icon_maskable(pal):
    """안드로이드 적응형 — 풀블리드 배경 + 콘텐츠를 안전영역으로."""
    return _compose(pal, rounded=False, safe=SAFE)


def icon_ios_appicon(pal):
    """iOS 앱아이콘 — 불투명 정사각(둥근모서리 금지, Apple이 마스킹).

    알파를 남기면 1024 마케팅 아이콘이 심사에서 리젝된다 → RGB로 변환.
    """
    return _compose(pal, rounded=False, safe=1.0).convert("RGB")


def icon_ios_launch(pal):
    """iOS 런치 아이콘 — 둥근 모서리 + 투명 (RGBA)."""
    return _compose(pal, rounded=True, safe=1.0)


def save(master, path, size=None):
    """master를 size(없으면 path의 현재 치수)로 리샘플해 저장."""
    if size is None:
        with Image.open(path) as cur:
            size = cur.size
    elif isinstance(size, int):
        size = (size, size)
    master.resize(size, Image.LANCZOS).save(path)
    return size
