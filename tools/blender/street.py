"""LAST CITY 거리 소품(2차). 단위는 미터, +X 가 차도 쪽을 봅니다. props.glb 에 함께 들어갑니다."""
import math

from mathutils import Matrix

from lib import B, mat

TAU = math.pi * 2


def street_palette() -> None:
    mat('Awning', '#c8473f')
    mat('Poster', '#e9c46a')
    mat('Poster2', '#2a9d8f')
    mat('Flower', '#e56b9f')
    mat('Soil', '#4a3a2c')


def bus_stop() -> B:
    b = B()
    for y in (-1.5, 1.5):
        b.box((-0.45, y, 1.25), (0.1, 0.1, 2.5), 'Steel')
        b.box((0.5, y, 2.42), (2.0, 0.08, 0.08), 'Steel')
    b.box((0.1, 0, 2.52), (1.5, 3.4, 0.1), 'Gunmetal', off=(0.0, 0.0))
    b.box((0.1, 0, 2.6), (1.3, 3.2, 0.05), 'Glass')
    b.box((-0.45, 0, 1.45), (0.05, 2.9, 1.6), 'Glass')
    b.box((-0.45, 0, 0.6), (0.07, 3.0, 0.1), 'Steel')
    b.box((-0.15, -0.2, 0.48), (0.42, 2.0, 0.07), 'Wood')
    for y in (-1.0, 0.6):
        b.box((-0.15, y, 0.24), (0.36, 0.06, 0.46), 'Black')
    b.box((-0.4, 1.1, 1.45), (0.06, 0.7, 1.2), 'Poster2')
    b.box((-0.36, 1.1, 1.75), (0.03, 0.5, 0.35), 'Poster')
    b.cyl((0.75, 1.75, 1.4), 0.05, 2.8, 'Steel', seg=6)
    b.box((0.75, 1.75, 2.75), (0.08, 0.6, 0.6), 'Navy')
    b.box((0.8, 1.75, 2.75), (0.03, 0.4, 0.4), 'GlowBlue')
    return b


def vending() -> B:
    b = B()
    b.box((0, 0, 0.95), (0.75, 1.0, 1.9), 'Red')
    b.box((0, 0, 0.06), (0.8, 1.05, 0.12), 'Black')
    b.box((0.38, -0.12, 1.2), (0.03, 0.62, 1.1), 'Glow')
    for z in (0.85, 1.2, 1.55):
        for y in (-0.33, -0.12, 0.09):
            b.box((0.4, y, z), (0.03, 0.12, 0.22), ('Yellow', 'GlowGreen', 'Navy')[int((z * 10 + y * 10) % 3)])
    b.box((0.38, 0.34, 1.3), (0.04, 0.18, 0.5), 'Gunmetal')
    b.box((0.4, 0.34, 1.4), (0.03, 0.1, 0.08), 'GlowGreen')
    b.box((0.38, -0.05, 0.35), (0.05, 0.7, 0.22), 'Black')
    b.box((0, 0, 1.92), (0.78, 1.03, 0.06), 'White')
    return b


def billboard() -> B:
    b = B()
    for y in (-1.6, 1.6):
        b.cyl((0, y, 2.6), 0.12, 5.2, 'Steel', seg=6)
        b.box((0, y, 0.12), (0.5, 0.5, 0.24), 'DarkConc')
    b.limb((0, -1.6, 1.0), (0, 1.6, 3.6), 0.07, 'Steel', round_end=False)
    b.box((0, 0, 6.3), (0.3, 5.6, 2.8), 'Gunmetal')
    b.box((0.17, 0, 6.3), (0.04, 5.3, 2.5), 'Poster')
    b.box((0.2, -1.3, 6.3), (0.03, 2.1, 1.9), 'Poster2')
    b.cyl((0.22, -1.3, 6.3), 0.6, 0.04, 'White', axis='x', seg=12)
    for z in (6.9, 6.3, 5.7):
        b.box((0.2, 1.3, z), (0.03, 2.0, 0.28), 'Red' if z > 6.5 else 'Black')
    b.box((-0.17, 0, 6.3), (0.04, 5.3, 2.5), 'Navy')
    b.box((-0.2, 0, 6.5), (0.03, 3.6, 0.5), 'White')
    b.box((-0.2, 0, 5.8), (0.03, 2.4, 0.26), 'Yellow')
    b.box((0, 0, 4.82), (1.0, 5.8, 0.08), 'Steel')
    for y in (-2.0, -0.67, 0.67, 2.0):
        b.limb((0.2, y, 4.9), (0.75, y, 5.05), 0.05, 'Steel', round_end=False)
        b.box((0.78, y, 5.08), (0.16, 0.3, 0.1), 'Glow')
    return b


def kiosk() -> B:
    b = B()
    b.box((0, 0, 1.1), (1.5, 2.2, 2.2), 'Green')
    b.box((0, 0, 2.28), (1.9, 2.5, 0.14), 'Roof', taper=(0.9, 0.94))
    b.box((0.76, 0, 1.45), (0.04, 1.8, 0.9), 'Black')
    b.box((0.9, 0, 0.95), (0.36, 2.0, 0.08), 'Wood')
    for i in range(5):
        b.box((1.15, -0.9 + i * 0.45, 2.0), (0.6, 0.45, 0.06), 'Awning' if i % 2 else 'White', rot=Matrix.Rotation(0.32, 3, 'Y'))
    for i, m in enumerate(('Poster', 'White', 'Poster2', 'Red', 'White')):
        b.box((0.92, -0.7 + i * 0.35, 1.03), (0.26, 0.26, 0.08), m, rot=0.15 * (i - 2))
    for i, m in enumerate(('Red', 'Poster', 'Navy')):
        b.box((0.78, -0.55 + i * 0.55, 0.5), (0.03, 0.4, 0.55), m)
    b.box((0.2, 0, 2.62), (0.12, 1.6, 0.5), 'Navy')
    b.box((0.27, 0, 2.62), (0.03, 1.3, 0.2), 'Glow')
    return b


def planter() -> B:
    b = B()
    b.box((0, 0, 0.3), (0.9, 2.2, 0.6), 'Concrete', taper=(1.08, 1.03))
    b.box((0, 0, 0.6), (0.82, 2.1, 0.06), 'Soil')
    for y, r, m in ((-0.65, 0.42, 'Leaf'), (0.0, 0.5, 'Leaf2'), (0.68, 0.4, 'Leaf')):
        b.sphere((0, y, 0.6 + r * 0.7), r, m, seg=7, rings=4, scale=(0.95, 1.0, 0.85))
    for x, y, z in ((0.2, -0.75, 1.2), (-0.15, -0.5, 1.22), (0.1, 0.55, 1.18), (-0.2, 0.85, 1.12), (0.25, 0.1, 1.38)):
        b.sphere((x, y, z), 0.09, 'Flower', seg=5, rings=3)
    return b


def bollards() -> B:
    b = B()
    for y in (-1.2, 0, 1.2):
        b.cyl((0, y, 0.45), 0.11, 0.9, 'Gunmetal', seg=8)
        b.sphere((0, y, 0.9), 0.11, 'Gunmetal', seg=8, rings=3)
        b.cyl((0, y, 0.72), 0.118, 0.1, 'Yellow', seg=8)
    for y in (-0.6, 0.6):
        b.limb((0, y - 0.6, 0.62), (0, y, 0.5), 0.035, 'Steel', round_end=False)
        b.limb((0, y, 0.5), (0, y + 0.6, 0.62), 0.035, 'Steel', round_end=False)
    return b


def phone_booth() -> B:
    b = B()
    b.box((0, 0, 0.06), (1.0, 1.0, 0.12), 'DarkConc')
    for x in (-0.44, 0.44):
        for y in (-0.44, 0.44):
            b.box((x, y, 1.2), (0.09, 0.09, 2.2), 'Red')
    b.box((0, 0, 2.38), (1.04, 1.04, 0.22), 'Red')
    b.box((0, 0, 2.52), (0.9, 0.9, 0.08), 'Red', taper=(0.8, 0.8))
    for s in (-1, 1):
        b.box((0, s * 0.45, 1.3), (0.8, 0.03, 1.9), 'Glass')
        b.box((s * 0.48, 0, 2.38), (0.03, 0.7, 0.14), 'Glow')
    b.box((-0.45, 0, 1.3), (0.03, 0.8, 1.9), 'Glass')
    b.box((-0.36, 0, 1.4), (0.14, 0.4, 0.55), 'Black')
    b.box((-0.28, 0.08, 1.5), (0.04, 0.1, 0.3), 'Steel')
    b.box((-0.28, -0.1, 1.38), (0.03, 0.16, 0.16), 'GlowGreen')
    return b


def street_sign() -> B:
    b = B()
    b.cyl((0, 0, 1.7), 0.05, 3.4, 'Steel', seg=6)
    b.box((0, 0, 0.06), (0.26, 0.26, 0.12), 'Gunmetal')
    b.box((0, 0.5, 3.2), (0.05, 1.1, 0.28), 'Green')
    b.box((0.03, 0.5, 3.2), (0.02, 0.8, 0.08), 'White')
    b.box((-0.03, 0.5, 3.2), (0.02, 0.8, 0.08), 'White')
    b.box((0.4, 0, 2.86), (0.9, 0.05, 0.28), 'Navy')
    b.box((0.4, 0.03, 2.86), (0.6, 0.02, 0.08), 'White')
    b.box((0.4, -0.03, 2.86), (0.6, 0.02, 0.08), 'White')
    b.cyl((0.04, 0, 2.2), 0.3, 0.04, 'Red', axis='x', seg=8)
    b.box((0.07, 0, 2.2), (0.02, 0.42, 0.1), 'White')
    return b


def parasol() -> B:
    b = B()
    b.cyl((0, 0, 0.72), 0.55, 0.06, 'White', seg=10)
    b.cyl((0, 0, 0.36), 0.05, 0.72, 'Steel', seg=6)
    b.cyl((0, 0, 0.03), 0.3, 0.06, 'Gunmetal', seg=8)
    b.cyl((0, 0, 1.5), 0.03, 1.6, 'Steel', seg=6)
    for k in range(8):
        a0, a1 = k * TAU / 8, (k + 1) * TAU / 8
        m = 'Awning' if k % 2 == 0 else 'White'
        from mathutils import Vector
        p0, p1 = Vector((math.cos(a0) * 1.35, math.sin(a0) * 1.35, 2.0)), Vector((math.cos(a1) * 1.35, math.sin(a1) * 1.35, 2.0))
        b._begin()
        b._poly([Vector((0, 0, 2.45)), p0, p1], m)
        b._poly([Vector((0, 0, 2.42)), p1, p0], m)
    for a in (0.6, 2.7, 4.4):
        x, y = math.cos(a) * 0.95, math.sin(a) * 0.95
        b.cyl((x, y, 0.44), 0.2, 0.06, 'Awning', seg=8)
        b.cyl((x, y, 0.22), 0.04, 0.44, 'Steel', seg=6)
    b.cyl((0.2, 0.1, 0.82), 0.05, 0.14, 'Poster', seg=6)
    b.cyl((-0.15, -0.2, 0.8), 0.06, 0.1, 'White', seg=6)
    return b


STREET = {'bus_stop': bus_stop, 'vending': vending, 'billboard': billboard, 'kiosk': kiosk, 'planter': planter,
          'bollards': bollards, 'phone_booth': phone_booth, 'street_sign': street_sign, 'parasol': parasol}
