# Renders the VRG logo as extruded yellow plastic on a transparent background.
#   blender -b -P blender/logo3d.py -- out.png [samples]
import bpy, sys, math
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/vrg-logo-3d.png'
SAMPLES = int(argv[1]) if len(argv) > 1 else 128
import os
SVG = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'logo.svg')

bpy.ops.wm.read_factory_settings(use_empty=True)
try: bpy.ops.import_curve.svg(filepath=SVG)
except Exception: bpy.ops.wm.svg_import(filepath=SVG)
curves = [o for o in bpy.context.scene.objects if o.type == 'CURVE']
assert curves, 'no curves imported'
# Keep only the light (yellow) fills: the black outline shapes are dropped, which is
# what "no black edges" means. Fill colour comes from the importer's per-path material.
def lum(o):
    try:
        c = o.data.materials[0].diffuse_color; return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]
    except Exception: return 1.0
report = [(o.name, round(lum(o), 3), len(o.data.splines)) for o in curves]
print('IMPORTED', report)
dark = [o for o in curves if lum(o) < 0.25]
light = [o for o in curves if lum(o) >= 0.25]
if light:
    for o in dark: bpy.data.objects.remove(o, do_unlink=True)
    curves = light
for o in curves: o.select_set(True)
bpy.context.view_layer.objects.active = curves[0]
if len(curves) > 1: bpy.ops.object.join()
logo = bpy.context.view_layer.objects.active
logo.name = 'VRG'
cd = logo.data
cd.dimensions = '2D'; cd.fill_mode = 'BOTH'
cd.extrude = 0.0  # set after scaling
# Normalise size: ~4 units wide, centred at origin.
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
w = max(logo.dimensions.x, 1e-6); s = 4.0 / w
logo.scale = (s, s, s)
logo.location = (0, 0, 0)
# extrude/bevel are in local units, so divide by the object scale
cd.extrude = 0.22 / s; cd.bevel_depth = 0.06 / s; cd.bevel_resolution = 6; cd.resolution_u = 18
# Stand it up facing the camera: SVG lies in XY; keep it there and look down -Y? Simpler: rotate so it faces +Y camera.
logo.rotation_euler = (math.radians(90), 0, 0)
bpy.ops.object.shade_smooth()
# Yellow plastic
m = bpy.data.materials.new('plastic'); m.use_nodes = True
p = m.node_tree.nodes['Principled BSDF']
p.inputs['Base Color'].default_value = (1.0, 0.64, 0.0, 1)   # #ffd400 in linear
p.inputs['Roughness'].default_value = 0.27
p.inputs['Specular IOR Level'].default_value = 0.6 if 'Specular IOR Level' in p.inputs else 0.5
if 'Coat Weight' in p.inputs: p.inputs['Coat Weight'].default_value = 0.35
if 'Subsurface Weight' in p.inputs: p.inputs['Subsurface Weight'].default_value = 0.04
logo.data.materials.clear(); logo.data.materials.append(m)
# Camera: front, slight three-quarter from above-left
cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); bpy.context.scene.collection.objects.link(cam)
cam.location = (-0.8, -15.5, 1.7); cam_d.lens = 110
def look_at(obj, target):
    d = (target - obj.location); obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
from mathutils import Vector
look_at(cam, Vector((0, 0, 0))); bpy.context.scene.camera = cam
# Lights: key, fill, rim
def area(name, loc, energy, size, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.size = size; ld.color = color
    lo = bpy.data.objects.new(name, ld); bpy.context.scene.collection.objects.link(lo); lo.location = loc; look_at(lo, Vector((0, 0, 0))); return lo
area('key', (-4, -6, 5), 650, 5)
area('fill', (5, -6, 1), 320, 6, (1, 0.97, 0.9))
area('rim', (2, 5, 4), 700, 3, (0.9, 0.95, 1))
w = bpy.data.worlds.new('w'); bpy.context.scene.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.25
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.35, 0.37, 0.42, 1)
# Render
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = SAMPLES; sc.cycles.device = 'CPU'
sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.resolution_x = 1600; sc.render.resolution_y = 1000; sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('WROTE', OUT)
