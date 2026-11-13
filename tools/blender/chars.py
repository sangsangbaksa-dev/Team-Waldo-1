"""캐릭터와 무기 모델. 키 1.78m, +X 정면. 몸(Body)과 다리(Leg)를 나눠 내보냅니다(걷기 애니메이션은 게임에서)."""
import math
import random
import zlib
import bpy  # noqa: F401  (mathutils보다 먼저)
from mathutils import Vector
from lib import B, export, reset

HIP = 0.9


def gun(kind: str) -> B:
    """손잡이가 원점인 총. 총구는 +X."""
    g = B()
    if kind == 'pistol':
        g.box((0.09, 0, 0.04), (0.24, 0.04, 0.055), 'Gunmetal')
        g.box((0.0, 0, -0.03), (0.05, 0.04, 0.11), 'Black', taper=(1.0, 1.0), off=(-0.015, 0))
        g.box((0.1, 0, 0.0), (0.12, 0.03, 0.025), 'Steel')
    elif kind == 'smg':
        g.box((0.12, 0, 0.035), (0.34, 0.05, 0.08), 'Gunmetal')
        g.cyl((0.36, 0, 0.045), 0.02, 0.14, 'Black', axis='x')
        g.box((-0.1, 0, 0.025), (0.14, 0.035, 0.055), 'Black', taper=(1.0, 0.8))
        g.box((0.13, 0, -0.09), (0.04, 0.03, 0.16), 'Steel')
        g.box((0.26, 0, -0.035), (0.035, 0.03, 0.07), 'Black')
        g.box((0.08, 0, 0.088), (0.1, 0.02, 0.025), 'Black')
    elif kind == 'shotgun':
        g.cyl((0.36, 0, 0.045), 0.024, 0.56, 'Gunmetal', axis='x')
        g.cyl((0.34, 0, 0.0), 0.02, 0.4, 'Steel', axis='x')
        g.box((0.3, 0, 0.0), (0.16, 0.05, 0.05), 'Wood')
        g.box((0.08, 0, 0.035), (0.2, 0.05, 0.08), 'Gunmetal')
        g.box((-0.15, 0, 0.0), (0.24, 0.04, 0.085), 'Wood', taper=(1.0, 1.0), off=(-0.03, 0))
    elif kind == 'rifle':
        g.box((0.1, 0, 0.035), (0.38, 0.055, 0.09), 'Gunmetal')
        g.box((0.42, 0, 0.035), (0.28, 0.05, 0.06), 'Black')
        g.cyl((0.68, 0, 0.04), 0.014, 0.22, 'Steel', axis='x')
        g.box((-0.18, 0, 0.0), (0.22, 0.04, 0.08), 'Black', off=(-0.03, 0))
        g.box((0.12, 0, -0.09), (0.045, 0.035, 0.15), 'Steel')
        g.box((0.1, 0, 0.1), (0.14, 0.035, 0.04), 'Black')
        g.cyl((0.1, 0, 0.12), 0.02, 0.1, 'Black', axis='x')
        g.box((0.3, 0, -0.04), (0.035, 0.03, 0.07), 'Black')
    elif kind == 'sniper':
        g.box((0.12, 0, 0.035), (0.42, 0.05, 0.085), 'Gunmetal')
        g.cyl((0.72, 0, 0.045), 0.015, 0.62, 'Steel', axis='x')
        g.cyl((1.05, 0, 0.045), 0.026, 0.08, 'Black', axis='x')
        g.cyl((0.14, 0, 0.125), 0.032, 0.3, 'Black', axis='x')
        g.cyl((0.3, 0, 0.125), 0.04, 0.04, 'Glass', axis='x')
        g.cyl((-0.02, 0, 0.125), 0.04, 0.04, 'Glass', axis='x')
        g.box((-0.22, 0, 0.0), (0.3, 0.045, 0.1), 'Wood', off=(-0.04, 0))
        g.limb((0.5, 0, 0.02), (0.58, 0.07, -0.16), 0.014, 'Steel').limb((0.5, 0, 0.02), (0.58, -0.07, -0.16), 0.014, 'Steel')
    elif kind == 'rocket':
        g.cyl((0.25, 0, 0.09), 0.075, 0.95, 'Olive', axis='x', seg=10)
        g.cyl((-0.27, 0, 0.09), 0.095, 0.14, 'Steel', axis='x', seg=10)
        g.cyl((0.74, 0, 0.09), 0.095, 0.1, 'Steel', axis='x', seg=10)
        g.cyl((0.12, 0, 0.09), 0.079, 0.1, 'Team', axis='x', seg=10)
        g.cyl((0.42, 0, 0.09), 0.079, 0.06, 'Yellow', axis='x', seg=10)
        g.box((0.0, 0, -0.02), (0.05, 0.04, 0.12), 'Black')
        g.box((0.34, 0, -0.04), (0.04, 0.035, 0.1), 'Black')
        g.box((0.1, 0, 0.19), (0.09, 0.03, 0.05), 'Black')
    elif kind == 'minigun':
        g.cyl((0.12, 0, 0.06), 0.085, 0.3, 'Steel', axis='x', seg=10)
        for i in range(6):
            a = i * math.pi / 3
            g.cyl((0.45, math.cos(a) * 0.05, 0.06 + math.sin(a) * 0.05), 0.014, 0.5, 'Gunmetal', axis='x')
        g.cyl((0.7, 0, 0.06), 0.075, 0.03, 'Black', axis='x', seg=10)
        g.box((-0.05, 0, -0.13), (0.22, 0.14, 0.18), 'Olive')
        g.box((0.0, 0, -0.04), (0.05, 0.04, 0.12), 'Black')
        g.box((0.18, 0, 0.17), (0.06, 0.05, 0.1), 'Black')
        g.cyl((0.12, 0, 0.06), 0.09, 0.05, 'Team', axis='x', seg=10)
    elif kind == 'railgun':
        g.box((0.05, 0, 0.04), (0.5, 0.08, 0.1), 'Black')
        g.limb((0.1, 0.04, 0.05), (0.95, 0.04, 0.05), 0.03, 'Steel').limb((0.1, -0.04, 0.05), (0.95, -0.04, 0.05), 0.03, 'Steel')
        for k in range(4):
            g.box((0.3 + k * 0.16, 0, 0.05), (0.05, 0.14, 0.13), 'GlowCyan')
        g.box((-0.12, 0, 0.0), (0.2, 0.05, 0.08), 'Steel')
        g.box((0.0, 0, -0.04), (0.05, 0.04, 0.12), 'Black')
        g.box((0.35, 0, 0.14), (0.16, 0.05, 0.04), 'Black')
    return g


def _legs(pants: str, boots: str, bulk: float, knee: bool) -> B:
    leg = B()
    leg.box((0, 0, -0.37), (0.18 * bulk, 0.18, 0.74), pants, taper=(1.0, 1.0))
    leg.box((0.045, 0, -0.82), (0.29, 0.2, 0.16), boots)
    leg.box((0.0, 0, -0.01), (0.2 * bulk, 0.2, 0.12), pants)
    if knee:
        leg.box((0.095, 0, -0.38), (0.05, 0.15, 0.13), 'DarkConc')
    return leg


def _arm(b: B, shoulder, elbow, hand, sleeve: str, bulk: float = 1.0) -> None:
    b.limb(shoulder, elbow, 0.095 * bulk, sleeve).limb(elbow, hand, 0.08 * bulk, sleeve)
    b.sphere(hand, 0.048, 'Skin', seg=6, rings=4)


def human(kind: str, s: dict) -> tuple[B, B]:
    rnd = random.Random(zlib.crc32(kind.encode()))
    bulk = s.get('bulk', 1.0)
    b = B()
    sh = s['shirt']
    b.box((0, 0, 0.98), (0.27 * bulk, 0.36 * bulk, 0.2), s.get('pants', 'Black'))
    b.box((0, 0, 1.0), (0.29 * bulk, 0.4 * bulk, 0.045), 'Black')                                  # 벨트
    b.box((0, 0, 1.23), (0.3 * bulk, 0.4 * bulk, 0.5), sh, taper=(0.96, 1.1))
    b.cyl((0.0, 0, 1.55), 0.055, 0.1, 'Skin', seg=6)
    b.sphere((0.01, 0, 1.68), 0.125, 'Skin', scale=(1.0, 0.92, 1.06), seg=8, rings=5)
    if s.get('glasses'):
        b.box((0.11, 0, 1.7), (0.035, 0.2, 0.045), 'Black')
    if s.get('hair'):
        b.sphere((-0.015, 0, 1.73), 0.132, 'Hair', scale=(1.0, 0.96, 0.7), seg=8, rings=4)
    if s.get('helmet'):
        b.sphere((0.0, 0, 1.72), 0.15, s['helmet'], scale=(1.06, 1.02, 0.86), seg=8, rings=4)
        b.box((0.0, 0, 1.655), (0.3, 0.3, 0.025), s['helmet'], taper=(1.0, 1.0))
        if s.get('visor'):
            b.box((0.12, 0, 1.69), (0.045, 0.2, 0.06), 'Black')
    if s.get('cap'):
        b.sphere((0.0, 0, 1.73), 0.14, s['cap'], scale=(1.0, 1.0, 0.7), seg=8, rings=3)
        b.box((0.14, 0, 1.7), (0.13, 0.2, 0.022), s['cap'])
        if s.get('badge'):
            b.box((0.135, 0, 1.76), (0.02, 0.045, 0.045), 'Yellow')
    if s.get('bandana'):
        b.box((0.0, 0, 1.76), (0.27, 0.27, 0.05), 'Team')
        b.box((-0.16, 0, 1.73), (0.1, 0.04, 0.06), 'Team')
    if s.get('vest'):
        b.box((0.012, 0, 1.27), (0.335 * bulk, 0.445 * bulk, 0.34), s['vest'], taper=(0.98, 1.04))
        for y in (-0.12, 0.0, 0.12):
            b.box((0.18 * bulk, y, 1.2), (0.05, 0.09, 0.1), 'Black')
    if s.get('coat'):
        b.box((0.0, 0, 1.0), (0.35, 0.5, 0.78), 'Team', taper=(0.9, 0.95))
        b.box((0.17, 0.13, 1.34), (0.05, 0.1, 0.34), 'Black', rot=0.0)
        b.box((0.17, -0.13, 1.34), (0.05, 0.1, 0.34), 'Black')
        b.box((-0.05, 0, 1.52), (0.2, 0.46, 0.05), 'Team')
        b.box((0.0, 0, 0.62), (0.36, 0.5, 0.06), 'Black')
    if s.get('pads'):
        for y in (-1, 1):
            b.box((0.0, y * 0.27 * bulk, 1.47), (0.17 * bulk, 0.13, 0.07), s['pads'], taper=(0.9, 0.9))
    if s.get('epaulette'):
        for y in (-1, 1):
            b.box((0.0, y * 0.25, 1.47), (0.08, 0.1, 0.03), 'Yellow')
    if s.get('pack'):
        b.box((-0.25, 0, 1.28), (0.17, 0.3 * bulk, 0.4), s['pack'])
        b.box((-0.34, 0, 1.12), (0.04, 0.24, 0.12), 'Black')
    if s.get('armband'):
        b.box((0.0, 0.265 * bulk, 1.32), (0.12, 0.05, 0.12), 'Team')
    # 팔 + 무기
    arms = s.get('arms', 'aim')
    sleeve = s.get('sleeve', sh)
    yR, yL = -0.25 * bulk, 0.25 * bulk
    if arms == 'down':
        _arm(b, (0, yR, 1.42), (0.02, yR - 0.04, 1.18), (0.05, yR - 0.03, 0.97), sleeve, bulk)
        _arm(b, (0, yL, 1.42), (0.02, yL + 0.04, 1.18), (0.05, yL + 0.03, 0.97), sleeve, bulk)
    else:
        k = s.get('gun')
        if k == 'rocket':
            G, LH = Vector((0.12, -0.17, 1.37)), Vector((0.46, 0.0, 1.35))
        elif k in ('pistol',):
            G, LH = Vector((0.36, -0.1, 1.27)), Vector((0.34, 0.07, 1.26))
        elif k is None:
            G, LH = Vector((0.3, -0.13, 1.0)), Vector((0.32, -0.12, 1.2))
        else:
            G, LH = Vector((0.3, -0.12, 1.24)), Vector((0.55 if k in ('rifle', 'sniper') else 0.42, 0.04, 1.27))
        _arm(b, (0, yR, 1.43), (0.1, yR - 0.04, 1.13), tuple(G), sleeve, bulk)
        _arm(b, (0, yL, 1.43), (0.2, yL + 0.02, 1.15), tuple(LH), sleeve, bulk)
        if k:
            b.merge(gun(k), at=tuple(G))
    if s.get('tool') == 'pick':
        b.limb((0.26, -0.13, 1.0), (0.5, -0.13, 1.68), 0.04, 'Wood')
        b.box((0.51, -0.13, 1.7), (0.05, 0.4, 0.07), 'Steel', taper=(0.6, 1.0))
    if s.get('cross'):
        for x, rz in ((0.15, 0), ):
            b.box((x, 0, 1.76), (0.02, 0.1, 0.03), 'Red')
            b.box((x, 0, 1.76), (0.02, 0.03, 0.1), 'Red')
        b.box((0.17, 0, 1.28), (0.03, 0.14, 0.04), 'Red')
        b.box((0.17, 0, 1.28), (0.03, 0.04, 0.14), 'Red')
        b.box((-0.35, 0, 1.28), (0.03, 0.12, 0.04), 'Red')
        b.box((-0.35, 0, 1.28), (0.03, 0.04, 0.12), 'Red')
    if s.get('ghillie'):
        b.sphere((-0.02, 0, 1.7), 0.19, 'Ghillie', scale=(1.0, 1.05, 0.95), seg=8, rings=4)
        for _ in range(26):
            x, y, z = rnd.uniform(-0.28, 0.12), rnd.uniform(-0.3, 0.3), rnd.uniform(1.15, 1.85)
            b.box((x, y, z), (0.05, 0.05, rnd.uniform(0.1, 0.2)), 'Ghillie2' if rnd.random() < 0.5 else 'Ghillie', rot=rnd.uniform(0, 3))
    if s.get('rockets'):
        for y in (-0.08, 0.08):
            b.cyl((-0.28, y, 1.68), 0.04, 0.3, 'Olive', seg=6)
            b.cone((-0.28, y, 1.87), 0.04, 0.1, 'Orange', seg=6)
    if s.get('patch'):
        b.box((0.17, 0.1, 1.3), (0.03, 0.12, 0.05), 'Navy')
        b.box((-0.16, 0, 1.3), (0.03, 0.3, 0.12), 'Navy')
    if s.get('badge_chest'):
        b.box((0.155, 0.1, 1.3), (0.02, 0.05, 0.06), 'Yellow')
    return b, _legs(s.get('pants', 'Black'), s.get('boots', 'Black'), bulk, s.get('knee', False))


SPECS = {
    'boss': dict(shirt='White', coat=True, hair=True, glasses=True, epaulette=True, gun='smg', pants='Black', sleeve='Black'),
    'worker': dict(shirt='Orange', vest='Team', helmet='Yellow', pants='Khaki', boots='Wood', gun=None, tool='pick', sleeve='Orange'),
    'rifle': dict(shirt='Olive', vest='Team', helmet='Olive', pack='Olive', gun='rifle', pants='Olive', boots='Black', sleeve='Olive', knee=True),
    'heavy': dict(shirt='Steel', vest='Black', helmet='Black', visor=True, pads='Team', pack='Olive', rockets=True, gun='rocket', bulk=1.22, pants='Gunmetal', boots='Black', sleeve='Steel', knee=True),
    'sniper': dict(shirt='Ghillie', helmet=None, ghillie=True, armband=True, gun='sniper', pants='Ghillie', boots='Wood', sleeve='Ghillie'),
    'medic': dict(shirt='White', vest='White', helmet='White', cross=True, pack='Team', gun='pistol', pants='Cloth', boots='Black', sleeve='White', armband=True),
    'civ': dict(shirt='Team', hair=True, arms='down', pants='Jeans', boots='Rubber', sleeve='Team', gun=None),
    'cop': dict(shirt='Navy', cap='Navy', badge=True, badge_chest=True, vest='Black', gun='pistol', pants='Navy', boots='Black', sleeve='Navy'),
    'swat': dict(shirt='Black', vest='Gunmetal', helmet='Black', visor=True, pads='Black', patch=True, gun='smg', pants='Black', boots='Black', sleeve='Black', knee=True, bulk=1.06),
    'guard': dict(shirt='Cloth', cap='Team', badge=False, vest=None, armband=True, gun='smg', pants='Black', boots='Black', sleeve='Cloth'),
    'merc': dict(shirt='Tan', vest='Khaki', bandana=True, glasses=True, hair=True, pads='Team', gun='smg', pants='Khaki', boots='Black', sleeve='Tan', knee=True),
}


def build_characters(path: str) -> int:
    reset()
    objs = []
    for kind, spec in SPECS.items():
        body, leg = human(kind, spec)
        objs += [body.build(f'{kind}_Body'), leg.build(f'{kind}_Leg', loc=(0, 0, HIP))]
    return export(path, objs)


def _viewmodel(kind: str) -> B:
    """1인칭 총 + 양팔. 카메라 앞 아래쪽에서 보이도록 손잡이가 원점."""
    v = B()
    v.merge(gun(kind))
    v.limb((-0.55, -0.2, -0.35), (-0.04, -0.02, -0.04), 0.11, 'Olive')
    v.sphere((-0.0, -0.01, -0.02), 0.06, 'Skin', seg=6, rings=4)
    fx = 0.5 if kind in ('rifle', 'sniper', 'rocket', 'railgun', 'minigun', 'shotgun') else 0.22
    v.limb((-0.4, 0.28, -0.4), (fx, 0.03, -0.01), 0.1, 'Olive')
    v.sphere((fx, 0.03, -0.01), 0.058, 'Skin', seg=6, rings=4)
    return v


def build_weapons(path: str) -> int:
    reset()
    objs = []
    for kind in ('pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'rocket', 'minigun', 'railgun'):
        objs.append(gun(kind).build(f'g_{kind}'))
        objs.append(_viewmodel(kind).build(f'vm_{kind}'))
    return export(path, objs)
