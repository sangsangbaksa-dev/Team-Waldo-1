"""SPEED RUSH 전용 레이싱카 3종(gt, wide, long).

게임 코드가 읽는 머티리얼 이름: Paint = 차체색, Team = 스트라이프·윙 등 보조색, Glass = 유리,
Glow = 헤드라이트, GlowRed = 테일램프. 그 밖에는 고정색(Black, Steel, Gunmetal, Chrome, Rubber, Red, White).
차는 +X 로 달리고 길이 4.7, 폭 약 2.0 입니다(충돌·카메라가 이 크기에 맞춰져 있습니다). 운전자 인형은 넣지 않습니다.
"""
import math

import bpy
from mathutils import Matrix, Vector

from lib import B, export, mat, reset

PI = math.pi


def rot_y(a: float) -> Matrix:
    return Matrix.Rotation(a, 3, 'Y')


def rot_z(a: float) -> Matrix:
    return Matrix.Rotation(a, 3, 'Z')


def lerp_tab(tab: list, x: float, i: int) -> float:
    """tab: x 오름차순 행들. x 에서 i 번째 값을 선형 보간합니다."""
    if x <= tab[0][0]:
        return tab[0][i]
    for a, b in zip(tab, tab[1:]):
        if x <= b[0]:
            t = (x - a[0]) / (b[0] - a[0])
            return a[i] + (b[i] - a[i]) * t
    return tab[-1][i]


def loft2(b: B, st: list, material: str, n: int = 28, cap: bool = True) -> None:
    """단면마다 지수(sq)와 좌우 중심(cy)을 줄 수 있는 길이 방향 로프트. st: (x, 하단z, 상단z, 반폭, sq[, cy])"""
    b._begin()
    rings = []
    for s in st:
        x, zb, zt, hw, sq = s[:5]
        cy = s[5] if len(s) > 5 else 0.0
        zc, hh, ring = (zb + zt) / 2, (zt - zb) / 2, []
        for k in range(n):
            t = 2 * PI * k / n
            c, sn = math.cos(t), math.sin(t)
            ring.append(Vector((x, cy + hw * math.copysign(abs(c) ** (2 / sq), c), zc + hh * math.copysign(abs(sn) ** (2 / sq), sn))))
        rings.append(ring)
    for a in range(len(rings) - 1):
        for k in range(n):
            j = (k + 1) % n
            b._poly([rings[a][k], rings[a][j], rings[a + 1][j], rings[a + 1][k]], material)
    if cap:
        b._poly(rings[0][::-1], material)
        b._poly(rings[-1][:], material)


def lathe(b: B, prof: list, material: str, seg: int = 32) -> None:
    """y 축을 중심으로 (반지름, y) 윤곽을 돌려 만든 바퀴 부품. 윤곽을 진행 방향의 오른쪽이 바깥이 되게 적습니다."""
    b._begin()
    rings = [[Vector((r * math.cos(2 * PI * i / seg), y, r * math.sin(2 * PI * i / seg))) for i in range(seg)] for r, y in prof]
    for a in range(len(prof) - 1):
        for i in range(seg):
            j = (i + 1) % seg
            b._poly([rings[a][i], rings[a + 1][i], rings[a + 1][j], rings[a][j]], material)


def ang_pt(rho: float, y: float, th: float) -> tuple:
    return (rho * math.cos(th), y, rho * math.sin(th))


# ───────────────────────── 바퀴 ─────────────────────────
def wheel(style: str, R: float, w: float) -> B:
    """+y 쪽이 바깥면인 바퀴(원점이 중심). style: twin(쌍스포크) | deep(넓은 6스포크 딥디쉬) | mesh(가는 스포크 다수)"""
    b = B()
    h = w / 2
    # 타이어: 어깨가 둥글고 트레드에 얕은 홈이 있는 단면
    lathe(b, [(0.60 * R, -0.43 * h), (0.78 * R, -h), (0.94 * R, -0.9 * h), (R * 0.995, -0.62 * h), (R, -0.5 * h), (R * 0.985, -0.42 * h), (R, -0.34 * h),
               (R, 0.34 * h), (R * 0.985, 0.42 * h), (R, 0.5 * h), (R * 0.995, 0.62 * h), (0.94 * R, 0.9 * h), (0.78 * R, h), (0.62 * R, 0.96 * h), (0.60 * R, 0.43 * h)], 'Rubber', seg=30)
    lathe(b, [(0.60 * R, 0.43 * h), (0.60 * R, -0.43 * h)], 'Rubber', seg=30)
    # 림: 배럴과 바깥 립, 안쪽으로 파인 접시
    lathe(b, [(0.57 * R, -0.5 * h), (0.64 * R, -0.5 * h), (0.64 * R, 0.96 * h), (0.60 * R, 1.0 * h), (0.56 * R, 0.94 * h), (0.50 * R, 0.56 * h), (0.13 * R, 0.6 * h), (0.13 * R, 0.5 * h)], 'Gunmetal', seg=30)
    lathe(b, [(0.64 * R, 0.96 * h), (0.655 * R, 0.99 * h), (0.60 * R, 1.01 * h), (0.58 * R, 0.99 * h)], 'Chrome', seg=30)       # 림 립(은색 테두리)
    # 브레이크 디스크와 캘리퍼(스포크 사이로 보임)
    lathe(b, [(0.2 * R, 0.1 * h), (0.5 * R, 0.1 * h), (0.5 * R, 0.24 * h), (0.2 * R, 0.24 * h)], 'Steel', seg=30)
    b.box(ang_pt(0.5 * R, 0.17 * h, math.radians(155)), (0.3 * R, 0.30 * h, 0.2 * R), 'Red', rot=rot_y(-(math.radians(155) + PI / 2)))
    # 스포크
    if style == 'twin':
        for k in range(5):
            a0 = 2 * PI * k / 5 + 0.3
            for d in (-0.1, 0.1):
                b.limb(ang_pt(0.17 * R, 0.66 * h, a0 + d * 0.5), ang_pt(0.60 * R, 0.8 * h, a0 + d), 0.2 * R, 'Chrome', t2=0.12 * R, seg=6, round_end=False)
    elif style == 'deep':
        for k in range(6):
            a0 = 2 * PI * k / 6 + 0.2
            b.limb(ang_pt(0.15 * R, 0.62 * h, a0), ang_pt(0.62 * R, 0.82 * h, a0 + 0.1), 0.3 * R, 'Chrome', t2=0.2 * R, seg=6, round_end=False)
            b.cyl(ang_pt(0.52 * R, 0.86 * h, a0 + 0.1), 0.035 * R, 0.05 * h, 'Black', axis='y', seg=6)
    else:
        for k in range(12):
            a0 = 2 * PI * k / 12
            b.limb(ang_pt(0.16 * R, 0.64 * h, a0), ang_pt(0.60 * R, 0.78 * h, a0 + 0.22), 0.11 * R, 'Chrome', t2=0.08 * R, seg=5, round_end=False)
    # 센터 허브와 락너트
    lathe(b, [(0.0, 0.6 * h), (0.15 * R, 0.62 * h), (0.15 * R, 0.78 * h), (0.07 * R, 0.84 * h), (0.0, 0.84 * h)], 'Chrome', seg=14)
    b.cyl((0, 0.86 * h, 0), 0.035 * R, 0.04 * h, 'Red', axis='y', seg=6)
    return b


# ───────────────────────── 차 사양 ─────────────────────────
# body: 차체 단면(x, 하단, 상단, 반폭, sq). cab: 유리 캐빈. 앞·뒤 휠 위 펜더 불룩이는 racer() 가 body 윗선에 얹어 만듭니다.
SPEC = {
    'gt': dict(
        k=1.0, wheel='twin', wr=0.35, ww=0.34, wing=(1.05, 1.0, 0.4), flare=0.0,
        body=[(-2.35, .30, .80, .74, 2.7), (-2.2, .20, .88, .92, 3.0), (-1.8, .16, .90, .98, 3.2), (-1.2, .14, .84, 1.0, 3.4), (-0.6, .14, .79, .98, 3.4), (0.1, .14, .77, .97, 3.4), (0.7, .14, .77, .97, 3.4), (1.2, .14, .76, .98, 3.4), (1.7, .14, .71, .96, 3.2), (2.1, .15, .61, .88, 3.0), (2.28, .18, .54, .74, 2.8), (2.36, .22, .45, .52, 2.6)],
        cab=[(-1.5, .80, .86, .56, 2.6), (-1.2, .80, 1.04, .67, 2.6), (-0.7, .78, 1.16, .73, 2.6), (-0.1, .78, 1.2, .74, 2.6), (0.35, .77, 1.15, .77, 2.6), (0.8, .75, .96, .88, 2.8), (1.05, .74, .82, .93, 3.0)],
    ),
}
SPEC['wide'] = dict(
    k=1.06, wheel='deep', wr=0.36, ww=0.38, wing=(1.2, 1.1, 0.5), flare=0.07,
    body=[(-2.35, .30, .82, .78, 2.7), (-2.2, .20, .9, .97, 3.0), (-1.8, .16, .92, 1.04, 3.2), (-1.2, .14, .86, 1.06, 3.4), (-0.6, .14, .8, 1.04, 3.4), (0.1, .14, .77, 1.03, 3.4), (0.7, .14, .77, 1.03, 3.4), (1.2, .14, .75, 1.04, 3.4), (1.7, .14, .70, 1.02, 3.2), (2.1, .15, .60, .93, 3.0), (2.28, .18, .52, .78, 2.8), (2.36, .22, .43, .56, 2.6)],
    cab=[(-1.4, .8, .86, .54, 2.6), (-1.1, .8, 1.02, .66, 2.6), (-0.7, .78, 1.13, .72, 2.6), (-0.1, .78, 1.17, .73, 2.6), (0.3, .76, 1.12, .76, 2.6), (0.75, .74, .95, .88, 2.8), (1.0, .73, .8, .94, 3.0)],
)
SPEC['long'] = dict(
    k=0.98, wheel='mesh', wr=0.34, ww=0.32, wing=(1.0, 0.9, 0.3), flare=0.0,
    body=[(-2.38, .26, .70, .70, 2.7), (-2.2, .18, .82, .90, 3.0), (-1.7, .15, .86, .96, 3.2), (-1.1, .14, .80, .99, 3.4), (-0.4, .14, .74, .97, 3.4), (0.3, .14, .74, .96, 3.4), (0.9, .14, .71, .97, 3.4), (1.5, .14, .66, .97, 3.3), (2.0, .15, .58, .90, 3.0), (2.25, .17, .50, .76, 2.8), (2.4, .2, .40, .50, 2.6)],
    cab=[(-1.7, .76, .80, .5, 2.6), (-1.3, .76, 1.0, .64, 2.6), (-0.8, .74, 1.1, .70, 2.6), (-0.2, .74, 1.12, .72, 2.6), (0.4, .74, 1.07, .76, 2.6), (0.9, .72, .9, .86, 2.8), (1.15, .71, .77, .92, 3.0)],
)


def surf_hw(st: list, x: float, z: float) -> float:
    """차체 로프트의 x, z 지점 표면 반폭(디테일을 표면에 맞춰 얹을 때 씁니다)."""
    zb, zt, hw, sq = (lerp_tab(st, x, i) for i in (1, 2, 3, 4))
    zc, hh = (zb + zt) / 2, (zt - zb) / 2
    v = min(abs((z - zc) / hh), 0.999)
    return hw * (1 - v ** sq) ** (1 / sq)


def surf_z(st: list, x: float, y: float) -> float:
    """차체 로프트의 x, y 지점 윗면 높이."""
    zb, zt, hw, sq = (lerp_tab(st, x, i) for i in (1, 2, 3, 4))
    zc, hh = (zb + zt) / 2, (zt - zb) / 2
    v = min(abs(y) / hw, 0.999)
    return zc + hh * (1 - v ** sq) ** (1 / sq)


def racer(kind: str) -> list:
    """(B, 이름, 베벨, 스무딩 각도, 아치 컷 여부) 목록과 바퀴 위치를 돌려줍니다."""
    sp = SPEC[kind]
    L, k, flare = 4.7, sp['k'], sp['flare']
    body, cab = sp['body'], sp['cab']
    W = 2.0 * k
    wr, ww = sp['wr'], sp['ww']
    wx_f, wx_r = L * 0.3, -L * 0.3
    wy = body[7][3] - ww / 2 + 0.01   # 바퀴 중심 y: 타이어 바깥면이 펜더와 거의 같게
    # ── 1) 도장 차체 ──
    shell = B()
    loft2(shell, body, 'Paint', n=30)
    # 펜더 불룩이: 앞(+x)·뒤(-x) 휠 위. 중심 y 에서 좌우 한 쌍
    def blister(xc: float, bumps: tuple) -> list:
        out = []
        for dx, bump, hwk in zip((-0.8, -0.4, 0.0, 0.4, 0.7), bumps, (0.18, 0.3, 0.33, 0.28, 0.16)):
            x = xc + dx
            out.append((x, 0.46, lerp_tab(body, x, 2) + bump + (flare if abs(dx) < 0.5 else 0), hwk + (flare / 2 if abs(dx) < 0.5 else 0), 2.6))
        return out
    fr, rr = blister(wx_f, (0.01, 0.1, 0.14, 0.11, 0.01)), blister(wx_r, (0.01, 0.09, 0.13, 0.09, 0.01))
    cyc = body[7][3] - 0.27 - flare / 2
    for s in (-1, 1):
        loft2(shell, [(x, zb, zt, hw, sq, s * cyc) for x, zb, zt, hw, sq in fr], 'Paint', n=20)
        loft2(shell, [(x, zb, zt, hw, sq, s * cyc) for x, zb, zt, hw, sq in rr], 'Paint', n=20)

    # ── 2) 캐빈(유리), 지붕 패널, 기둥 ──
    cabin = B()
    loft2(cabin, cab, 'Glass', n=24)
    roof = [(cab[2][0] - 0.12, cab[2][2] - 0.1, cab[2][2] - 0.01, cab[2][3] * 0.8, 2.6), (cab[2][0] + 0.2, cab[2][2] - 0.08, cab[2][2] + 0.016, cab[2][3] * 0.92, 2.6),
            (cab[3][0], cab[3][2] - 0.08, cab[3][2] + 0.016, cab[3][3] * 0.93, 2.6), (cab[4][0] - 0.1, cab[4][2] - 0.08, cab[4][2] + 0.01, cab[4][3] * 0.9, 2.6), (cab[4][0] + 0.12, cab[4][2] - 0.1, cab[4][2] - 0.02, cab[4][3] * 0.8, 2.6)]
    loft2(cabin, roof, 'Paint', n=20)
    for s in (-1, 1):
        a_top = (cab[4][0] - 0.02, s * (cab[4][3] * 0.8), cab[4][2] - 0.07)
        a_bot = (cab[6][0] - 0.02, s * (cab[6][3] * 0.97), cab[6][1] + 0.02)
        cabin.limb(a_top, a_bot, 0.05, 'Black', t2=0.06, seg=6, round_end=False)                                           # A 필러
        c_top = (cab[1][0] + 0.2, s * (cab[1][3] * 0.95), cab[1][2] - 0.03)
        c_bot = (cab[0][0] + 0.02, s * (cab[0][3] * 1.02), cab[0][2] + 0.0)
        cabin.limb(c_top, c_bot, 0.12, 'Paint', t2=0.16, seg=6, round_end=False)                                           # C 필러(차체색)
    cabin.box((0.0, 0, cab[3][2] + 0.018), (cab[4][0] - cab[1][0] - 0.25, 0.22, 0.008), 'Team')                            # 루프 스트라이프
    # ── 3) 디테일(베벨 작게) ──
    d = B()
    # 센터 스트라이프: 후드와 트렁크
    for x0, x1, tw in ((0.88, 2.2, 0.17), (-2.2, -1.35, 0.17)):
        pts = [(x, lerp_tab(body, x, 2) + 0.004, tw) for x in [x0 + (x1 - x0) * i / 8 for i in range(9)]]
        loft2(d, [(x, z - 0.03, z, tw, 6.0) for x, z, tw in pts], 'Team', n=12)
    # 언더플로어/스커트
    d.box((0.0, 0, 0.14), (L - 0.7, W * 0.74, 0.05), 'Black')
    for s in (-1, 1):
        d.box((0.0, s * (body[5][3] - 0.04), 0.2), (2.0, 0.09, 0.07), 'Black', taper=(0.95, 0.8))
    # 프런트 스플리터·흡기구·카나드
    loft2(d, [(1.95, 0.09, 0.135, W * 0.46, 8.0), (2.2, 0.09, 0.135, W * 0.4, 8.0), (2.46, 0.09, 0.13, W * 0.26, 8.0)], 'Black', n=16)
    d.box((L / 2 - 0.12, 0, 0.3), (0.12, W * 0.5, 0.2), 'Black')
    for i in range(4):
        d.box((L / 2 - 0.09, 0, 0.22 + i * 0.05), (0.04, W * 0.48, 0.012), 'Gunmetal')
    for s in (-1, 1):
        d.box((L / 2 - 0.5, s * (W * 0.38), 0.17), (0.16, 0.22, 0.12), 'Black', taper=(0.9, 0.8))                         # 하단 코너 흡기구
        # 헤드라이트: 앞 펜더 모서리의 곡면에 얹은 눈매 모양 하우징 + 렌즈 + 프로젝터 + DRL 띠
        lx, ly = L / 2 - 0.22, 0.5
        lz = surf_z(body, lx, ly)
        pitch = math.atan2(lerp_tab(body, lx - 0.1, 2) - lerp_tab(body, lx + 0.1, 2), 0.2)
        R = rot_z(s * 0.42) @ rot_y(pitch)
        c0 = Vector((lx, s * ly, lz + 0.012))
        d.box(c0 + Vector((0, 0, 0.004)), (0.52, 0.3, 0.03), 'Black', taper=(0.7, 0.62), rot=R)                       # 끝이 뾰족한 하우징
        d.box(c0 + R @ Vector((0.03, -0.012 * s, 0.02)), (0.4, 0.17, 0.016), 'Glow', taper=(0.55, 0.7), rot=R)         # 얇은 렌즈
        d.cyl(c0 + R @ Vector((0.06, 0.03 * s, 0.03)), 0.058, 0.012, 'Black', axis='z', seg=14, rotm=R)                  # 프로젝터 링
        d.cyl(c0 + R @ Vector((0.06, 0.03 * s, 0.036)), 0.04, 0.01, 'White', axis='z', seg=14, rotm=R)
        d.box(c0 + R @ Vector((-0.03, 0.11 * s, 0.026)), (0.46, 0.026, 0.012), 'Glow', rot=R @ rot_z(-s * 0.1))        # 바깥 모서리 DRL 띠
        d.box(c0 + R @ Vector((-0.2, 0, 0.022)), (0.04, 0.26, 0.01), 'Black', rot=R)                                    # 뒤쪽 눈썹
        # 후드 벤트와 사이드 흡기(앞 펜더 뒤쪽)
        d.box((1.55, s * 0.36, lerp_tab(body, 1.55, 2) + 0.004), (0.5, 0.22, 0.014), 'Black')
        for i in range(3):
            d.box((1.4 + i * 0.12, s * 0.36, lerp_tab(body, 1.4, 2) + 0.012), (0.03, 0.2, 0.012), 'Gunmetal')
        vy = surf_hw(body, 0.82, 0.5)
        d.box((0.82, s * vy, 0.5), (0.56, 0.05, 0.2), 'Black', taper=(0.9, 0.5))
        for i in range(3):
            d.box((0.68 + i * 0.13, s * (vy + 0.008), 0.5), (0.04, 0.035, 0.17), 'Gunmetal')
        # 사이드미러: 스토크 + 도장 하우징 + 거울면
        mx, my, mz = cab[5][0] - 0.08, s * (cab[5][3] * 0.98), cab[5][1] + 0.07
        d.limb((mx, my, mz), (mx - 0.02, s * (cab[5][3] * 0.98 + 0.14), mz + 0.05), 0.05, 'Black', seg=6, round_end=False)
        d.sphere((mx - 0.03, s * (cab[5][3] * 0.98 + 0.2), mz + 0.07), 0.11, 'Paint', scale=(0.85, 0.7, 0.55), seg=10, rings=6)
        d.box((mx - 0.1, s * (cab[5][3] * 0.98 + 0.2), mz + 0.07), (0.02, 0.2, 0.1), 'Black')
        # 도어 손잡이
        hy2 = surf_hw(body, -0.3, 0.76)
        d.box((-0.3, s * hy2, 0.76), (0.2, 0.025, 0.035), 'Chrome')
        # 사이드 스커트 라인 / 와이드는 사이드 스트라이프
        if kind == 'wide':
            d.box((0.2, s * (surf_hw(body, 0.2, 0.46) - 0.002), 0.46), (2.4, 0.03, 0.075), 'Team')
            d.box((L / 2 - 0.36, s * (W / 2 - 0.12), 0.2), (0.4, 0.12, 0.16), 'Team', taper=(0.9, 0.6))                    # 카나드
        else:
            d.box((0.2, s * (surf_hw(body, 0.2, 0.46) - 0.002), 0.46), (2.4, 0.03, 0.04), 'Team')                            # 가는 사이드 라인
        # 테일램프: 하우징 + 붉은 렌즈 + 가로 라이트 바
        tx = -L / 2 + 0.1
        d.box((-2.2, s * 0.58, 0.8), (0.18, 0.78, 0.15), 'Black', taper=(0.9, 0.9), rot=rot_z(-s * 0.12))
        d.box((-2.26, s * 0.58, 0.805), (0.08, 0.72, 0.1), 'GlowRed', rot=rot_z(-s * 0.12))
        d.box((-2.28, s * 0.14, 0.805), (0.06, 0.3, 0.035), 'GlowRed')
        # 배기구 쌍
        for oy in (0.46, 0.7):
            d.cyl((-L / 2 + 0.02, s * oy, 0.26), 0.065, 0.14, 'Chrome', axis='x', seg=12)
            d.cyl((-L / 2 + 0.0, s * oy, 0.26), 0.045, 0.14, 'Black', axis='x', seg=10)
    # 리어 범퍼·디퓨저·번호판
    d.box((-L / 2 + 0.1, 0, 0.4), (0.24, W * 0.86, 0.2), 'Black', taper=(0.95, 0.95))
    for i in range(7):
        d.box((-L / 2 - 0.02, (i - 3) * 0.17, 0.26), (0.26, 0.018, 0.13), 'Gunmetal', taper=(1.0, 1.0))
    d.box((-L / 2 + 0.0, 0, 0.55), (0.04, 0.46, 0.12), 'White')
    # 리어 윙: 스완넥 지지대 + 메인 플레인 + 엔드플레이트
    wh, wk, wc = sp['wing']
    wing_x = -L / 2 + 0.28
    ww2 = W * 0.86 * wk
    d.box((wing_x, 0, wh), (wc, ww2, 0.04), 'Black', taper=(0.85, 1.0), rot=rot_y(0.06))                                     # 메인 플레인(앞쪽이 살짝 낮은 받음각)
    d.box((wing_x + wc * 0.06, 0, wh + 0.026), (wc * 0.6, ww2, 0.016), 'Team', rot=rot_y(0.06))                               # 도장 윗면 띠
    d.box((wing_x - wc * 0.62, 0, wh + 0.075), (wc * 0.5, ww2 * 0.98, 0.026), 'Black', taper=(0.7, 1.0), rot=rot_y(-0.3))    # 상단 플랩(두 번째 날개)
    d.box((wing_x - wc * 0.86, 0, wh + 0.1), (0.022, ww2 * 0.98, 0.05), 'Team')                                               # 거니 립
    for s in (-1, 1):
        d.box((wing_x - wc * 0.2, s * ww2 / 2, wh + 0.06), (wc * 1.25, 0.022, 0.22), 'Team', taper=(0.7, 1.0))              # 엔드플레이트
        d.box((wing_x - wc * 0.2, s * (ww2 / 2 + 0.012), wh + 0.06), (wc * 1.0, 0.01, 0.12), 'Black', taper=(0.7, 1.0))
        d.limb((wing_x + 0.16, s * 0.34, 0.92), (wing_x + 0.02, s * 0.34, wh - 0.03), 0.055, 'Black', t2=0.04, seg=6, round_end=False)  # 스완넥 지지대
        d.limb((wing_x + 0.18, s * 0.34, 0.9), (wing_x + 0.3, s * 0.38, 0.84), 0.045, 'Black', seg=6, round_end=False)
    # 와이퍼
    for s in (-1, 1):
        d.box((1.0 - 0.02, s * 0.35 - 0.1 * s, 0.79), (0.35, 0.012, 0.012), 'Black', rot=rot_z(s * 0.2))
    if kind == 'long':
        d.box((-1.95, 0, 0.97), (0.7, 0.022, 0.15), 'Team', taper=(0.6, 1.0))                                                # 테일 핀
    if kind == 'wide':
        d.box((0.6, 0, lerp_tab(body, 0.6, 2) + 0.012), (0.5, 0.52, 0.02), 'Black')
    return [(shell, 'shell', 0.016, 60.0, True), (cabin, 'cabin', 0.01, 50.0, False), (d, 'detail', 0.007, 42.0, False)], (wx_f, wx_r, wy, wr, ww, sp['wheel'], body[7][3])


def apply_all(ob: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def arch_cut(ob: bpy.types.Object, wx_f: float, wx_r: float, wy: float, wr: float, ww: float) -> None:
    """바퀴 4개 자리를 파냅니다(바퀴 하우스). 파낸 면은 검정으로 칠합니다."""
    cutters = B()
    rc = wr + 0.075
    for x in (wx_f, wx_r):
        for s in (-1, 1):
            cutters.cyl((x, s * (wy + 0.18), wr + 0.01), rc, 0.9, 'Black', axis='y', seg=28)
    cut = cutters.build('cutter', bevel=0)
    bpy.context.view_layer.objects.active = ob
    md = ob.modifiers.new('arch', 'BOOLEAN')
    md.operation = 'DIFFERENCE'
    md.object = cut
    md.solver = 'EXACT'
    md.use_self = True
    try:
        md.material_mode = 'TRANSFER'
    except Exception:
        pass
    apply_all(ob)
    bpy.data.objects.remove(cut, do_unlink=True)


def build_car(kind: str) -> bpy.types.Object:
    parts, (wx_f, wx_r, wy, wr, ww, style, yb) = racer(kind)
    objs = []
    for b, name, bevel, smooth, cut in parts:
        ob = b.build(f'{kind}_{name}', bevel=bevel, smooth_angle=smooth, segments=2)
        if cut:
            arch_cut(ob, wx_f, wx_r, wy, wr, ww)
        objs.append(ob)
    # 바퀴: 한 개 만들어 네 곳에 합칩니다
    wb = wheel(style, wr, ww)
    allw = B()
    for x in (wx_f, wx_r):
        for s in (-1, 1):
            allw.merge(wb, at=(x, s * wy, wr), mirror_y=(s < 0))
    objs.append(allw.build(f'{kind}_wheels', bevel=0, smooth_angle=34.0))
    for ob in objs:
        apply_all(ob)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    car = bpy.context.view_layer.objects.active
    car.data.validate()                          # 겹친 면 제거
    car.name = kind
    car.data.name = kind
    return car


def build_race(path: str) -> int:
    reset()
    mat('Chrome', '#c9ced6')
    cars = [build_car(k) for k in ('gt', 'wide', 'long')]
    return export(path, cars)


if __name__ == '__main__':
    import os
    import sys
    sys.path.insert(0, os.path.dirname(__file__))
    out = sys.argv[1] if len(sys.argv) > 1 else 'public/assets/models/race.glb'
    print(f'race.glb {build_race(out) / 1024:.1f} KB')
