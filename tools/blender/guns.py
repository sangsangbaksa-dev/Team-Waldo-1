"""총기 모델 (배틀그라운드풍 로우폴리). 손잡이(권총 손잡이)가 원점, 총구는 +X, 위는 +Z.

한 자루는 '맨 총'(nude: 탄창·개머리판 없음) + 교체식 부품(탄창·개머리판·조준경·총구·손잡이)으로 나뉩니다.
- g_<종류>   : 기본 탄창과 개머리판까지 붙은 완성품(바닥에 놓인 총, 병사가 든 총)
- n_<종류>   : 맨 총. 부품 조립 화면과 ZERO ZONE 1인칭에서 부품을 얹는 바탕
- arms_<종류>: 1인칭 팔(손이 총에 맞춰져 있음)
- p_<슬롯>_<이름>: 교체 부품. 원점은 총에 닿는 점이고 gunmounts.json 의 좌표에 놓입니다.
MOUNTS 는 src/shooter/gunmounts.json 으로도 내보내 게임 코드가 같은 좌표를 씁니다.
"""
import json
import math
from lib import B, mat


def palette() -> None:
    for n, c in {
        'GunBlack': '#17191d', 'GunSteel': '#5c636e', 'GunDark': '#25282e', 'GunTan': '#8c7a52', 'GunWood': '#7a5336', 'GunWoodD': '#53381f',
        'GunRubber': '#101114', 'GunLens': '#1f4a63', 'GunBrass': '#b88a3a',
    }.items():
        mat(n, c)
    mat('GlowDot', '#ff3030', glow=True)
    mat('GlowLens', '#7fd6ff', glow=True)


# 총마다 부품이 붙는 자리. sight: 레일 윗면, muzzle: 총구 끝, grip: 손잡이 장착점(핸드가드 아래), mag: 탄창 입구 윗면, stock: 개머리판 장착점
MOUNTS = {
    'pistol':  {'sight': (0.07, 0.078), 'muzzle': (0.205, 0.05), 'mag': (0.01, -0.012), 'stock': None, 'grip': None},
    'smg':     {'sight': (0.06, 0.117), 'muzzle': (0.5, 0.05), 'mag': (0.12, -0.02), 'stock': (-0.13, 0.04), 'grip': (0.32, 0.0)},
    'rifle':   {'sight': (0.03, 0.106), 'muzzle': (0.85, 0.046), 'mag': (0.11, -0.016), 'stock': (-0.2, 0.034), 'grip': (0.42, -0.014)},
    'shotgun': {'sight': (0.14, 0.084), 'muzzle': (0.86, 0.045), 'mag': (0.62, 0.0), 'stock': (-0.07, 0.035), 'grip': None},
    'sniper':  {'sight': (0.08, 0.1), 'muzzle': (1.1, 0.05), 'mag': (0.1, 0.005), 'stock': (-0.1, 0.03), 'grip': None},
}
# 가늠쇠 높이 등 게임이 필요로 하는 값
ARMS = {'pistol': (0.03, 0.05, -0.085), 'smg': (0.3, 0.035, -0.02), 'rifle': (0.46, 0.035, -0.015), 'shotgun': (0.42, 0.03, -0.02), 'sniper': (0.4, 0.03, -0.02)}


def rail(g: B, x0: float, x1: float, z: float, hw: float = 0.0105, mat_: str = 'GunBlack', step: float = 0.018) -> None:
    """피카티니 레일: 몸통 + 일정 간격의 홈."""
    g.box(((x0 + x1) / 2, 0, z), (x1 - x0, hw * 2, 0.012), mat_)
    x = x0 + step * 0.6
    while x < x1 - 0.004:
        g.box((x, 0, z + 0.004), (0.007, hw * 2 + 0.006, 0.006), 'GunDark')
        x += step


def vents(g: B, x0: float, x1: float, z: float, hw: float, n: int, mat_: str = 'GunRubber', h: float = 0.022) -> None:
    """측면 방열 구멍(양쪽)."""
    for i in range(n):
        x = x0 + (x1 - x0) * (i + 0.5) / n
        for s in (-1, 1):
            g.box((x, s * hw, z), (0.026, 0.004, h), mat_)


def trigger_guard(g: B, x0: float, x1: float, z: float, drop: float = 0.045, t: float = 0.011, mat_: str = 'GunBlack') -> None:
    g.limb((x0, 0, z), (x0 + 0.03, 0, z - drop), t, mat_, round_end=False)
    g.limb((x0 + 0.03, 0, z - drop), (x1 - 0.02, 0, z - drop), t, mat_, round_end=False)
    g.limb((x1 - 0.02, 0, z - drop), (x1, 0, z + 0.004), t, mat_, round_end=False)
    g.box((x0 + 0.045, 0, z - 0.018), (0.01, 0.008, 0.034), 'GunSteel', taper=(0.8, 1.0), off=(0.006, 0))


def pgrip(g: B, x: float, ztop: float, length: float, mat_: str = 'GunBlack', w: float = 0.036, lean: float = 0.032) -> None:
    """뒤로 기운 권총 손잡이 + 미끄럼 방지 홈."""
    g.box((x - lean / 2 + 0.004, 0, ztop - length / 2), (0.048, w, length), mat_, taper=(0.92, 0.95), off=(lean, 0))
    for i in range(4):
        z = ztop - length * (0.28 + i * 0.17)
        g.box((x - lean * (0.28 + i * 0.17) + 0.016 - lean * 0, 0, z), (0.006, w + 0.004, 0.008), 'GunDark')


# ------------------------------------------------------------------ 맨 총
def nude(kind: str) -> B:
    g = B()
    if kind == 'pistol':
        # 슬라이드
        g.loft([(-0.07, 0.022, 0.078, 0.0165), (-0.02, 0.02, 0.08, 0.018), (0.12, 0.02, 0.08, 0.018), (0.2, 0.026, 0.074, 0.0155)], 'GunDark', sq=5)
        for i in range(5):                                   # 뒤쪽 홈
            for s in (-1, 1):
                g.box((-0.05 + i * 0.012, s * 0.0185, 0.052), (0.005, 0.004, 0.04), 'GunBlack')
        g.box((0.05, 0.0172, 0.058), (0.07, 0.006, 0.024), 'GunBlack')      # 배출구
        g.box((0.2, 0, 0.05), (0.014, 0.022, 0.026), 'GunSteel')          # 총열 끝
        g.box((0.19, 0, 0.083), (0.012, 0.007, 0.012), 'GunSteel')        # 가늠쇠
        g.box((-0.06, 0, 0.085), (0.02, 0.022, 0.012), 'GunSteel')        # 가늠자
        # 프레임
        g.loft([(-0.07, -0.002, 0.026, 0.017), (0.0, -0.006, 0.026, 0.0185), (0.16, 0.002, 0.024, 0.0185), (0.18, 0.006, 0.022, 0.015)], 'GunBlack', sq=4)
        pgrip(g, 0.0, 0.026, 0.12)
        trigger_guard(g, 0.03, 0.115, 0.0, drop=0.05)
        g.box((0.14, 0, 0.0), (0.05, 0.03, 0.012), 'GunBlack')             # 라이트 레일
    elif kind == 'smg':
        g.loft([(-0.12, 0.004, 0.088, 0.027), (0.0, -0.006, 0.09, 0.03), (0.22, -0.004, 0.09, 0.03), (0.26, 0.004, 0.086, 0.027)], 'GunBlack', sq=4.5)
        rail(g, -0.06, 0.24, 0.094, 0.0105, 'GunDark')
        g.loft([(0.24, 0.006, 0.084, 0.03), (0.36, 0.008, 0.082, 0.029), (0.43, 0.016, 0.074, 0.024)], 'GunTan', sq=4.2)   # 핸드가드
        vents(g, 0.25, 0.41, 0.046, 0.0295, 4, h=0.03)
        g.cyl((0.465, 0, 0.05), 0.0135, 0.06, 'GunSteel', axis='x', seg=10)
        g.cyl((0.495, 0, 0.05), 0.02, 0.03, 'GunBlack', axis='x', seg=10)
        g.box((0.12, 0.0295, 0.058), (0.1, 0.006, 0.02), 'GunRubber')       # 배출구
        g.box((-0.09, 0, 0.1), (0.025, 0.022, 0.014), 'GunSteel')           # 뒤 가늠자
        g.box((0.4, 0, 0.09), (0.012, 0.008, 0.02), 'GunSteel')             # 앞 가늠쇠
        g.box((0.12, 0, -0.02), (0.075, 0.042, 0.04), 'GunBlack')           # 탄창 입구
        pgrip(g, 0.0, 0.0, 0.13, w=0.04)
        trigger_guard(g, 0.035, 0.1, -0.006, drop=0.045)
        g.box((0.0, 0.0, 0.1), (0.05, 0.02, 0.012), 'GunSteel')             # 장전 손잡이
        g.cyl((-0.13, 0, 0.04), 0.02, 0.03, 'GunBlack', axis='x', seg=8)    # 개머리판 장착부
    elif kind == 'rifle':
        g.loft([(-0.14, -0.018, 0.05, 0.0235), (-0.02, -0.024, 0.052, 0.026), (0.15, -0.024, 0.052, 0.026), (0.23, -0.014, 0.05, 0.0235)], 'GunBlack', sq=4.5)   # 하부 리시버
        g.loft([(-0.15, 0.044, 0.094, 0.0225), (0.02, 0.044, 0.1, 0.0235), (0.22, 0.044, 0.1, 0.0235), (0.27, 0.046, 0.094, 0.022)], 'GunDark', sq=4.5)       # 상부 리시버
        rail(g, -0.13, 0.27, 0.1, 0.0105)
        g.loft([(0.23, -0.012, 0.092, 0.029), (0.5, -0.014, 0.094, 0.029), (0.6, -0.004, 0.086, 0.025)], 'GunTan', sq=4.2)      # 핸드가드(FDE)
        rail(g, 0.27, 0.58, 0.0975, 0.0105, step=0.02)
        vents(g, 0.28, 0.55, 0.042, 0.029, 6, h=0.04)
        g.box((0.42, 0, -0.016), (0.3, 0.02, 0.01), 'GunDark')                  # 아래 레일
        g.box((0.6, 0, 0.06), (0.04, 0.03, 0.04), 'GunSteel')                   # 가스블록
        g.box((0.6, 0, 0.095), (0.012, 0.008, 0.04), 'GunSteel')                # 앞 가늠쇠
        g.cyl((0.73, 0, 0.046), 0.0125, 0.25, 'GunSteel', axis='x', seg=8)       # 총열
        g.cyl((0.84, 0, 0.046), 0.0155, 0.03, 'GunDark', axis='x', seg=8)        # 나사 보호대(총구 장치 자리)
        g.box((0.11, 0, -0.035), (0.075, 0.04, 0.04), 'GunBlack')               # 탄창 입구
        g.box((0.15, 0.0265, 0.034), (0.07, 0.006, 0.026), 'GunRubber')         # 배출구
        g.box((-0.1, 0, 0.114), (0.03, 0.022, 0.022), 'GunSteel')               # 뒤 가늠자
        g.box((-0.125, 0, 0.108), (0.03, 0.03, 0.012), 'GunDark')               # 장전 손잡이
        g.box((0.04, -0.0245, 0.03), (0.02, 0.006, 0.014), 'GunSteel')          # 선택기
        pgrip(g, 0.0, -0.01, 0.135, w=0.044, lean=0.036)
        trigger_guard(g, 0.038, 0.1, -0.018, drop=0.042)
        g.cyl((-0.17, 0, 0.034), 0.02, 0.07, 'GunBlack', axis='x', seg=8)       # 완충관
    elif kind == 'shotgun':
        g.loft([(-0.07, -0.022, 0.088, 0.026), (0.04, -0.028, 0.092, 0.029), (0.2, -0.026, 0.09, 0.029), (0.24, -0.018, 0.085, 0.026)], 'GunDark', sq=4)   # 리시버
        g.box((0.1, 0.0295, 0.05), (0.07, 0.006, 0.028), 'GunRubber')           # 배출구
        g.cyl((0.56, 0, 0.056), 0.0185, 0.64, 'GunSteel', axis='x', seg=10)     # 총열
        g.box((0.56, 0, 0.078), (0.62, 0.012, 0.008), 'GunBlack')              # 벤트 리브
        g.cyl((0.46, 0, 0.012), 0.0165, 0.46, 'GunDark', axis='x', seg=10)      # 탄창 튜브
        g.cyl((0.7, 0, 0.012), 0.021, 0.025, 'GunBlack', axis='x', seg=10)      # 튜브 마개
        g.loft([(0.3, -0.03, 0.034, 0.028), (0.4, -0.036, 0.04, 0.031), (0.54, -0.036, 0.038, 0.031), (0.56, -0.03, 0.03, 0.026)], 'GunWood', sq=3.6)       # 펌프 손잡이
        for i in range(6):
            g.box((0.33 + i * 0.037, 0, 0.0), (0.008, 0.068, 0.082), 'GunWoodD')
        g.box((0.85, 0, 0.076), (0.01, 0.01, 0.018), 'GunBrass')                # 가늠쇠
        g.box((0.14, 0, 0.1), (0.07, 0.014, 0.01), 'GunSteel')                  # 가늠자
        g.box((0.0, 0, -0.07), (0.045, 0.034, 0.12), 'GunWood', taper=(0.9, 0.95), off=(0.03, 0))   # 손잡이
        trigger_guard(g, 0.03, 0.1, -0.02, drop=0.04)
        g.cyl((-0.08, 0, 0.034), 0.022, 0.03, 'GunBlack', axis='x', seg=8)
    elif kind == 'sniper':
        g.loft([(-0.1, -0.052, 0.034, 0.026), (0.1, -0.056, 0.036, 0.028), (0.4, -0.05, 0.03, 0.026), (0.62, -0.02, 0.018, 0.02)], 'GunWood', sq=3.4)          # 목재 총상(손잡이~전방)
        g.box((0.1, 0, -0.06), (0.05, 0.034, 0.05), 'GunWood', taper=(0.9, 0.95), off=(0.03, 0))
        g.loft([(-0.0, 0.032, 0.088, 0.0225), (0.1, 0.032, 0.092, 0.024), (0.26, 0.032, 0.09, 0.024), (0.31, 0.034, 0.082, 0.021)], 'GunSteel', sq=3.5)       # 리시버
        g.box((0.14, 0.024, 0.07), (0.1, 0.004, 0.03), 'GunDark')              # 탄 배출구
        g.limb((-0.01, 0.014, 0.075), (-0.045, 0.085, 0.045), 0.014, 'GunSteel')   # 노리쇠 손잡이
        g.sphere((-0.048, 0.092, 0.042), 0.017, 'GunBlack', seg=8, rings=5)
        g.box((-0.02, 0, 0.082), (0.06, 0.016, 0.014), 'GunSteel')              # 노리쇠 뒤
        g.cyl((0.7, 0, 0.052), 0.0135, 0.78, 'GunSteel', axis='x', seg=10)      # 총열
        g.cyl((1.06, 0, 0.052), 0.02, 0.06, 'GunDark', axis='x', seg=10)        # 총구 덮개
        g.box((1.05, 0, 0.078), (0.014, 0.008, 0.024), 'GunSteel')              # 앞 가늠쇠
        g.box((0.26, 0, 0.1), (0.03, 0.024, 0.018), 'GunSteel')                 # 가늠자
        g.box((0.28, 0, 0.012), (0.012, 0.075, 0.014), 'GunBlack')              # 총상 밴드
        g.box((0.5, 0, 0.012), (0.012, 0.062, 0.014), 'GunBlack')
        trigger_guard(g, 0.04, 0.12, 0.002, drop=0.045)
        g.box((0.14, 0, 0.014), (0.07, 0.04, 0.026), 'GunDark')                 # 탄창 바닥
    return g


# ------------------------------------------------------------------ 교체 부품
def mag_part(weapon: str, kind: str) -> B:
    """kind: std | ext | quick | extquick. 원점=탄창 입구 윗면, 아래(-Z)로 뻗습니다."""
    g = B()
    ext = kind in ('ext', 'extquick')
    quick = kind in ('quick', 'extquick')
    body, band = ('GunBlack', 'GunTan' if quick else 'GunDark')
    if weapon == 'pistol':
        h = 0.13 if ext else 0.1
        g.box((0.0, 0, -h / 2), (0.036, 0.028, h), body, taper=(1.0, 1.0))
        g.box((0.0, 0, -h - 0.006), (0.05, 0.034, 0.012), band)
        if ext:
            g.box((0.0, 0, -h * 0.3), (0.04, 0.03, 0.01), 'GunSteel')
    elif weapon == 'smg':
        h = 0.2 if ext else 0.15
        g.box((0.0, 0, -h / 2), (0.05, 0.034, h), body, taper=(0.95, 1.0), off=(-0.012 if ext else -0.006, 0))
        g.box((-0.0, 0, -h - 0.005), (0.062, 0.04, 0.012), band, rot=None)
        for i in range(3):
            g.box((0.026, 0, -h * (0.25 + i * 0.22)), (0.004, 0.026, 0.012), 'GunRubber')
    elif weapon == 'rifle':
        h = 0.21 if ext else 0.15
        c = lambda f: 0.012 * f * f * (1.4 if ext else 1.0) * (0.15 / h) * 1.0
        zs = [0.0, -h * 0.25, -h * 0.5, -h * 0.75, -h]
        g.stack([(z, c(-z / h) * 1.5 + 0.0, 0.0, 0.025, 0.017) for z in zs], body, n=10, sq=5.0)
        g.box((c(1.0) * 1.5, 0, -h - 0.007), (0.064, 0.04, 0.016), band)
        g.box((0.0, 0.0175, -h * 0.3), (0.03, 0.004, 0.012), 'GunRubber')
        if quick:
            g.box((0.0, 0, -0.03), (0.056, 0.038, 0.012), 'GunTan')
    elif weapon == 'shotgun':
        # 튜브 연장: 총열 아래 탄창 튜브 끝에 이음. 원점=튜브 앞끝, +X 로 뻗습니다.
        l_ = 0.17 if ext else 0.0
        if ext:
            g.cyl((l_ / 2, 0, 0.0), 0.0175, l_, 'GunDark', axis='x', seg=10)
            g.cyl((l_ + 0.01, 0, 0.0), 0.022, 0.02, 'GunTan' if quick else 'GunBlack', axis='x', seg=10)
        if quick:
            g.box((0.02, 0, -0.02), (0.05, 0.03, 0.012), 'GunTan')
        if not ext and not quick:
            g.cyl((0.01, 0, 0.0), 0.0215, 0.02, 'GunBlack', axis='x', seg=10)
    else:   # sniper: 상자형 내장 탄창
        h = 0.06 if ext else 0.035
        g.box((0.0, 0, -h / 2), (0.07, 0.036, h), 'GunDark')
        g.box((0.0, 0, -h - 0.005), (0.078, 0.04, 0.012), band)
    return g


def stock_part(weapon: str, kind: str) -> B:
    """원점=장착점, 뒤(-X)로 뻗습니다. kind: std | tactical | cheek"""
    g = B()
    if weapon == 'rifle':
        if kind == 'tactical':   # 조절식 전술 개머리판
            g.box((-0.1, 0, 0.0), (0.2, 0.04, 0.07), 'GunDark', taper=(1.0, 0.9))
            g.loft([(-0.1, -0.05, 0.04, 0.02), (-0.2, -0.06, 0.055, 0.022), (-0.3, -0.075, 0.07, 0.022), (-0.31, -0.08, 0.075, 0.02)], 'GunBlack', sq=3.4)
            g.box((-0.318, 0, -0.006), (0.016, 0.05, 0.16), 'GunRubber')
            g.box((-0.17, 0, 0.078), (0.14, 0.03, 0.02), 'GunBlack')   # 볼받침 올림
        else:
            g.loft([(-0.0, -0.012, 0.046, 0.019), (-0.1, -0.03, 0.05, 0.022), (-0.22, -0.05, 0.04, 0.024), (-0.255, -0.075, 0.034, 0.024)], 'GunDark', sq=3.4)
            g.box((-0.262, 0, -0.018), (0.016, 0.05, 0.12), 'GunRubber')
    elif weapon == 'smg':
        if kind == 'tactical':
            g.loft([(0.0, 0.0, 0.07, 0.02), (-0.1, -0.02, 0.07, 0.022), (-0.2, -0.045, 0.06, 0.023)], 'GunBlack', sq=3.4)
            g.box((-0.205, 0, 0.0), (0.016, 0.05, 0.11), 'GunRubber')
        else:    # 접이식 와이어 개머리판
            g.limb((0.0, 0.014, 0.04), (-0.16, 0.014, 0.016), 0.012, 'GunBlack', round_end=False)
            g.limb((0.0, -0.014, 0.04), (-0.16, -0.014, 0.016), 0.012, 'GunBlack', round_end=False)
            g.box((-0.165, 0, 0.013), (0.015, 0.05, 0.09), 'GunDark')
    elif weapon == 'shotgun':
        g.loft([(0.0, -0.008, 0.07, 0.02), (-0.12, -0.04, 0.066, 0.024), (-0.26, -0.072, 0.056, 0.026), (-0.33, -0.092, 0.05, 0.026)], 'GunWood', sq=3.4)
        g.box((-0.338, 0, -0.022), (0.018, 0.056, 0.14), 'GunRubber')
    else:   # sniper
        if kind == 'cheek':
            g.loft([(0.0, -0.05, 0.05, 0.02), (-0.12, -0.065, 0.07, 0.024), (-0.28, -0.088, 0.065, 0.026), (-0.4, -0.115, 0.045, 0.026)], 'GunWood', sq=3.2)
            g.box((-0.16, 0, 0.076), (0.2, 0.034, 0.024), 'GunBlack')   # 볼받침
            g.box((-0.41, 0, -0.035), (0.018, 0.06, 0.15), 'GunRubber')
        else:
            g.loft([(0.0, -0.05, 0.05, 0.02), (-0.12, -0.066, 0.05, 0.024), (-0.28, -0.1, 0.04, 0.026), (-0.4, -0.125, 0.03, 0.026)], 'GunWood', sq=3.2)
            g.box((-0.41, 0, -0.045), (0.018, 0.058, 0.15), 'GunRubber')
    return g


def sight_part(kind: str) -> B:
    """원점=레일 윗면 가운데. reddot | holo | scope2 | scope4 | scope8"""
    g = B()
    if kind == 'reddot':
        g.box((0.0, 0, 0.006), (0.075, 0.034, 0.012), 'GunBlack')
        g.box((0.0, 0.0145, 0.04), (0.065, 0.006, 0.055), 'GunBlack')
        g.box((0.0, -0.0145, 0.04), (0.065, 0.006, 0.055), 'GunBlack')
        g.box((0.0, 0, 0.07), (0.065, 0.035, 0.008), 'GunBlack')
        g.box((0.03, 0, 0.042), (0.004, 0.026, 0.044), 'GunLens')
        g.box((-0.02, 0, 0.044), (0.008, 0.008, 0.008), 'GlowDot')
    elif kind == 'holo':
        g.box((0.0, 0, 0.006), (0.1, 0.036, 0.012), 'GunBlack')
        g.box((0.0, 0.0165, 0.045), (0.1, 0.006, 0.066), 'GunDark')
        g.box((0.0, -0.0165, 0.045), (0.1, 0.006, 0.066), 'GunDark')
        g.box((0.0, 0, 0.082), (0.1, 0.039, 0.01), 'GunDark')
        g.box((0.052, 0, 0.045), (0.004, 0.03, 0.058), 'GunLens')
        g.box((-0.054, 0, 0.045), (0.004, 0.03, 0.058), 'GunLens')
        g.box((0.0, 0, 0.05), (0.01, 0.006, 0.01), 'GlowDot')
    elif kind == 'scope2':
        for x in (-0.05, 0.05):
            g.box((x, 0, 0.012), (0.022, 0.03, 0.024), 'GunBlack')
        g.cyl((0.0, 0, 0.044), 0.025, 0.2, 'GunBlack', axis='x', seg=12)
        g.cyl((0.105, 0, 0.044), 0.034, 0.04, 'GunDark', axis='x', seg=12)
        g.cyl((-0.1, 0, 0.044), 0.03, 0.04, 'GunDark', axis='x', seg=12)
        g.cyl((0.126, 0, 0.044), 0.028, 0.004, 'GunLens', axis='x', seg=12)
        g.cyl((0.0, 0, 0.074), 0.008, 0.02, 'GunDark', axis='y', seg=6)
    elif kind == 'scope4':
        for x in (-0.07, 0.06):
            g.box((x, 0, 0.014), (0.026, 0.034, 0.028), 'GunBlack')
        g.cyl((0.0, 0, 0.05), 0.028, 0.3, 'GunBlack', axis='x', seg=12)
        g.cyl((0.16, 0, 0.05), 0.04, 0.07, 'GunDark', axis='x', seg=12, r2=0.046)
        g.cyl((-0.15, 0, 0.05), 0.034, 0.05, 'GunDark', axis='x', seg=12)
        g.cyl((0.196, 0, 0.05), 0.04, 0.004, 'GunLens', axis='x', seg=12)
        g.cyl((-0.176, 0, 0.05), 0.02, 0.004, 'GunLens', axis='x', seg=12)
        g.cyl((0.0, 0, 0.088), 0.011, 0.024, 'GunDark', axis='y', seg=8)
        g.cyl((0.0, 0.026, 0.05), 0.011, 0.024, 'GunDark', axis='y', seg=8)
    else:   # scope8
        for x in (-0.08, 0.08):
            g.box((x, 0, 0.016), (0.03, 0.036, 0.032), 'GunBlack')
        g.cyl((0.0, 0, 0.054), 0.03, 0.4, 'GunBlack', axis='x', seg=14)
        g.cyl((0.22, 0, 0.054), 0.042, 0.1, 'GunDark', axis='x', seg=14, r2=0.052)
        g.cyl((-0.2, 0, 0.054), 0.037, 0.06, 'GunDark', axis='x', seg=14)
        g.cyl((0.272, 0, 0.054), 0.046, 0.004, 'GunLens', axis='x', seg=14)
        g.cyl((-0.232, 0, 0.054), 0.022, 0.004, 'GunLens', axis='x', seg=14)
        g.cyl((0.0, 0, 0.094), 0.012, 0.026, 'GunDark', axis='y', seg=8)
        g.cyl((0.0, 0.03, 0.054), 0.012, 0.026, 'GunDark', axis='y', seg=8)
        g.box((0.18, 0, 0.098), (0.06, 0.012, 0.012), 'GunTan')   # 햇빛 가리개 띠
    return g


def muzzle_part(kind: str) -> B:
    """원점=총구 끝(+X 로 뻗음). suppressor | comp | flash"""
    g = B()
    if kind == 'suppressor':
        g.cyl((0.12, 0, 0.0), 0.0285, 0.26, 'GunDark', axis='x', seg=12)
        for i in range(3):
            g.cyl((0.05 + i * 0.07, 0, 0.0), 0.031, 0.012, 'GunBlack', axis='x', seg=12)
        g.cyl((0.255, 0, 0.0), 0.022, 0.012, 'GunBlack', axis='x', seg=12)
        g.cyl((0.0, 0, 0.0), 0.024, 0.03, 'GunSteel', axis='x', seg=12)
    elif kind == 'comp':
        g.cyl((0.04, 0, 0.0), 0.0245, 0.09, 'GunBlack', axis='x', seg=10)
        for i in range(3):
            g.box((0.02 + i * 0.022, 0, 0.0), (0.008, 0.052, 0.052), 'GunDark')
            g.box((0.02 + i * 0.022, 0, 0.0262), (0.012, 0.016, 0.006), 'GunRubber')
        g.cyl((0.088, 0, 0.0), 0.0265, 0.012, 'GunSteel', axis='x', seg=10)
    else:   # flash hider
        g.cyl((0.04, 0, 0.0), 0.0215, 0.08, 'GunBlack', axis='x', seg=8)
        g.cyl((0.075, 0, 0.0), 0.0245, 0.03, 'GunDark', axis='x', seg=8)
        for k in range(4):
            a = k * math.pi / 2 + math.pi / 4
            g.box((0.075, math.cos(a) * 0.024, math.sin(a) * 0.024), (0.03, 0.006, 0.006), 'GunRubber', rot=None)
    return g


def grip_part(kind: str) -> B:
    """원점=레일 아랫면 가운데, 아래(-Z)로. vertical | angled"""
    g = B()
    g.box((0.0, 0, -0.008), (0.05, 0.03, 0.016), 'GunDark')
    if kind == 'vertical':
        g.box((0.0, 0, -0.07), (0.032, 0.032, 0.11), 'GunBlack', taper=(0.9, 0.9))
        for i in range(4):
            g.box((0.0, 0, -0.04 - i * 0.022), (0.036, 0.036, 0.007), 'GunRubber')
        g.box((0.0, 0, -0.13), (0.04, 0.04, 0.012), 'GunDark')
    else:
        g.box((0.03, 0, -0.04), (0.075, 0.03, 0.05), 'GunTan', taper=(0.7, 0.9), off=(0.03, 0))
        g.box((0.055, 0, -0.07), (0.07, 0.03, 0.03), 'GunTan', taper=(1.0, 0.9))
        g.box((0.065, 0, -0.08), (0.075, 0.034, 0.008), 'GunDark')
    return g


SIGHTS = ('reddot', 'holo', 'scope2', 'scope4', 'scope8')
MUZZLES = ('suppressor', 'comp', 'flash')
GRIPS = ('vertical', 'angled')
MAG_KINDS = ('std', 'ext', 'quick', 'extquick')
STOCK_FOR = {'smg': ('std', 'tactical'), 'rifle': ('std', 'tactical'), 'shotgun': ('std',), 'sniper': ('std', 'cheek')}


def attach(g: B, kind: str, mag: str | None = 'std', stock: str | None = 'std') -> B:
    """맨 총 g 에 기본 탄창과 개머리판을 얹어 완성품으로 만듭니다."""
    m = MOUNTS[kind]
    if mag and kind != 'shotgun':
        g.merge(mag_part(kind, mag), at=(m['mag'][0], 0, m['mag'][1]))
    elif mag and kind == 'shotgun':
        g.merge(mag_part(kind, mag), at=(m['mag'][0] + 0.08, 0, m['mag'][1] + 0.012))
    if stock and m['stock']:
        g.merge(stock_part(kind, stock), at=(m['stock'][0], 0, m['stock'][1]))
    return g


def gun(kind: str) -> B:
    """기본 탄창·개머리판까지 붙은 완성품."""
    return attach(nude(kind), kind)


def arms(kind: str) -> B:
    """1인칭 팔 두 개. 오른손은 손잡이(원점), 왼손은 앞쪽."""
    v = B()
    v.limb((-0.55, -0.2, -0.35), (-0.04, -0.02, -0.04), 0.11, 'Olive')
    v.cyl((-0.035, -0.015, -0.035), 0.062, 0.05, 'GunBlack', axis='z', seg=6)
    v.sphere((-0.0, -0.01, -0.02), 0.06, 'Skin', seg=6, rings=4)
    fx, fy, fz = ARMS[kind]
    v.limb((-0.4, 0.28, -0.4), (fx, fy, fz), 0.1, 'Olive')
    v.sphere((fx, fy, fz), 0.058, 'Skin', seg=6, rings=4)
    return v


def mounts_json() -> str:
    out = {k: {s: (list(v) if v else None) for s, v in m.items()} for k, m in MOUNTS.items()}
    return json.dumps(out, indent=1)
