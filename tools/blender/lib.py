"""WALDO 로우폴리 모델링 라이브러리 (Blender / bpy).

좌표계: Blender Z-up, 모델은 +X를 향합니다. glTF 내보내기에서 Y-up(+X 전방)으로 바뀝니다.
모든 면은 각자 꼭짓점을 가지므로 플랫 셰이딩의 로우폴리 외형이 됩니다.
머티리얼 이름 규칙(게임 코드가 읽습니다):
  Team  - 세력 색으로 칠해지는 부분      Skin  - 피부(인스턴스 색상으로 변주)
  Paint - 차량 도장색                    Glow  - 조명/발광(음영 없음)
  그 외 - 고정 색
"""
import math
import bpy
from mathutils import Matrix, Vector

_MATS: dict[str, bpy.types.Material] = {}


def _lin(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgba(h: str) -> tuple[float, float, float, float]:
    h = h.lstrip('#')
    return (_lin(int(h[0:2], 16) / 255), _lin(int(h[2:4], 16) / 255), _lin(int(h[4:6], 16) / 255), 1.0)


def mat(name: str, hexcol: str = '#ffffff', glow: bool = False) -> bpy.types.Material:
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = rgba(hexcol)
    p.inputs['Roughness'].default_value = 0.85
    p.inputs['Metallic'].default_value = 0.0
    if glow:
        p.inputs['Emission Color'].default_value = rgba(hexcol)
        p.inputs['Emission Strength'].default_value = 1.0
    _MATS[name] = m
    return m


def palette() -> None:
    """공용 팔레트. 이름이 곧 게임 코드의 식별자입니다."""
    for n, c in {
        'Team': '#ffffff', 'Paint': '#d9d9d9', 'Skin': '#e0b48c',
        'Black': '#1b1d22', 'Steel': '#4a505b', 'Gunmetal': '#2a2d33', 'Rubber': '#17181b', 'Wood': '#6d4c33',
        'Cloth': '#6f7a86', 'Jeans': '#3d5a80', 'Khaki': '#8b8467', 'Olive': '#4f5d3a', 'Tan': '#b39a68', 'Navy': '#1f3466',
        'White': '#f3f4f6', 'Red': '#d6343a', 'Yellow': '#f2c230', 'Orange': '#ee7d2a', 'Green': '#3f7d45', 'Leaf': '#47894e', 'Leaf2': '#2f6b3d',
        'Bark': '#5b4030', 'Concrete': '#9a9ca0', 'DarkConc': '#6b6d72', 'Glass': '#27394d', 'Crate': '#a8822e', 'Hair': '#2a211c',
        'CrystalA': '#52d9ff', 'CrystalB': '#2fa7d6', 'Brick': '#8f5a48', 'Roof': '#555a63', 'Sand': '#c9b98a', 'OliveD': '#3a4630', 'Coyote': '#8a7448', 'Webbing': '#2c3026', 'Camo': '#5d6b3f', 'Camo2': '#3f4b2c', 'Ghillie': '#586b3a', 'Ghillie2': '#6e7f46',
    }.items():
        mat(n, c)
    for n, c in {'Glow': '#fff3bd', 'GlowRed': '#ff3b3b', 'GlowBlue': '#3b6bff', 'GlowCyan': '#52d9ff', 'GlowGreen': '#6dff9c', 'GlowOrange': '#ffa83a'}.items():
        mat(n, c, glow=True)


class B:
    """한 오브젝트(노드)를 이루는 도형 누적기."""

    def __init__(self) -> None:
        self.v: list[tuple[float, float, float]] = []
        self.f: list[tuple[int, ...]] = []
        self.m: list[str] = []
        self._w: dict[tuple[int, int, int], int] = {}

    def _begin(self) -> None:
        """새 도형 시작: 같은 도형 안에서만 꼭짓점을 공유합니다(베벨/스무딩용)."""
        self._w = {}

    def _poly(self, pts: list[Vector], material: str) -> None:
        ids = []
        for p in pts:
            k = (round(p.x * 20000), round(p.y * 20000), round(p.z * 20000))
            j = self._w.get(k)
            if j is None:
                j = len(self.v)
                self.v.append((p.x, p.y, p.z))
                self._w[k] = j
            ids.append(j)
        if len(set(ids)) >= 3:
            self.f.append(tuple(dict.fromkeys(ids)))
            self.m.append(material)

    @staticmethod
    def _xf(c, rot) -> Matrix:
        r = Matrix.Identity(3) if rot is None else (rot if isinstance(rot, Matrix) else Matrix.Rotation(rot, 3, 'Z'))
        return r

    def box(self, c, s, material: str, taper=(1.0, 1.0), rot=None, off=(0.0, 0.0)) -> 'B':
        """c: 중심, s: (x,y,z) 크기, taper: 윗면 배율(x,y), off: 윗면 이동(x,y), rot: Z회전(rad) 또는 3x3 행렬."""
        self._begin()
        sx, sy, sz = s
        r = self._xf(c, rot)
        base = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        pts = []
        for z, k, o in ((-0.5, (1.0, 1.0), (0.0, 0.0)), (0.5, taper, off)):
            for bx, by in base:
                pts.append(Vector((bx * sx / 2 * k[0] + o[0], by * sy / 2 * k[1] + o[1], z * sz)))
        pts = [r @ p + Vector(c) for p in pts]
        for q in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self._poly([pts[i] for i in q], material)
        return self

    def limb(self, a, b, t: float, material: str, t2: float | None = None, seg: int = 8, round_end: bool = True) -> 'B':
        """a에서 b로 뻗는 둥근 팔다리. t: 시작 굵기, t2: 끝 굵기."""
        a, b = Vector(a), Vector(b)
        d = b - a
        ln = d.length
        if ln < 1e-5:
            return self
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix()
        t2 = t if t2 is None else t2
        self.cyl((a + b) / 2, t * 0.56, ln, material, seg=seg, r2=t2 * 0.56, rotm=rot)
        if round_end:
            self.sphere(b, t2 * 0.56, material, seg=seg, rings=4)
        return self

    def cyl(self, c, r: float, h: float, material: str, axis: str = 'z', seg: int = 8, r2: float | None = None, scale=(1.0, 1.0), rotm=None) -> 'B':
        """원기둥/원뿔대. axis: x|y|z 로 눕힙니다. r2: 윗면 반지름(0이면 원뿔)."""
        self._begin()
        r2 = r if r2 is None else r2
        rot = rotm if rotm is not None else {'z': Matrix.Identity(3), 'x': Matrix.Rotation(math.pi / 2, 3, 'Y'), 'y': Matrix.Rotation(-math.pi / 2, 3, 'X')}[axis]
        ring = lambda rad, z: [rot @ Vector((math.cos(2 * math.pi * i / seg) * rad * scale[0], math.sin(2 * math.pi * i / seg) * rad * scale[1], z)) + Vector(c) for i in range(seg)]
        lo, hi = ring(r, -h / 2), ring(r2, h / 2)
        for i in range(seg):
            j = (i + 1) % seg
            if r2 <= 1e-6:
                self._poly([lo[i], lo[j], rot @ Vector((0, 0, h / 2)) + Vector(c)], material)
            else:
                self._poly([lo[i], lo[j], hi[j], hi[i]], material)
        self._poly(lo[::-1], material)
        if r2 > 1e-6:
            self._poly(hi, material)
        return self

    def sphere(self, c, r: float, material: str, scale=(1.0, 1.0, 1.0), seg: int = 8, rings: int = 5) -> 'B':
        self._begin()
        rows = []
        for k in range(rings + 1):
            phi = math.pi * k / rings
            rows.append([Vector((math.sin(phi) * math.cos(2 * math.pi * i / seg) * r * scale[0], math.sin(phi) * math.sin(2 * math.pi * i / seg) * r * scale[1], math.cos(phi) * r * scale[2])) + Vector(c) for i in range(seg)])
        for k in range(rings):
            for i in range(seg):
                j = (i + 1) % seg
                a, b, cc, d = rows[k][i], rows[k][j], rows[k + 1][j], rows[k + 1][i]
                if k == 0:                      # 면은 바깥에서 볼 때 반시계 방향(법선이 밖을 향함)
                    self._poly([a, d, cc], material)
                elif k == rings - 1:
                    self._poly([a, d, b], material)
                else:
                    self._poly([a, d, cc, b], material)
        return self

    def loft(self, st, material: str, n: int = 14, sq: float = 3.2, cap: bool = True, mats=None) -> 'B':
        """길이(X) 방향으로 단면을 이어 붙인 둥근 몸체. st: [(x, z_bottom, z_top, half_width), ...]"""
        self._begin()
        rings = []
        for x, zb, zt, hw in st:
            zc, hh, r = (zb + zt) / 2, (zt - zb) / 2, []
            for k in range(n):
                t = 2 * math.pi * k / n
                c, sn = math.cos(t), math.sin(t)
                r.append(Vector((x, hw * math.copysign(abs(c) ** (2 / sq), c), zc + hh * math.copysign(abs(sn) ** (2 / sq), sn))))
            rings.append(r)
        for a in range(len(rings) - 1):
            for k in range(n):
                j = (k + 1) % n
                self._poly([rings[a][k], rings[a][j], rings[a + 1][j], rings[a + 1][k]], material)
        if cap:
            self._poly(rings[0][::-1], material)
            self._poly(rings[-1][:], material)
        return self

    def loftz(self, st, material: str, n: int = 14, sq: float = 2.6, cx: float = 0.0) -> 'B':
        """높이(Z) 방향 단면 몸통. st: [(z, 반깊이x, 반폭y), ...]"""
        self._begin()
        rings = []
        for z, hx, hy in st:
            r = []
            for k in range(n):
                t = 2 * math.pi * k / n
                c, sn = math.cos(t), math.sin(t)
                r.append(Vector((cx + hx * math.copysign(abs(c) ** (2 / sq), c), hy * math.copysign(abs(sn) ** (2 / sq), sn), z)))
            rings.append(r)
        for a in range(len(rings) - 1):
            for k in range(n):
                j = (k + 1) % n
                self._poly([rings[a][k], rings[a][j], rings[a + 1][j], rings[a + 1][k]], material)
        self._poly(rings[0][::-1], material)
        self._poly(rings[-1][:], material)
        return self

    def stack(self, st, material: str, n: int = 12, sq: float = 2.5, cap: bool = True) -> 'B':
        """높이(Z) 방향 단면 몸통(단면마다 중심 이동 가능). st: [(z, cx, cy, 반깊이x, 반폭y), ...]"""
        self._begin()
        rings = []
        for z, cx, cy, hx, hy in st:
            r = []
            for k in range(n):
                t = 2 * math.pi * k / n
                c, sn = math.cos(t), math.sin(t)
                r.append(Vector((cx + hx * math.copysign(abs(c) ** (2 / sq), c), cy + hy * math.copysign(abs(sn) ** (2 / sq), sn), z)))
            rings.append(r)
        for a in range(len(rings) - 1):
            for k in range(n):
                j = (k + 1) % n
                self._poly([rings[a][k], rings[a][j], rings[a + 1][j], rings[a + 1][k]], material)
        if cap:
            self._poly(rings[0][::-1], material)
            self._poly(rings[-1][:], material)
        return self

    def tube(self, path, material: str, n: int = 8, cap: bool = True) -> 'B':
        """경로를 따라가는 둥근 관(팔·끈·머리카락). path: [((x, y, z), 반지름) 또는 ((x, y, z), rx, ry), ...]"""
        self._begin()
        pts = [Vector(p[0]) for p in path]
        rad = [(p[1], p[2] if len(p) > 2 else p[1]) for p in path]
        rings, frame, prev = [], None, None
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            frame = Vector((0, 0, 1)).rotation_difference(t).to_matrix() if frame is None else prev.rotation_difference(t).to_matrix() @ frame
            prev = t
            rings.append([frame @ Vector((math.cos(2 * math.pi * k / n) * rad[i][0], math.sin(2 * math.pi * k / n) * rad[i][1], 0)) + p for k in range(n)])
        for a in range(len(rings) - 1):
            for k in range(n):
                j = (k + 1) % n
                self._poly([rings[a][k], rings[a][j], rings[a + 1][j], rings[a + 1][k]], material)
        if cap:
            self._poly(rings[0][::-1], material)
            self._poly(rings[-1][:], material)
        return self

    def cone(self, c, r: float, h: float, material: str, axis: str = 'z', seg: int = 6) -> 'B':
        return self.cyl(c, r, h, material, axis, seg, r2=0.0)

    def merge(self, other: 'B', at=(0, 0, 0), scale: float = 1.0, mirror_y: bool = False, rot: Matrix | None = None) -> 'B':
        """다른 도형 묶음을 합칩니다. rot(3x3)을 주면 원점 기준으로 돌린 뒤 at 으로 옮깁니다."""
        o = Vector(at)
        base = len(self.v)
        for x, y, z in other.v:
            p = Vector((x * scale, (-y if mirror_y else y) * scale, z * scale))
            p = (rot @ p if rot is not None else p) + o
            self.v.append((p.x, p.y, p.z))
        for f, m in zip(other.f, other.m):
            idx = tuple(i + base for i in f)
            self.f.append(idx[::-1] if mirror_y else idx)
            self.m.append(m)
        return self

    def build(self, name: str, loc=(0, 0, 0), bevel: float = 0.012, smooth_angle: float = 38.0, segments: int = 2) -> bpy.types.Object:
        me = bpy.data.meshes.new(name)
        used = list(dict.fromkeys(self.m))
        me.from_pydata(self.v, [], self.f)
        for u in used:
            me.materials.append(mat(u))
        for p, m in zip(me.polygons, self.m):
            p.material_index = used.index(m)
            p.use_smooth = True
        me.update()
        ob = bpy.data.objects.new(name, me)
        ob.location = loc
        bpy.context.scene.collection.objects.link(ob)
        if bevel > 0:
            bv = ob.modifiers.new('bevel', 'BEVEL')
            bv.width = bevel
            bv.segments = segments
            bv.limit_method = 'ANGLE'
            bv.angle_limit = math.radians(40)
            bv.harden_normals = False
        es = ob.modifiers.new('split', 'EDGE_SPLIT')
        es.split_angle = math.radians(smooth_angle)
        es.use_edge_angle = True
        es.use_edge_sharp = False
        return ob


def export(path: str, objs: list[bpy.types.Object]) -> int:
    import os
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
    return os.path.getsize(path)


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()
    palette()
