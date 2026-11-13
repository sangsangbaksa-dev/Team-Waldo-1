"""건물 외벽 타일을 Blender(Cycles)로 렌더링합니다.

실제 입체(창틀·처마·돌림띠·벽돌 줄눈)를 모델링해 정면 정사영으로 구운 이음매 없는 PNG 입니다.
  public/assets/tex/facade_<스타일>.png   낮 색상(벽은 밝은 회색 → 게임에서 건물색으로 틴트)
  public/assets/tex/facade_<스타일>_e.png 켜진 창문 발광 마스크
  public/assets/tex/shop_<스타일>.png     1층 상점가 타일
셀 하나 = 가로 44 × 세로 44 단위, 타일 = 4×4 셀(512px).
"""
import math
import os
import random

import bpy
import numpy as np

import lib
from lib import B

CELL = 44.0
PX = 128           # 셀당 픽셀
N = 6              # 렌더 패치 크기(셀) — 가운데 4칸만 잘라 이음매를 없앱니다
T = 12.0           # 벽 두께


def _fmat(name: str, color: str, rough: float = 0.8, metal: float = 0.0, brick: bool = False, emit: bool = False) -> None:
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = lib.rgba(color)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if brick:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        br = nt.nodes.new('ShaderNodeTexBrick')
        br.inputs['Scale'].default_value = 0.2
        br.inputs['Mortar Size'].default_value = 0.03
        br.inputs['Brick Width'].default_value = 0.5
        br.inputs['Row Height'].default_value = 0.2
        br.inputs['Color1'].default_value = (0.95, 0.95, 0.95, 1)
        br.inputs['Color2'].default_value = (0.78, 0.78, 0.78, 1)
        br.inputs['Mortar'].default_value = (0.42, 0.42, 0.42, 1)
        nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
        nt.links.new(br.outputs['Color'], p.inputs['Base Color'])
    lib._MATS[name] = m


def _setup_mats() -> None:
    _fmat('Wall', '#e4e1da', 0.9)
    _fmat('Brick', '#f0f0f0', 0.9, brick=True)
    _fmat('Stone', '#f2efe8', 0.8)
    _fmat('Concrete2', '#c9c9c9', 0.95)
    _fmat('Frame', '#26292e', 0.5, 0.4)
    _fmat('Steel2', '#7c8794', 0.35, 0.7)
    _fmat('Bronze', '#6b5a3c', 0.4, 0.6)
    _fmat('Spandrel', '#2f3a46', 0.25, 0.5)
    _fmat('Awn', '#b83a3a', 0.9)
    _fmat('Wood2', '#7a5230', 0.7)
    _fmat('Pane', '#2c4660', 0.08, 0.9)
    _fmat('PaneB', '#3a5d7e', 0.08, 0.9)
    _fmat('PaneLit', '#2c4660', 0.08, 0.9)
    _fmat('Sign', '#d9c27a', 0.6)
    _fmat('Black2', '#15171b', 0.7)


def _world() -> None:
    w = bpy.context.scene.world or bpy.data.worlds.new('W')
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    bg = nt.nodes.new('ShaderNodeBackground')
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(tc.outputs['Generated'], sep.inputs['Vector'])
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.35, (0.30, 0.27, 0.26, 1)
    el[1].position, el[1].color = 0.85, (0.55, 0.72, 1.0, 1)
    mid = el.new(0.52)
    mid.color = (1.0, 0.78, 0.55, 1)
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.0
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])


def _scene(w_cells: float, h_px: int) -> None:
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 40
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 3
    sc.render.resolution_x = int(w_cells * PX)
    sc.render.resolution_y = h_px
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    _world()


def _camera(cx: float, cz: float, width: float) -> None:
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = width
    cam.location = (cx, -400, cz)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam


def _sun() -> bpy.types.Object:
    ld = bpy.data.lights.new('sun', 'SUN')
    ld.energy = 3.2
    ld.angle = math.radians(14)
    ld.color = (1.0, 0.92, 0.8)
    ob = bpy.data.objects.new('sun', ld)
    ob.rotation_euler = (math.radians(58), math.radians(8), math.radians(-36))   # 위·왼쪽·앞에서 비춤
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ---------------------------------------------------------------- 셀 건축 부품
def _pane(b: B, cx: float, z0: float, z1: float, x0: float, x1: float, lit: bool, rnd: random.Random, y: float = 7.0) -> None:
    """살짝 기울어진 유리판(셀마다 다른 하늘을 비추게)."""
    mat_name = 'PaneLit' if lit else ('PaneB' if rnd.random() < 0.35 else 'Pane')
    tilt = math.radians(rnd.uniform(-5, 5))
    b.box(((x0 + x1) / 2, y, (z0 + z1) / 2), (x1 - x0, 0.6, z1 - z0), mat_name, rot=None)
    # 기울이기는 별도 회전 대신 얇은 면 두 장으로 반사 변주
    _ = tilt


def _opening_wall(b: B, wall: str, cx: float, cz: float, x0: float, x1: float, z0: float, z1: float) -> None:
    x_lo, x_hi, z_lo, z_hi = cx - CELL / 2, cx + CELL / 2, cz - CELL / 2, cz + CELL / 2
    c = lambda a, bb: (a + bb) / 2
    if x0 > x_lo + 1e-3:
        b.box((c(x_lo, x0), T / 2, c(z_lo, z_hi)), (x0 - x_lo, T, z_hi - z_lo), wall)
    if x1 < x_hi - 1e-3:
        b.box((c(x1, x_hi), T / 2, c(z_lo, z_hi)), (x_hi - x1, T, z_hi - z_lo), wall)
    if z0 > z_lo + 1e-3:
        b.box((c(x0, x1), T / 2, c(z_lo, z0)), (x1 - x0, T, z0 - z_lo), wall)
    if z1 < z_hi - 1e-3:
        b.box((c(x0, x1), T / 2, c(z1, z_hi)), (x1 - x0, T, z_hi - z1), wall)


def _frame(b: B, x0: float, x1: float, z0: float, z1: float, th: float = 1.6, mat: str = 'Frame', y: float = 3.0) -> None:
    w, h = x1 - x0, z1 - z0
    b.box(((x0 + x1) / 2, y, z0 + th / 2), (w, 2.4, th), mat)
    b.box(((x0 + x1) / 2, y, z1 - th / 2), (w, 2.4, th), mat)
    b.box((x0 + th / 2, y, (z0 + z1) / 2), (th, 2.4, h), mat)
    b.box((x1 - th / 2, y, (z0 + z1) / 2), (th, 2.4, h), mat)


def style_brick(b: B, i: int, j: int, cx: float, cz: float, lit: bool, rnd: random.Random) -> None:
    ow, oh = 20.0, 27.0
    x0, x1, z0, z1 = cx - ow / 2, cx + ow / 2, cz - oh / 2 + 1, cz + oh / 2 + 1
    _opening_wall(b, 'Brick', cx, cz, x0, x1, z0, z1)
    _pane(b, cx, z0, z1, x0, x1, lit, rnd)
    _frame(b, x0, x1, z0, z1)
    b.box((cx, 2.5, (z0 + z1) / 2), (1.4, 2.0, oh), 'Frame')               # 세로 문설주
    b.box((cx, 2.5, z0 + oh * 0.62), (ow, 2.0, 1.4), 'Frame')              # 가로 문설주
    b.box((cx, -1.0, z0 - 1.6), (ow + 7, 5.0, 3.2), 'Stone')                # 창턱
    b.box((cx, -0.5, z1 + 2.2), (ow + 6, 4.0, 4.4), 'Stone')                # 상인방
    if j % 4 == 3:
        b.box((cx, -0.8, cz - CELL / 2 + 1.2), (CELL, 4.4, 2.4), 'Stone')   # 층 돌림띠
    if rnd.random() < 0.18:                                                  # 실외기
        b.box((cx + 4, -4, z0 - 6), (11, 6, 7), 'Steel2')
        b.cyl((cx + 4, -7.2, z0 - 6), 2.4, 0.8, 'Black2', axis='y', seg=12)


def style_glass(b: B, i: int, j: int, cx: float, cz: float, lit: bool, rnd: random.Random) -> None:
    x0, x1, z0, z1 = cx - CELL / 2 + 1.4, cx + CELL / 2 - 1.4, cz - CELL / 2 + 12, cz + CELL / 2 - 0.5
    _opening_wall(b, 'Spandrel', cx, cz, x0, x1, z0, z1)
    _pane(b, cx, z0, z1, x0, x1, lit, rnd, y=4.0)
    b.box((cx - CELL / 2, -1.5, cz), (2.8, 5.0, CELL), 'Steel2')           # 세로 멀리언
    b.box((cx, -1.0, cz - CELL / 2 + 0.7), (CELL, 3.8, 1.8), 'Steel2')     # 가로 멀리언
    b.box((cx, -0.4, z0 + 0.6), (CELL, 3.0, 1.2), 'Steel2')
    b.box((cx, -0.3, (z0 + z1) / 2), (1.0, 2.2, z1 - z0), 'Steel2')        # 중간 멀리언
    b.box((cx, -0.5, cz - CELL / 2 + 6.0), (CELL - 3, 1.2, 6.0), 'Concrete2')   # 스팬드럴 패널


def style_deco(b: B, i: int, j: int, cx: float, cz: float, lit: bool, rnd: random.Random) -> None:
    ow = 17.0
    x0, x1, z0, z1 = cx - ow / 2, cx + ow / 2, cz - 12.0, cz + 15.0
    _opening_wall(b, 'Stone', cx, cz, x0, x1, z0, z1)
    _pane(b, cx, z0, z1, x0, x1, lit, rnd, y=8.0)
    _frame(b, x0, x1, z0, z1, 1.4, 'Bronze')
    b.box((cx, 2.5, (z0 + z1) / 2), (1.2, 2.0, z1 - z0), 'Bronze')
    b.box((cx - CELL / 2 + 3.5, -2.5, cz), (7.0, 6.5, CELL), 'Stone', taper=(0.85, 0.9))   # 벽기둥
    b.box((cx, 0.5, cz - 17.5), (CELL - 7, 2.0, 11.0), 'Spandrel')                          # 스팬드럴
    b.box((cx, 1.0, cz - 21.5), (CELL - 7, 4.0, 2.6), 'Bronze')                             # 장식 띠
    if j % 4 == 0:
        b.box((cx, -1.8, cz + CELL / 2 - 1.5), (CELL, 5.5, 3.0), 'Stone')                   # 돌림띠


def style_industrial(b: B, i: int, j: int, cx: float, cz: float, lit: bool, rnd: random.Random) -> None:
    ow, oh = 33.0, 30.0
    x0, x1, z0, z1 = cx - ow / 2, cx + ow / 2, cz - oh / 2 + 2, cz + oh / 2 + 2
    _opening_wall(b, 'Concrete2', cx, cz, x0, x1, z0, z1)
    _pane(b, cx, z0, z1, x0, x1, lit, rnd, y=7.0)
    _frame(b, x0, x1, z0, z1, 2.0, 'Steel2')
    for k in (1, 2):
        b.box((x0 + ow * k / 3, 2.6, (z0 + z1) / 2), (1.1, 2.0, oh), 'Steel2')
    for k in (1, 2):
        b.box((cx, 2.6, z0 + oh * k / 3), (ow, 2.0, 1.1), 'Steel2')
    b.box((cx, -0.3, cz - CELL / 2 + 1.0), (CELL, 2.4, 2.0), 'Wall')                       # 패널 이음
    b.box((cx - CELL / 2, -0.3, cz), (2.0, 2.4, CELL), 'Wall')


def style_ribbon(b: B, i: int, j: int, cx: float, cz: float, lit: bool, rnd: random.Random) -> None:
    x0, x1, z0, z1 = cx - CELL / 2 - 0.1, cx + CELL / 2 + 0.1, cz - 11.0, cz + 11.0
    _opening_wall(b, 'Wall', cx, cz, x0, x1, z0, z1)
    _pane(b, cx, z0, z1, x0, x1, lit, rnd, y=6.0)
    b.box((cx, -2.5, cz - CELL / 2 + 6.0), (CELL, 6.0, 2.4), 'Stone')                      # 슬래브 앞단
    b.box((cx, -2.0, cz + CELL / 2 - 7.5), (CELL, 5.0, 2.2), 'Stone')
    b.box((cx - CELL / 2, 0.5, cz), (1.4, 3.6, 23.0), 'Frame')                              # 얇은 멀리언
    b.box((cx, 0.8, cz - 3), (CELL, 2.0, 1.0), 'Frame')
    b.box((cx, 0, cz + CELL / 2 - 3), (CELL, 3.0, 5.0), 'Wall')                             # 상부 벽체


STYLES = {'brick': style_brick, 'glass': style_glass, 'deco': style_deco, 'industrial': style_industrial, 'ribbon': style_ribbon}


def _render(path: str) -> None:
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def _clear() -> None:
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)


def _crop(path: str, x0: int, y0: int, w: int, h: int) -> None:
    img = bpy.data.images.load(path)
    W, H = img.size
    a = np.empty(W * H * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(H, W, 4)[y0:y0 + h, x0:x0 + w]
    out = bpy.data.images.new('c', w, h)
    out.pixels.foreach_set(a.ravel())
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(img)
    bpy.data.images.remove(out)


def _set_mode(mode: str) -> None:
    """albedo: 일반 / emit: 켜진 창문만 발광."""
    for name in ('Pane', 'PaneB', 'PaneLit'):
        p = bpy.data.materials[name].node_tree.nodes['Principled BSDF']
        if mode == 'emit':
            p.inputs['Base Color'].default_value = (0, 0, 0, 1)
            p.inputs['Metallic'].default_value = 0
            p.inputs['Emission Color'].default_value = (1.0, 0.82, 0.45, 1) if name == 'PaneLit' else (0, 0, 0, 1)
            p.inputs['Emission Strength'].default_value = 1.0 if name == 'PaneLit' else 0.0
        else:
            p.inputs['Base Color'].default_value = lib.rgba('#3a3326' if name == 'PaneLit' else '#2c4660')
            p.inputs['Metallic'].default_value = 0.9
            p.inputs['Emission Strength'].default_value = 0.0


def build_facades(outdir: str) -> None:
    os.makedirs(outdir, exist_ok=True)
    for sname, fn in STYLES.items():
        bpy.ops.wm.read_factory_settings(use_empty=True)
        lib._MATS.clear()
        _setup_mats()
        _scene(N, N * PX)
        _camera(0, 0, N * CELL)
        sun = _sun()
        b = B()
        rnd = random.Random(sname)
        for j in range(N):
            for i in range(N):
                cx, cz = (i - (N - 1) / 2) * CELL, (j - (N - 1) / 2) * CELL
                fn(b, i, j, cx, cz, rnd.random() < 0.22, rnd)
        b.build('facade', bevel=0.5, smooth_angle=30)
        p = os.path.join(outdir, f'facade_{sname}.png')
        _set_mode('albedo')
        _render(p)
        _crop(p, PX, PX, 4 * PX, 4 * PX)
        pe = os.path.join(outdir, f'facade_{sname}_e.png')
        _set_mode('emit')
        sun.data.energy = 0
        bpy.context.scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
        _render(pe)
        _crop(pe, PX, PX, 4 * PX, 4 * PX)
        print('facade', sname, os.path.getsize(p), os.path.getsize(pe))
