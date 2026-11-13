import sys
import bpy  # noqa: F401  (bpy 먼저)
import facades
facades.build_facades(sys.argv[1])
