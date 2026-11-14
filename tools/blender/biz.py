"""LAST CITY 사업체 표식 모델 7종 → business.glb

사업체 패드 위에 떠서 도는 3D 표식입니다. 노드 이름은 `biz_<BizKind>` 이고
`Team` 재질은 소유 세력 색으로 칠해집니다. 한 변 약 3 m, 바닥 중심이 원점입니다.
"""
import math

from mathutils import Matrix, Vector

from lib import B, export, mat, reset

# 7세그먼트 숫자: a(위) b(오른위) c(오른아래) d(아래) e(왼아래) f(왼위) g(가운데)
SEG = {'2': 'abged', '4': 'fgbc', '7': 'abc'}


def digit(b: B, ch: str, x: float, y: float, z: float, h: float, m: str, face: int = 1) -> None:
    """x 평면에 세로 h 짜리 숫자를 그립니다. face=-1 이면 반대편에서 읽히도록 뒤집습니다."""
    w, t = h * 0.5, h * 0.14
    for s in SEG[ch]:
        if s in 'adg':
            cz = {'a': h / 2, 'g': 0, 'd': -h / 2}[s]
            b.box((x, y, z + cz), (0.05, w + t, t), m)
        else:
            cy = (w / 2 if s in 'bc' else -w / 2) * face
            cz = h / 4 if s in 'bf' else -h / 4
            b.box((x, y + cy, z + cz), (0.05, t, h / 2 + t), m)


def store() -> B:
    b = B()
    b.box((0, 0, 0.1), (1.7, 2.5, 0.2), 'DarkConc')
    b.box((0, 0, 1.0), (1.4, 2.2, 1.6), 'White')
    b.box((0, 0, 1.92), (1.55, 2.35, 0.24), 'Steel')
    for s in (-1, 1):
        b.box((s * 0.71, -0.3, 1.1), (0.04, 1.3, 0.9), 'Glass')
        b.box((s * 0.71, 0.75, 0.85), (0.04, 0.5, 1.3), 'Glass')
        b.box((s * 0.72, 0, 0.32), (0.04, 2.2, 0.16), 'Team')
        for i in range(6):
            b.box((s * 0.98, -1.0 + i * 0.4, 1.74), (0.56, 0.4, 0.07), 'Team' if i % 2 else 'White',
                  rot=Matrix.Rotation(s * 0.3, 3, 'Y'))
    b.box((0, 0, 2.55), (0.22, 1.8, 1.0), 'Black')
    b.box((0, 0, 2.55), (0.26, 1.9, 0.08), 'GlowGreen')
    for s in (-1, 1):
        digit(b, '2', s * 0.13, -0.4 * s, 2.55, 0.6, 'GlowGreen', s)
        digit(b, '4', s * 0.13, 0.4 * s, 2.55, 0.6, 'GlowGreen', s)
    return b


def gas() -> B:
    b = B()
    b.box((0, 0, 0.12), (1.5, 2.2, 0.24), 'Concrete', taper=(0.92, 0.95))
    b.box((0, 0, 1.2), (0.8, 1.2, 1.95), 'Team', taper=(0.94, 0.96))
    b.box((0, 0, 0.42), (0.86, 1.26, 0.36), 'Gunmetal')
    b.box((0, 0, 2.38), (1.0, 1.5, 0.4), 'White')
    b.box((0, 0, 2.64), (0.9, 1.4, 0.12), 'GlowOrange')
    for s in (-1, 1):
        b.box((s * 0.4, 0, 1.75), (0.06, 0.85, 0.5), 'Black')
        b.box((s * 0.43, 0, 1.82), (0.03, 0.62, 0.16), 'Glow')
        b.box((s * 0.43, -0.18, 1.6), (0.03, 0.26, 0.08), 'GlowGreen')
        b.box((s * 0.41, 0, 1.1), (0.04, 0.7, 0.36), 'White')
    b.box((0, 0.66, 1.25), (0.3, 0.14, 0.6), 'Black')
    b.limb((0, 0.62, 1.95), (0, 1.05, 1.5), 0.09, 'Rubber')
    b.limb((0, 1.05, 1.5), (0, 0.98, 0.7), 0.09, 'Rubber')
    b.limb((0, 0.98, 0.7), (0, 0.76, 1.0), 0.09, 'Rubber')
    b.box((0, 0.76, 1.22), (0.14, 0.14, 0.5), 'Steel')
    b.box((0.12, 0.76, 1.45), (0.3, 0.1, 0.1), 'Steel')
    b.cyl((0, 0, 2.95), 0.05, 0.5, 'Steel', seg=6)
    b.cyl((0, 0, 3.45), 0.5, 0.14, 'Yellow', axis='x', seg=10)
    b.cyl((0, 0, 3.45), 0.34, 0.18, 'Red', axis='x', seg=10)
    return b


def club() -> B:
    b = B()
    b.box((0, 0, 0.5), (1.0, 1.7, 1.0), 'Black', taper=(0.94, 0.96))
    for s in (-1, 1):
        for y in (-0.42, 0.42):
            b.cyl((s * 0.5, y, 0.5), 0.32, 0.06, 'Gunmetal', axis='x', seg=10)
            b.cyl((s * 0.52, y, 0.5), 0.14, 0.08, 'Steel', axis='x', seg=8)
        b.box((s * 0.5, 0, 0.94), (0.05, 1.5, 0.06), 'GlowPink')
    b.cyl((0, 0, 1.2), 0.07, 0.5, 'Steel', seg=6)
    b.sphere((0, 0, 2.2), 0.82, 'Steel', seg=12, rings=7)
    b.cyl((0, 0, 2.2), 0.86, 0.09, 'GlowPink', seg=12)
    b.cyl((0, 0, 2.2), 1.15, 0.06, 'GlowBlue', seg=14, rotm=Matrix.Rotation(0.5, 3, 'X'))
    b.cyl((0, 0, 2.2), 1.15, 0.06, 'GlowPink', seg=14, rotm=Matrix.Rotation(-0.5, 3, 'X') @ Matrix.Rotation(0.4, 3, 'Y'))
    for k in range(6):
        a = k * math.pi / 3
        b.box((math.cos(a) * 0.62, math.sin(a) * 0.62, 2.62), (0.16, 0.16, 0.16), 'White', rot=a)
        b.box((math.cos(a + 0.5) * 0.7, math.sin(a + 0.5) * 0.7, 1.82), (0.16, 0.16, 0.16), 'Team', rot=a)
    b.cyl((0, 0, 3.12), 0.05, 0.24, 'Steel', seg=6)
    return b


def plant() -> B:
    b = B()
    b.box((0, 0, 0.12), (2.0, 2.6, 0.24), 'DarkConc', taper=(0.95, 0.96))
    b.cyl((0, -0.55, 1.2), 0.72, 1.95, 'Steel', seg=12)
    b.sphere((0, -0.55, 2.17), 0.72, 'Steel', seg=12, rings=4, scale=(1, 1, 0.45))
    b.cyl((0, -0.55, 1.35), 0.75, 0.36, 'Team', seg=12)
    b.cyl((0, -0.55, 0.55), 0.75, 0.1, 'Gunmetal', seg=12)
    b.cyl((0, -0.55, 2.55), 0.1, 0.3, 'Gunmetal', seg=6)
    b.cyl((0, 0.75, 1.65), 0.26, 2.85, 'Concrete', seg=8, r2=0.17)
    b.cyl((0, 0.75, 2.55), 0.215, 0.22, 'Red', seg=8, r2=0.2)
    b.cyl((0, 0.75, 2.95), 0.19, 0.12, 'Red', seg=8, r2=0.18)
    b.cyl((0, 0.75, 3.1), 0.13, 0.08, 'GlowCyan', seg=8)
    b.limb((0, 0.1, 0.85), (0, 0.6, 0.85), 0.2, 'Yellow', round_end=False)
    b.limb((0.3, -0.55, 2.3), (0.3, 0.3, 2.3), 0.1, 'Yellow')
    b.limb((0.3, 0.3, 2.3), (0.3, 0.3, 0.3), 0.1, 'Yellow', round_end=False)
    for x, y, h, r in ((0.7, 0.2, 0.9, 0.2), (-0.65, 0.15, 0.7, 0.17), (-0.6, 1.0, 0.55, 0.14), (0.72, 1.0, 0.45, 0.12)):
        b.cyl((x, y, 0.24 + h * 0.35), r, h * 0.7, 'CrystalA', seg=5, r2=r * 0.9)
        b.cone((x, y, 0.24 + h * 0.85), r * 0.9, h * 0.3, 'CrystalB', seg=5)
    return b


def casino() -> B:
    b = B()
    b.box((0, 0, 0.15), (1.3, 1.9, 0.3), 'Black', taper=(0.94, 0.96))
    b.box((0, 0, 1.3), (1.0, 1.6, 2.0), 'Red', taper=(0.92, 1.0))
    b.box((0, 0, 2.52), (1.1, 1.75, 0.5), 'Gold', taper=(0.85, 0.95))
    b.box((0, 0, 2.82), (0.8, 1.5, 0.1), 'GlowYellow')
    for s in (-1, 1):
        b.box((s * 0.49, 0, 1.62), (0.06, 1.36, 0.74), 'Gold')
        for i, y in enumerate((-0.43, 0, 0.43)):
            b.box((s * 0.51, y, 1.62), (0.05, 0.37, 0.6), 'White')
            digit(b, '7', s * 0.54, y, 1.62, 0.36, 'GlowRed', s)
        b.box((s * 0.6, 0, 0.9), (0.3, 1.2, 0.1), 'Steel')
        b.box((s * 0.52, 0, 1.08), (0.06, 0.9, 0.14), 'Black')
        b.box((s * 0.51, 0, 0.55), (0.05, 1.3, 0.3), 'Team')
        for y in (-0.3, 0.05, 0.32):
            b.cyl((s * 0.62, y, 0.98), 0.1, 0.04, 'Gold', seg=8)
    b.limb((0, 0.8, 1.25), (0, 1.02, 1.3), 0.12, 'Steel')
    b.limb((0, 1.02, 1.3), (0, 1.08, 2.05), 0.08, 'Steel', round_end=False)
    b.sphere((0, 1.08, 2.12), 0.15, 'Red', seg=8, rings=4)
    for y in (-0.6, 0, 0.6):
        b.sphere((0, y, 2.9), 0.09, 'GlowYellow', seg=6, rings=3)
    return b


def bank() -> B:
    b = B()
    b.box((0, 0, 0.1), (2.3, 2.9, 0.2), 'Concrete')
    b.box((0, 0, 0.3), (2.0, 2.6, 0.2), 'Marble')
    b.box((0, 0, 1.15), (0.9, 2.0, 1.5), 'Steel')
    for s in (-1, 1):
        for y in (-0.96, -0.32, 0.32, 0.96):
            b.cyl((s * 0.72, y, 1.15), 0.14, 1.5, 'Marble', seg=8, r2=0.12)
            b.box((s * 0.72, y, 0.46), (0.36, 0.36, 0.12), 'Marble')
            b.box((s * 0.72, y, 1.86), (0.36, 0.36, 0.1), 'Marble')
        b.cyl((s * 0.46, 0, 1.1), 0.5, 0.08, 'Gold', axis='x', seg=12)
        b.cyl((s * 0.5, 0, 1.1), 0.36, 0.06, 'Gunmetal', axis='x', seg=12)
        for k in range(4):
            a = k * math.pi / 4
            b.box((s * 0.55, 0, 1.1), (0.04, 0.62, 0.06), 'Gold', rot=Matrix.Rotation(a, 3, 'X'))
    b.box((0, 0, 2.02), (1.9, 2.7, 0.22), 'Marble')
    b.box((0, 0, 2.18), (1.94, 2.74, 0.1), 'Team')
    b.box((0, 0, 2.58), (1.9, 2.7, 0.7), 'Marble', taper=(1.0, 0.03))
    for s in (-1, 1):
        b.cyl((s * 0.96, 0, 2.5), 0.2, 0.05, 'Gold', axis='x', seg=10)
    b.cyl((0, 0, 3.3), 0.36, 0.12, 'Gold', axis='x', seg=12)
    b.cyl((0, 0, 3.3), 0.24, 0.16, 'GlowYellow', axis='x', seg=12)
    return b


def gunshop() -> B:
    b = B()
    b.box((0, 0, 0.35), (1.1, 1.9, 0.7), 'Olive')
    b.box((0, 0, 0.72), (1.14, 1.94, 0.08), 'OliveD')
    for y in (-0.6, 0.6):
        b.box((0, y, 0.37), (1.14, 0.12, 0.72), 'Gunmetal')
    for s in (-1, 1):
        b.box((s * 0.56, 0, 0.4), (0.03, 0.6, 0.24), 'Yellow')
    b.cyl((0, 0, 1.1), 0.07, 0.7, 'Steel', seg=6)
    b.cyl((0, 0, 2.2), 1.0, 0.1, 'Team', axis='x', seg=14)
    b.cyl((0, 0, 2.2), 0.86, 0.14, 'White', axis='x', seg=14)
    b.cyl((0, 0, 2.2), 0.6, 0.17, 'Red', axis='x', seg=14)
    b.cyl((0, 0, 2.2), 0.34, 0.2, 'White', axis='x', seg=12)
    b.cyl((0, 0, 2.2), 0.13, 0.23, 'GlowRed', axis='x', seg=8)
    pivot = Vector((0, 0, 2.2))
    for s in (-1, 1):
        for ang in (0.62, math.pi - 0.62):
            r = Matrix.Rotation(ang * s, 3, 'X')
            def part(local, size, m, r=r, s=s):
                b.box(r @ Vector(local) + pivot + Vector((s * 0.2, 0, 0)), size, m, rot=r)
            part((0, 0, 0), (0.1, 1.0, 0.17), 'Gunmetal')
            part((0, 0.78, 0.03), (0.06, 0.62, 0.07), 'Black')
            part((0, 0.3, -0.02), (0.11, 0.42, 0.13), 'Steel')
            part((0, -0.72, -0.05), (0.09, 0.5, 0.22), 'Wood')
            part((0, 0.12, -0.2), (0.07, 0.14, 0.3), 'Black')
            part((0, -0.3, -0.16), (0.07, 0.1, 0.2), 'Wood')
            part((0, 0.02, 0.13), (0.05, 0.32, 0.07), 'Black')
    return b


KINDS = {'store': store, 'gas': gas, 'club': club, 'plant': plant, 'casino': casino, 'bank': bank, 'gunshop': gunshop}


def build_business(path: str) -> int:
    reset()
    mat('Gold', '#e2b64a')
    mat('Marble', '#e6eaf0')
    mat('GlowPink', '#ff6ad5', glow=True)
    mat('GlowYellow', '#ffd84a', glow=True)
    return export(path, [fn().build(f'biz_{k}') for k, fn in KINDS.items()])
