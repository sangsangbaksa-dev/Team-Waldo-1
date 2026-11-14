"""차량·건물·도시 소품. 단위는 미터, +X 정면. 게임에서 차량/건물은 x10(= 월드 유닛)으로 쓰입니다."""
import math
from mathutils import Matrix
from lib import B, export, reset, bpy
from street import STREET, street_palette

TAU = math.pi * 2


def wheel(b: B, x: float, y: float, r: float = 0.34, w: float = 0.26, hub: str = 'Steel') -> None:
    b.cyl((x, y, r), r, w, 'Rubber', axis='y', seg=10)
    b.cyl((x, y + (0.02 if y > 0 else -0.02), r), r * 0.52, w + 0.04, hub, axis='y', seg=8)


def sedan(kind: str = 'sedan') -> tuple[B, dict]:
    b = B()
    L, W = {'sedan': (4.6, 1.85), 'sports': (4.8, 2.0), 'police': (4.7, 1.9)}[kind]
    low = 0.5 if kind == 'sports' else 0.62
    b.box((0, 0, 0.3 + low / 2), (L, W, low), 'Paint', taper=(0.97, 0.94))
    cab_z = 0.3 + low + 0.22
    if kind == 'sports':
        b.box((-0.35, 0, cab_z), (2.0, W * 0.84, 0.44), 'Glass', taper=(0.62, 0.78), off=(-0.1, 0))
        b.box((-0.4, 0, cab_z + 0.22), (1.15, W * 0.66, 0.05), 'Paint')
        b.box((-2.2, 0, 1.05), (0.4, W * 0.9, 0.06), 'Black')                      # 스포일러
        b.box((-2.15, 0.7, 0.88), (0.06, 0.06, 0.3), 'Black').box((-2.15, -0.7, 0.88), (0.06, 0.06, 0.3), 'Black')
        b.box((0.3, 0, 0.3 + low + 0.01), (L * 0.9, 0.34, 0.03), 'White')       # 줄무늬
    else:
        b.box((-0.25, 0, cab_z), (2.5, W * 0.86, 0.56), 'Glass', taper=(0.7, 0.86), off=(0.1, 0))
        b.box((-0.28, 0, cab_z + 0.285), (1.7, W * 0.74, 0.05), 'Paint')
    b.box((L / 2 - 0.05, 0, 0.5), (0.14, W * 0.98, 0.3), 'Black')
    b.box((-L / 2 + 0.05, 0, 0.5), (0.14, W * 0.98, 0.3), 'Black')
    b.box((L / 2 - 0.02, 0, 0.78), (0.06, 0.8, 0.14), 'Black')
    for s in (-1, 1):
        b.box((L / 2 - 0.02, s * 0.65, 0.82), (0.07, 0.34, 0.15), 'Glow')
        b.box((-L / 2 + 0.02, s * 0.66, 0.82), (0.07, 0.34, 0.14), 'GlowRed')
        b.box((0.55, s * (W / 2 + 0.08), cab_z + 0.05), (0.12, 0.14, 0.1), 'Black')   # 사이드미러
    for x in (L * 0.31, -L * 0.31):
        for y in (W / 2 - 0.08, -(W / 2 - 0.08)):
            wheel(b, x, y, 0.36 if kind == 'sports' else 0.34)
    if kind == 'police':
        b.box((0.0, 0.0, 0.3 + low * 0.5), (L * 0.98, W * 1.001, low * 0.45), 'Navy', taper=(1.0, 1.0))
        b.box((0.1, 0, 1.75), (0.7, 1.0, 0.1), 'Black')
        b.box((L / 2 - 0.02, 0, 0.62), (0.06, 1.2, 0.1), 'White')
    return b, {}


def truck() -> B:
    b = B()
    b.box((0, 0, 0.62), (6.0, 2.3, 0.45), 'Black')
    b.box((2.05, 0, 1.55), (1.9, 2.4, 1.55), 'Paint', taper=(0.95, 0.96))
    b.box((2.5, 0, 1.9), (0.96, 2.2, 0.62), 'Glass', taper=(0.9, 0.95))
    b.box((-1.0, 0, 2.0), (4.0, 2.55, 2.2), 'White', taper=(1.0, 0.99))
    b.box((-1.0, 0, 3.15), (4.0, 2.4, 0.08), 'Concrete')
    b.box((-3.02, 0, 1.45), (0.06, 1.5, 1.2), 'Concrete')
    b.box((3.05, 0, 0.55), (0.18, 2.4, 0.45), 'Black')
    for s in (-1, 1):
        b.box((3.0, s * 0.85, 1.0), (0.08, 0.4, 0.18), 'Glow')
        b.box((-3.0, s * 0.9, 0.7), (0.08, 0.4, 0.18), 'GlowRed')
        b.cyl((1.3, s * 1.1, 2.55), 0.08, 1.4, 'Steel')
    for x in (2.1, -0.6, -2.1):
        for y in (1.1, -1.1):
            wheel(b, x, y, 0.5, 0.36)
    return b


def tracks(b: B, L: float, W: float, h: float) -> None:
    for s in (-1, 1):
        y = s * (W / 2 - 0.4)
        b.box((0, y, h / 2 + 0.05), (L, 0.8, h), 'Black', taper=(0.96, 1.0))
        for i in range(5):
            b.cyl((-L / 2 + 0.7 + i * (L - 1.4) / 4, s * (W / 2 + 0.01), 0.45), 0.34, 0.12, 'Steel', axis='y', seg=8)


def tank() -> tuple[B, B]:
    b = B()
    tracks(b, 6.4, 3.9, 0.95)
    b.box((0, 0, 1.05), (5.8, 2.9, 0.85), 'Olive', taper=(0.88, 0.9))
    b.box((2.35, 0, 1.0), (1.6, 2.6, 0.7), 'Olive', taper=(0.35, 0.9), off=(0.5, 0))
    for s in (-1, 1):
        b.box((0, s * 1.46, 1.1), (4.6, 0.04, 0.2), 'Team')
        b.box((-2.88, s * 0.9, 1.1), (0.1, 0.5, 0.3), 'Black')
    b.box((-2.9, 0, 0.8), (0.3, 1.8, 0.4), 'Gunmetal')
    t = B()
    t.cyl((0, 0, 0.3), 1.3, 0.62, 'Olive', seg=10, scale=(1.0, 0.92))
    t.box((0.35, 0, 0.3), (1.8, 1.9, 0.6), 'Olive', taper=(0.7, 0.8), off=(0.3, 0))
    t.cyl((0, 0, 0.62), 1.32, 0.12, 'Team', seg=10, scale=(1.0, 0.92))
    t.cyl((2.5, 0, 0.35), 0.14, 3.0, 'Gunmetal', axis='x')
    t.cyl((3.95, 0, 0.35), 0.22, 0.3, 'Black', axis='x')
    t.cyl((1.0, 0, 0.35), 0.3, 0.7, 'Steel', axis='x')
    t.cyl((-0.5, 0.5, 0.78), 0.34, 0.2, 'Steel', seg=8)
    t.box((-0.5, -0.6, 0.78), (0.5, 0.06, 0.1), 'Black')
    t.cyl((-0.2, -0.5, 0.95), 0.03, 0.9, 'Black', axis='x')
    t.box((-1.2, 0, 0.3), (0.5, 1.4, 0.4), 'Olive')
    return b, t


def buggy() -> tuple[B, B]:
    b = B()
    b.box((0, 0, 0.85), (4.0, 2.0, 0.7), 'Steel', taper=(0.9, 0.92))
    b.box((1.45, 0, 0.9), (1.4, 1.9, 0.5), 'Steel', taper=(0.4, 0.9), off=(0.3, 0))
    b.box((-0.2, 0, 1.45), (1.9, 1.7, 0.5), 'Glass', taper=(0.78, 0.88))
    b.box((-0.2, 0, 1.72), (1.5, 1.5, 0.08), 'Steel')
    for s in (-1, 1):
        b.box((0.0, s * 1.01, 0.88), (3.2, 0.05, 0.3), 'Team')
        b.box((1.5, s * 0.5, 1.28), (0.9, 0.3, 0.06), 'Team')
        b.box((2.0, s * 0.7, 0.88), (0.08, 0.4, 0.18), 'Glow')
        b.box((-1.98, s * 0.75, 0.88), (0.08, 0.4, 0.18), 'GlowRed')
        for x in (1.3, -1.3):
            wheel(b, x, s * 1.05, 0.52, 0.42, 'Gunmetal')
        b.limb((-1.0, s * 0.8, 1.7), (-1.0, s * 0.8, 2.2), 0.06, 'Black')
    b.box((2.05, 0, 0.55), (0.2, 2.1, 0.3), 'Black')
    b.limb((-1.0, -0.8, 2.2), (-1.0, 0.8, 2.2), 0.06, 'Black')
    t = B()
    t.cyl((0, 0, 0.12), 0.45, 0.24, 'Black', seg=8)
    t.box((0.0, 0, 0.42), (0.55, 0.6, 0.36), 'Steel', taper=(0.8, 0.9))
    t.cyl((0.7, 0, 0.48), 0.05, 1.1, 'Gunmetal', axis='x')
    t.box((0.1, 0, 0.7), (0.3, 0.55, 0.05), 'Team')
    return b, t


def build_vehicles(path: str) -> int:
    reset()
    objs = []
    import cars
    for k, paint in (('sedan', 'Paint'), ('hatch', 'Paint'), ('suv', 'Paint'), ('sports', 'Paint'), ('van', 'Paint'), ('taxi', 'Yellow'), ('police', 'Navy')):
        objs.append(cars.car(k, paint).build(k, bevel=0.02))
    # 경광등은 별도 노드: 경찰차 지붕
    la = B().box((0, 0.26, 0), (0.34, 0.45, 0.14), 'GlowRed').build('police_LightA', loc=(0.1, 0.0, 1.6))
    lb = B().box((0, -0.26, 0), (0.34, 0.45, 0.14), 'GlowBlue').build('police_LightB', loc=(0.1, 0.0, 1.6))
    for o in (la, lb):
        o.parent = bpy.data.objects['police']
    objs += [la, lb, truck().build('truck')]
    hull, tur = tank()
    ho = hull.build('tank')
    to = tur.build('tank_Turret', loc=(-0.2, 0, 1.45))
    to.parent = ho
    bh, bt = buggy()
    bo = bh.build('buggy')
    bto = bt.build('buggy_Turret', loc=(-0.45, 0, 1.78))
    bto.parent = bo
    objs += [ho, to, bo, bto]
    return export(path, objs)


# ---------------- 건물 (유닛 = m, 게임에서 x10) ----------------
def flag(b: B, x: float, y: float, z: float, h: float = 3.0) -> None:
    b.cyl((x, y, z + h / 2), 0.05, h, 'Steel', seg=5)
    b.box((x + 0.45, y, z + h - 0.35), (0.9, 0.04, 0.6), 'Team')


def sandbags(b: B, x: float, y: float, n: int, along_y: bool = True) -> None:
    for i in range(n):
        for r in range(2 if i % 2 == 0 else 1):
            px, py = (x, y + (i - n / 2) * 0.62) if along_y else (x + (i - n / 2) * 0.62, y)
            b.box((px, py, 0.18 + r * 0.32), (0.5, 0.62, 0.3) if along_y else (0.62, 0.5, 0.3), 'Sand', taper=(0.85, 0.85))


def hq() -> B:
    b = B()
    b.box((0, 0, 0.45), (11.8, 11.8, 0.9), 'DarkConc', taper=(0.97, 0.97))
    b.box((0, 0, 3.0), (9.0, 9.0, 4.2), 'Concrete', taper=(0.93, 0.93))
    b.box((0, 0, 6.5), (6.2, 6.2, 3.0), 'Steel', taper=(0.9, 0.9))
    b.box((0, 0, 8.2), (7.0, 7.0, 0.5), 'Team')
    b.box((0, 0, 8.75), (5.0, 5.0, 0.7), 'Gunmetal', taper=(0.85, 0.85))
    b.cyl((0, 0, 9.1), 1.3, 0.5, 'Team', seg=8)
    b.cyl((0, 0, 11.6), 0.12, 5.0, 'Steel', seg=5)
    b.sphere((0, 0, 14.2), 0.28, 'GlowRed', seg=6, rings=4)
    b.cyl((1.6, 1.6, 9.6), 0.8, 0.12, 'White', seg=10).cone((1.6, 1.6, 9.9), 0.06, 0.4, 'Steel', seg=4)
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        b.cyl((sx * 4.6, sy * 4.6, 2.2), 0.7, 3.2, 'DarkConc', seg=8)
        b.cyl((sx * 4.6, sy * 4.6, 4.0), 0.82, 0.4, 'Team', seg=8)
        flag(b, sx * 4.6, sy * 4.6, 4.2, 2.8)
    for s in (-1, 1):
        for k in range(4):
            b.box((s * 4.36, (k - 1.5) * 1.8, 3.4), (0.08, 0.9, 1.0), 'Glass' if k % 2 else 'GlowOrange')
            b.box(((k - 1.5) * 1.8, s * 4.36, 3.4), (0.9, 0.08, 1.0), 'GlowOrange' if k % 2 else 'Glass')
            b.box((s * 2.96, (k - 1.5) * 1.5, 6.6), (0.08, 1.0, 0.9), 'GlowCyan' if k % 2 else 'Glass')
            b.box(((k - 1.5) * 1.5, s * 3.12, 6.6), (1.0, 0.06, 0.9), 'Glass')
    b.box((4.52, 0, 1.6), (0.12, 2.0, 1.9), 'Black')
    b.box((4.6, 0, 2.7), (0.2, 3.0, 0.2), 'Team')
    # 디테일: 현관 차양·계단·현수막·옥상 난간과 탐조등·실외기
    b.box((5.2, 0, 2.98), (1.6, 3.6, 0.16), 'Gunmetal')
    b.box((5.2, 0, 3.1), (1.4, 3.4, 0.1), 'Team')
    for y in (-1.6, 1.6):
        b.cyl((5.5, y, 1.9), 0.1, 2.05, 'Steel', seg=6)
        b.box((4.42, y * 1.75, 3.0), (0.08, 0.8, 2.6), 'Team')
    b.box((6.05, 0, 0.6), (0.5, 3.2, 0.3), 'Concrete')
    b.box((6.45, 0, 0.3), (0.5, 3.2, 0.3), 'Concrete')
    b.box((4.45, 0, 2.62), (0.1, 2.3, 0.14), 'Glow')
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        b.box((sx * 3.35, sy * 3.35, 8.75), (0.14, 0.14, 0.6), 'Steel')
        b.box((sx * 2.9, sy * 2.9, 9.25), (0.4, 0.4, 0.3), 'Black', rot=math.atan2(sy, sx))
        b.sphere((sx * 3.05, sy * 3.05, 9.25), 0.17, 'Glow', seg=6, rings=3)
        b.cyl((sx * 2.9, sy * 2.9, 9.0), 0.06, 0.4, 'Steel', seg=5)
    for s in (-1, 1):
        b.box((s * 3.35, 0, 9.0), (0.06, 6.7, 0.06), 'Steel')
        b.box((0, s * 3.35, 9.0), (6.7, 0.06, 0.06), 'Steel')
        b.box((-1.6, s * 1.7, 9.35), (1.0, 0.8, 0.5), 'Concrete')
        b.cyl((-1.6, s * 1.7, 9.62), 0.3, 0.05, 'Black', seg=8)
        b.box((s * 4.45, 0, 1.3), (0.5, 5.4, 0.8), 'DarkConc', taper=(0.7, 1.0))
    for y in (-3.4, 3.4):
        sandbags(b, 5.6, y, 5)
    return b


def barracks() -> B:
    b = B()
    b.box((0, 0, 0.1), (8.6, 7.0, 0.2), 'DarkConc')
    b.box((0, 0, 2.2), (8.2, 6.4, 4.0), 'Khaki')
    b.box((0, 0, 5.1), (8.8, 7.2, 1.8), 'Roof', taper=(1.0, 0.04))
    b.box((0, 1.3, 5.03), (8.9, 0.5, 0.06), 'Team', rot=0.0)
    b.box((0, -1.3, 5.03), (8.9, 0.5, 0.06), 'Team')
    for s in (-1, 1):
        b.box((s * 2.4, 3.22, 2.5), (1.3, 0.06, 1.0), 'GlowOrange')
        b.box((s * 2.4, -3.22, 2.5), (1.3, 0.06, 1.0), 'GlowOrange')
    b.box((4.12, 0, 1.5), (0.1, 1.8, 2.6), 'Black')
    b.box((4.15, 0, 3.05), (0.14, 2.4, 0.3), 'Team')
    flag(b, -3.6, 3.0, 4.0, 3.2)
    sandbags(b, 5.2, 2.6, 4)
    sandbags(b, 5.2, -2.6, 4)
    for i in range(3):
        b.cyl((-4.25, -2.4 + i * 2.4, 0.7), 0.3, 1.0, 'Olive', seg=8)
        b.cyl((-4.25, -2.4 + i * 2.4, 0.9), 0.31, 0.08, 'Yellow', seg=8)
    # 디테일: 현관 차양·정면 창·현수막·지붕 환기구와 굴뚝·안테나
    b.box((4.5, 0, 3.3), (0.9, 2.8, 0.12), 'Gunmetal')
    b.box((4.52, 0, 3.4), (0.8, 2.6, 0.08), 'Team')
    for y in (-1.25, 1.25):
        b.cyl((4.85, y, 1.75), 0.07, 3.0, 'Steel', seg=6)
    for s in (-1, 1):
        b.box((4.12, s * 2.35, 2.5), (0.06, 1.1, 1.0), 'GlowOrange')
        b.box((4.15, s * 2.35, 1.92), (0.12, 1.3, 0.1), 'Concrete')
        b.box((4.13, s * 1.35, 2.3), (0.05, 0.4, 1.5), 'Team')
        b.box((0, s * 3.22, 0.7), (8.25, 0.08, 0.9), 'OliveD')
    b.box((-4.12, 0, 2.6), (0.06, 3.0, 1.0), 'Glass')
    for x in (-2.4, 0.4):
        b.box((x, 1.8, 5.35), (0.8, 0.8, 0.6), 'Steel')
        b.box((x, 1.8, 5.7), (0.95, 0.95, 0.1), 'Gunmetal')
    b.cyl((2.8, -1.6, 5.7), 0.22, 1.6, 'Brick', seg=6)
    b.cyl((2.8, -1.6, 6.55), 0.28, 0.14, 'Black', seg=6)
    b.box((0, 0, 6.02), (8.9, 0.22, 0.12), 'Gunmetal')
    b.cyl((-3.4, 0, 7.0), 0.04, 2.2, 'Steel', seg=5)
    b.sphere((-3.4, 0, 8.1), 0.1, 'GlowRed', seg=6, rings=3)
    b.box((4.16, 0, 2.95), (0.06, 1.2, 0.1), 'Glow')
    return b


def depot() -> B:
    b = B()
    b.box((0, 0, 0.1), (5.8, 5.8, 0.2), 'DarkConc')
    b.box((0, 0, 1.7), (5.2, 5.2, 3.2), 'Steel')
    b.box((0, 0, 3.4), (5.6, 5.6, 0.3), 'Team')
    for i in range(5):
        b.box((0, -2.1 + i * 1.05, 1.7), (5.3, 0.05, 3.1), 'Gunmetal')
    b.box((2.62, 0, 1.2), (0.1, 2.6, 2.2), 'Black')
    b.box((2.68, 0, 0.2), (0.1, 2.6, 0.3), 'Yellow')
    for k, (x, y, z) in enumerate(((3.1, 1.9, 0.4), (3.1, 2.4, 0.4), (3.2, 2.15, 1.0), (3.2, -2.1, 0.4))):
        b.box((x, y, z), (0.9, 0.8, 0.8), 'Crate', rot=k * 0.2)
    b.cyl((-1.8, -3.0, 0.6), 0.45, 1.1, 'Orange', seg=8)
    b.cyl((-1.0, -3.1, 0.6), 0.45, 1.1, 'Orange', seg=8)
    # 디테일: 셔터 골·경고등·옥상 물탱크와 환기팬·사다리·팔레트
    for k in range(6):
        b.box((2.69, 0, 0.5 + k * 0.33), (0.04, 2.5, 0.05), 'Gunmetal')
    b.box((2.7, 0, 2.48), (0.2, 3.0, 0.24), 'Yellow')
    for y in (-1.0, 0, 1.0):
        b.box((2.81, y, 2.48), (0.04, 0.3, 0.25), 'Black')
    for s in (-1, 1):
        b.box((2.68, s * 1.95, 2.75), (0.16, 0.3, 0.2), 'Black')
        b.box((2.72, s * 1.95, 2.62), (0.1, 0.22, 0.06), 'Glow')
        b.box((-0.6 + s * 0.22, 2.64, 1.9), (0.05, 0.05, 3.3), 'Steel')
    for k in range(8):
        b.box((-0.6, 2.64, 0.5 + k * 0.38), (0.44, 0.04, 0.04), 'Steel')
    b.cyl((-1.4, -1.3, 4.05), 0.7, 1.0, 'Steel', seg=10)
    b.cyl((-1.4, -1.3, 4.6), 0.74, 0.12, 'Team', seg=10)
    b.cyl((1.5, 1.5, 3.75), 0.5, 0.4, 'Gunmetal', seg=8)
    b.cyl((1.5, 1.5, 3.98), 0.4, 0.06, 'Black', seg=8)
    b.cyl((1.9, -1.9, 4.55), 0.04, 2.0, 'Steel', seg=5)
    b.sphere((1.9, -1.9, 5.55), 0.09, 'GlowRed', seg=6, rings=3)
    b.box((3.15, -0.9, 0.27), (0.9, 0.9, 0.14), 'Wood')
    b.box((3.15, -0.9, 0.6), (0.7, 0.7, 0.5), 'Olive')
    b.box((2.63, 0, 3.0), (0.06, 1.6, 0.34), 'Team')
    b.box((0, 0, 3.85), (1.4, 1.4, 0.5), 'Concrete')
    return b


def factory() -> B:
    b = B()
    b.box((0, 0, 0.1), (9.8, 8.2, 0.2), 'DarkConc')
    b.box((0, 0, 2.5), (9.4, 7.8, 4.6), 'Concrete')
    for i in range(3):
        b.box((-2.9 + i * 2.9, 0, 5.4), (2.8, 7.9, 1.6), 'Roof', taper=(0.04, 1.0), off=(1.3, 0))
        b.box((-2.9 + i * 2.9, 0, 4.9), (2.8, 7.95, 0.12), 'Team')
        b.box((-2.2 + i * 2.9, 0, 5.1), (0.06, 6.8, 0.9), 'GlowOrange')
    for x in (-3.0, 3.2):
        b.cyl((x, 2.8, 7.0), 0.55, 6.0, 'Brick', seg=8, r2=0.4)
        b.cyl((x, 2.8, 10.0), 0.52, 0.5, 'Black', seg=8)
        b.cyl((x, 2.8, 10.3), 0.3, 0.5, 'GlowOrange', seg=6)
    b.box((4.72, 0, 2.0), (0.14, 4.0, 3.6), 'Black')
    for k in range(7):
        b.box((4.8, -1.8 + k * 0.6, 3.6), (0.05, 0.3, 0.2), 'Yellow')
    b.cyl((0, 4.2, 3.0), 0.25, 8.0, 'Steel', axis='x', seg=6)
    b.cyl((0, -4.2, 2.2), 0.25, 8.0, 'Steel', axis='x', seg=6)
    b.cyl((4.9, 3.3, 3.0), 0.8, 0.2, 'Team', axis='x', seg=10)
    for k in range(5):
        b.box((-3.6 + k * 1.8, 4.01, 3.0), (1.0, 0.06, 0.7), 'GlowOrange')
    # 디테일: 문틀·정면 창·작업등·굴뚝 띠·뒷면 환기팬·배관
    b.box((4.76, 0, 3.95), (0.22, 4.5, 0.26), 'Steel')
    b.box((4.74, 0, 0.26), (0.12, 4.0, 0.12), 'Yellow')
    for s in (-1, 1):
        b.box((4.76, s * 2.12, 2.0), (0.22, 0.26, 3.7), 'Steel')
        b.box((4.72, s * 3.2, 3.2), (0.06, 1.0, 0.8), 'GlowOrange')
        b.box((4.74, s * 3.2, 2.72), (0.1, 1.2, 0.1), 'DarkConc')
        b.box((4.92, s * 2.3, 4.2), (0.22, 0.3, 0.14), 'Black')
        b.box((4.94, s * 2.3, 4.1), (0.16, 0.24, 0.06), 'Glow')
    for x in (-3.0, 3.2):
        b.cyl((x, 2.8, 8.2), 0.5, 0.35, 'White', seg=8, r2=0.48)
        b.cyl((x, 2.8, 6.0), 0.58, 0.2, 'Steel', seg=8)
    for y in (-2.4, 0, 2.4):
        b.cyl((-4.74, y, 3.3), 0.75, 0.12, 'Gunmetal', axis='x', seg=10)
        b.cyl((-4.8, y, 3.3), 0.55, 0.06, 'Black', axis='x', seg=8)
        b.box((-4.84, y, 3.3), (0.04, 1.05, 0.1), 'Steel')
        b.box((-4.84, y, 3.3), (0.04, 0.1, 1.05), 'Steel')
    for x in (-3.6, 0, 3.6):
        b.cyl((x, -4.2, 1.2), 0.14, 2.0, 'Steel', seg=6)
        b.cyl((x, 4.2, 1.6), 0.14, 2.8, 'Steel', seg=6)
    b.box((0, -3.93, 3.9), (9.45, 0.08, 0.5), 'Team')
    return b


def lab() -> B:
    b = B()
    b.box((0, 0, 0.1), (7.4, 7.4, 0.2), 'DarkConc')
    b.box((0, 0, 1.5), (6.6, 6.6, 2.6), 'White', taper=(0.96, 0.96))
    b.box((0, 0, 3.0), (7.0, 7.0, 0.3), 'Team')
    b.cyl((0, 0, 4.4), 2.3, 2.6, 'Glass', seg=12, r2=2.0)
    b.sphere((0, 0, 5.6), 2.0, 'GlowCyan', seg=12, rings=6, scale=(1.0, 1.0, 0.7))
    b.sphere((0, 0, 4.5), 1.0, 'GlowGreen', seg=8, rings=4)
    b.cyl((0, 0, 7.4), 0.1, 3.0, 'Steel', seg=5)
    b.sphere((0, 0, 9.0), 0.2, 'GlowRed', seg=6, rings=4)
    for s in (-1, 1):
        b.cyl((s * 2.4, 3.9, 1.6), 0.7, 2.6, 'Steel', seg=8)
        b.cyl((s * 2.4, 3.9, 3.0), 0.72, 0.3, 'Team', seg=8)
        b.box((s * 2.5, -3.9, 1.3), (2.0, 0.1, 1.5), 'GlowCyan', rot=0.0)
        b.box((3.32, s * 1.6, 1.5), (0.06, 1.4, 1.2), 'Glass')
    b.box((3.32, 0, 1.0), (0.12, 1.6, 2.0), 'Black')
    # 디테일: 현관 차양·돔 테·옥상 태양광과 접시 안테나·탱크 배관·뒷면 창
    b.box((3.75, 0, 2.3), (0.9, 2.2, 0.12), 'Team')
    for y in (-0.95, 0.95):
        b.cyl((4.1, y, 1.25), 0.06, 2.1, 'Steel', seg=6)
    b.box((3.3, 0, 2.6), (0.06, 1.2, 0.3), 'GlowCyan')
    b.cyl((0, 0, 3.3), 2.45, 0.3, 'Steel', seg=12)
    b.cyl((0, 0, 5.68), 2.03, 0.12, 'Steel', seg=12)
    for k in range(6):
        a = k * TAU / 6 + 0.26
        b.limb((math.cos(a) * 2.32, math.sin(a) * 2.32, 3.2), (math.cos(a) * 2.03, math.sin(a) * 2.03, 5.65), 0.12, 'Steel', round_end=False)
    for s in (-1, 1):
        b.box((s * 2.75, -2.6, 3.32), (1.2, 1.5, 0.08), 'Navy', rot=Matrix.Rotation(s * 0.2, 3, 'Y'))
        b.box((s * 2.75, -2.6, 3.22), (1.3, 1.6, 0.06), 'Steel')
    b.cyl((-2.7, 2.7, 3.5), 0.08, 0.7, 'Steel', seg=6)
    b.cyl((-2.7, 2.7, 4.0), 0.75, 0.2, 'White', seg=10, r2=0.2, rotm=Matrix.Rotation(-0.7, 3, 'Y') @ Matrix.Rotation(math.pi, 3, 'X'))
    b.limb((-2.4, 3.9, 2.45), (2.4, 3.9, 2.45), 0.18, 'Yellow', round_end=False)
    for y in (-1.8, 0, 1.8):
        b.box((-3.3, y, 1.6), (0.08, 1.1, 1.0), 'Glass')
    return b


def turret_base() -> tuple[B, B]:
    b = B()
    b.box((0, 0, 0.5), (4.2, 4.2, 1.0), 'DarkConc', taper=(0.92, 0.92))
    b.cyl((0, 0, 1.4), 1.0, 0.9, 'Steel', seg=8)
    b.cyl((0, 0, 1.0), 1.5, 0.15, 'Team', seg=10)
    # 디테일: 모서리 모래주머니·경고 띠·탄약 상자
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        b.box((sx * 1.5, sy * 1.5, 1.16), (0.75, 0.75, 0.32), 'Sand', taper=(0.85, 0.85))
        b.box((sx * 1.5, sy * 1.5, 1.46), (0.6, 0.6, 0.28), 'Sand', taper=(0.85, 0.85), rot=0.4)
    for s in (-1, 1):
        b.box((0, s * 1.62, 1.14), (1.5, 0.5, 0.28), 'Sand', taper=(0.9, 0.85))
        b.box((s * 2.02, 0, 0.5), (0.06, 3.0, 0.24), 'Yellow')
        for y in (-1.0, 0, 1.0):
            b.box((s * 2.04, y, 0.5), (0.05, 0.3, 0.25), 'Black')
    b.box((-1.55, 0, 1.2), (0.6, 0.9, 0.4), 'Olive')
    b.box((-1.55, 0, 1.42), (0.64, 0.94, 0.06), 'OliveD')
    b.cyl((0, 0, 1.9), 1.12, 0.14, 'Gunmetal', seg=10)
    h = B()
    h.sphere((0, 0, 0.3), 1.2, 'Steel', seg=10, rings=5, scale=(1.0, 1.0, 0.8))
    h.cyl((0, 0, 0.45), 1.22, 0.2, 'Team', seg=10)
    for s in (-1, 1):
        h.cyl((1.5, s * 0.38, 0.35), 0.16, 2.0, 'Gunmetal', axis='x')
        h.cyl((2.55, s * 0.38, 0.35), 0.22, 0.25, 'Black', axis='x')
    h.box((0.9, 0, 0.9), (0.6, 0.5, 0.3), 'Black')
    h.sphere((1.15, 0, 0.9), 0.14, 'GlowRed', seg=6, rings=4)
    for s in (-1, 1):
        h.box((0.1, s * 1.08, 0.35), (1.5, 0.16, 0.85), 'Gunmetal', taper=(0.8, 1.0))
        h.box((0.1, s * 1.18, 0.35), (0.7, 0.05, 0.3), 'Team')
    h.box((0.95, 0, 0.35), (0.5, 1.2, 0.55), 'Gunmetal')
    h.cyl((-0.95, 0, 0.45), 0.42, 1.0, 'Olive', axis='y', seg=8)
    h.cyl((-0.5, 0.55, 1.6), 0.03, 1.5, 'Steel', seg=5)
    return b, h


def build_structures(path: str) -> int:
    reset()
    objs = [hq().build('hq'), barracks().build('barracks'), depot().build('depot'), factory().build('factory'), lab().build('lab')]
    tb, th = turret_base()
    to = tb.build('turret')
    ho = th.build('turret_Head', loc=(0, 0, 2.0))
    ho.parent = to
    objs += [to, ho]
    return export(path, objs)


# ---------------- 소품 ----------------
def tree_round() -> B:
    b = B()
    b.cyl((0, 0, 1.4), 0.28, 2.8, 'Bark', seg=6, r2=0.2)
    b.sphere((0, 0, 3.6), 1.9, 'Leaf', seg=7, rings=4, scale=(1.0, 1.0, 0.85))
    b.sphere((0.8, 0.4, 4.7), 1.3, 'Leaf2', seg=6, rings=4)
    b.sphere((-0.7, -0.5, 4.5), 1.2, 'Leaf', seg=6, rings=4)
    return b


def tree_pine() -> B:
    b = B()
    b.cyl((0, 0, 1.0), 0.25, 2.0, 'Bark', seg=6)
    for k, (r, z, h) in enumerate(((2.0, 2.2, 2.4), (1.6, 3.5, 2.2), (1.15, 4.8, 2.0), (0.7, 6.0, 1.6))):
        b.cone((0, 0, z + h / 2 - 0.2), r, h, 'Leaf2' if k % 2 else 'Leaf', seg=7)
    return b


def lamp() -> B:
    b = B()
    b.cyl((0, 0, 4.5), 0.09, 9.0, 'Steel', seg=6, r2=0.07)
    b.cyl((0, 0, 0.3), 0.2, 0.6, 'Gunmetal', seg=6)
    b.limb((0, 0, 8.9), (0.9, 0, 9.2), 0.09, 'Steel')
    b.box((1.0, 0, 9.2), (0.55, 0.28, 0.14), 'Gunmetal')
    b.box((1.0, 0, 9.1), (0.42, 0.2, 0.05), 'Glow')
    return b


def crystal() -> B:
    b = B()
    b.box((0, 0, 0.12), (1.2, 1.2, 0.24), 'DarkConc', taper=(0.7, 0.7))
    spikes = ((0, 0, 1.7, 0.34), (0.42, 0.2, 1.15, 0.24), (-0.38, 0.3, 1.0, 0.22), (0.1, -0.42, 0.85, 0.2), (-0.3, -0.25, 0.6, 0.16))
    for k, (x, y, h, r) in enumerate(spikes):
        m = 'CrystalA' if k % 2 == 0 else 'CrystalB'
        b.cyl((x, y, 0.24 + h * 0.35), r, h * 0.7, m, seg=5, r2=r * 0.9)
        b.cone((x, y, 0.24 + h * 0.7 + h * 0.15), r * 0.9, h * 0.3, m, seg=5)
    return b


def crate() -> tuple[B, B]:
    b = B()
    b.box((0, 0, 1.3), (2.6, 2.6, 2.6), 'Crate')
    for s in (-1, 1):
        b.box((s * 0.8, 0, 1.3), (0.2, 2.7, 2.7), 'Steel')
        b.box((0, s * 0.8, 1.3), (2.7, 0.2, 2.7), 'Steel')
    b.box((0, 0, 2.62), (2.7, 2.7, 0.16), 'Yellow')
    b.box((1.31, 0, 1.3), (0.06, 1.0, 1.0), 'Red')
    b.box((0, 1.31, 1.3), (1.0, 0.06, 1.0), 'Red')
    c = B()
    for k in range(8):
        a0, a1 = k * TAU / 8, (k + 1) * TAU / 8
        m = 'Red' if k % 2 == 0 else 'White'
        pts = []
        c._poly = c._poly  # noqa
        from mathutils import Vector
        c._poly([Vector((0, 0, 2.6)), Vector((math.cos(a1) * 2.2, math.sin(a1) * 2.2, 1.7)), Vector((math.cos(a0) * 2.2, math.sin(a0) * 2.2, 1.7))], m)
        c.limb((math.cos(a0) * 2.2, math.sin(a0) * 2.2, 1.7), (math.cos(a0) * 0.9, math.sin(a0) * 0.9, -0.1), 0.03, 'White')
    return b, c


def plane() -> B:
    b = B()
    b.cyl((0, 0, 0), 1.7, 14.0, 'White', axis='x', seg=10)
    b.cone((7.9, 0, 0), 1.7, 2.6, 'Steel', axis='x', seg=10)
    b.cone((-8.6, 0, 0.3), 1.7, 3.4, 'White', axis='x', seg=10)
    b.box((0.5, 0, 0.9), (3.0, 19.0, 0.35), 'Steel', taper=(0.7, 1.0))
    b.box((-8.2, 0, 0.9), (1.6, 6.5, 0.2), 'Steel', taper=(0.7, 1.0))
    b.box((-8.2, 0, 2.2), (2.0, 0.2, 3.0), 'Red', taper=(0.5, 1.0))
    for y in (-6.0, -3.2, 3.2, 6.0):
        b.cyl((1.4, y, 0.2), 0.55, 1.8, 'Gunmetal', axis='x', seg=8)
        b.cyl((2.3, y, 0.2), 0.5, 0.15, 'Steel', axis='x', seg=8)
    b.box((-6.8, 0, -0.5), (2.6, 2.4, 0.08), 'Black')
    b.box((6.2, 0, 0.8), (1.2, 2.2, 0.5), 'Glass', taper=(0.6, 0.8))
    b.box((0, 0, 1.7), (13.0, 0.5, 0.06), 'Red')
    return b


def hydrant() -> B:
    b = B()
    b.cyl((0, 0, 0.4), 0.18, 0.8, 'Red', seg=8)
    b.sphere((0, 0, 0.85), 0.2, 'Red', seg=8, rings=3, scale=(1.0, 1.0, 0.7))
    b.cyl((0, 0.22, 0.5), 0.07, 0.2, 'Steel', axis='y', seg=6).cyl((0, -0.22, 0.5), 0.07, 0.2, 'Steel', axis='y', seg=6)
    return b


def bench() -> B:
    b = B()
    b.box((0, 0, 0.5), (0.5, 1.8, 0.07), 'Wood')
    b.box((-0.22, 0, 0.85), (0.07, 1.8, 0.5), 'Wood', rot=0.0)
    for y in (-0.8, 0.8):
        b.box((0, y, 0.25), (0.45, 0.06, 0.5), 'Black')
    return b


def bin_() -> B:
    b = B()
    b.cyl((0, 0, 0.45), 0.3, 0.9, 'Green', seg=8, r2=0.34)
    b.cyl((0, 0, 0.93), 0.36, 0.1, 'Black', seg=8)
    return b


def cone() -> B:
    b = B()
    b.box((0, 0, 0.03), (0.42, 0.42, 0.06), 'Black')
    b.cone((0, 0, 0.35), 0.17, 0.62, 'Orange', seg=8)
    b.cyl((0, 0, 0.3), 0.115, 0.09, 'White', seg=8, r2=0.1)
    return b


def mailbox() -> B:
    b = B()
    b.box((0, 0, 0.5), (0.5, 0.5, 1.0), 'Navy')
    b.box((0.26, 0, 0.8), (0.04, 0.35, 0.05), 'Black')
    b.box((0, 0, 1.03), (0.52, 0.52, 0.06), 'Steel')
    return b


def dumpster() -> B:
    b = B()
    b.box((0, 0, 0.7), (1.0, 2.0, 1.1), 'Green', taper=(1.0, 1.0))
    b.box((0, 0, 1.3), (1.1, 2.1, 0.08), 'Black')
    for s in (-1, 1):
        b.cyl((-0.1, s * 0.8, 0.12), 0.12, 0.1, 'Rubber', axis='y')
    return b


def barrier() -> B:
    b = B()
    b.box((0, 0, 0.22), (0.7, 2.4, 0.44), 'Concrete')
    b.box((0, 0, 0.7), (0.34, 2.4, 0.55), 'Concrete', taper=(0.5, 1.0))
    b.box((0.18, 0, 0.45), (0.04, 2.0, 0.1), 'Yellow')
    return b


def traffic_light(lit: str) -> B:
    b = B()
    b.cyl((0, 0, 2.6), 0.08, 5.2, 'Steel', seg=6)
    b.limb((0, 0, 5.1), (0, 2.2, 5.1), 0.08, 'Steel')
    b.box((0, 2.2, 4.7), (0.3, 0.32, 0.95), 'Black')
    for i, (z, m) in enumerate(((5.0, 'GlowRed'), (4.7, 'GlowOrange'), (4.4, 'GlowGreen'))):
        on = (lit == 'red' and i == 0) or (lit == 'green' and i == 2)
        b.box((0.16, 2.2, z), (0.04, 0.2, 0.2), m if on else 'Rubber')
    b.box((0, 0, 0.1), (0.4, 0.4, 0.2), 'Gunmetal')
    return b


def build_props(path: str) -> int:
    reset()
    street_palette()
    objs = [tree_round().build('tree_round'), tree_pine().build('tree_pine'), lamp().build('lamp'), crystal().build('crystal')]
    cr, ch = crate()
    co = cr.build('crate')
    cho = ch.build('crate_Chute', loc=(0, 0, 3.0))
    cho.parent = co
    objs += [co, cho, plane().build('plane'), hydrant().build('hydrant'), bench().build('bench'), bin_().build('bin'), cone().build('cone'),
             mailbox().build('mailbox'), dumpster().build('dumpster'), barrier().build('barrier'),
             traffic_light('red').build('tl_red'), traffic_light('green').build('tl_green')]
    objs += [fn().build(name) for name, fn in STREET.items()]
    return export(path, objs)
