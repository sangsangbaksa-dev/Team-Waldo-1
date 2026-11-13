"""python build_all.py <출력 디렉터리> — 모든 GLB를 생성합니다. (pip install bpy)"""
import bpy  # noqa: F401
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from chars import build_characters, build_weapons  # noqa: E402
from world import build_props, build_structures, build_vehicles  # noqa: E402

out = sys.argv[1] if len(sys.argv) > 1 else 'public/assets/models'
os.makedirs(out, exist_ok=True)
for name, fn in (('characters', build_characters), ('weapons', build_weapons), ('vehicles', build_vehicles), ('structures', build_structures), ('props', build_props)):
    size = fn(os.path.join(out, f'{name}.glb'))
    print(f'{name}.glb  {size / 1024:.1f} KB')
