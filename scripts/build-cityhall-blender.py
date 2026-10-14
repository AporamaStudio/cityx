"""市政厅品质样板：Blender米制建模、PBR纹理、可编辑源文件与GLB导出。

运行：Blender --background --factory-startup --python scripts/build-cityhall-blender.py
追加 -- --render 可输出白天与夜间图；不读取或修改游戏地图。
"""
from pathlib import Path
import argparse
import json
import math
import random
import sys
import time

import bpy
import bmesh
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/model-preview/cityhall-quality'
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'textures').mkdir(exist_ok=True)
(OUT / 'renders').mkdir(exist_ok=True)
args = argparse.ArgumentParser()
args.add_argument('--render', action='store_true')
args.add_argument('--samples', type=int, default=96)
args.add_argument('--size', type=int, default=1440)
options = args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
started = time.monotonic()
random.seed(24)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
bpy.context.preferences.filepaths.save_version = 0
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
source = bpy.data.collections.new('市政厅_米制源模型')
scene.collection.children.link(source)
root = bpy.data.objects.new('CityHall_120x140m', None)
source.objects.link(root)
root['units'] = 'meters'
root['footprintMeters'] = [120, 140]
root['visualOnly'] = True
root['qualitySample'] = True
materials = {}
lights = []


def rgb(value):
    c = [int(value[i:i+2], 16)/255 for i in (1, 3, 5)]
    return tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in c)


def texture(name, color, kind):
    # 原创无缝纹理与切线法线；UV按实际米数铺贴，材质可直接随GLB进入网页。
    size = 512
    rng = np.random.default_rng(47 + len(materials))
    y, x = np.mgrid[0:size, 0:size]
    noise = rng.normal(0, .012, (size, size))
    height = np.zeros((size, size), dtype=np.float32)
    if kind == 'paving':
        grout = (x % 64 < 2) | (y % 64 < 2)
        noise += ((x//64*13 + y//64*7) % 5 - 2)*.006
        noise[grout] -= .10
        height[grout] = -.025
    elif kind == 'brick':
        grout = (y % 32 < 2) | ((x + (y//32 % 2)*32) % 64 < 2)
        noise[grout] -= .09
        height[grout] = -.02
    elif kind == 'grass':
        noise += .018*np.sin(x*.12)*np.cos(y*.16)
    elif kind == 'concrete':
        noise *= .40
        noise += .003*np.sin(x*.035)*np.cos(y*.035)
    height += noise*.015
    base = np.clip(np.array(rgb(color))[None, None, :] + noise[:, :, None], 0, 1)
    rgba = np.ones((size, size, 4), dtype=np.float32)
    rgba[:, :, :3] = base
    image = bpy.data.images.new(name+'_albedo', width=size, height=size)
    image.colorspace_settings.name = 'Linear Rec.709'
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = str(OUT/'textures'/(name+'-albedo.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    nx = -(np.roll(height, -1, axis=1)-np.roll(height, 1, axis=1))*9
    ny = -(np.roll(height, -1, axis=0)-np.roll(height, 1, axis=0))*9
    length = np.sqrt(nx*nx+ny*ny+1)
    rgba[:, :, 0] = nx/length*.5+.5
    rgba[:, :, 1] = ny/length*.5+.5
    rgba[:, :, 2] = 1/length*.5+.5
    normal = bpy.data.images.new(name+'_normal', width=size, height=size)
    normal.colorspace_settings.name = 'Non-Color'
    normal.pixels.foreach_set(rgba.ravel())
    normal.filepath_raw = str(OUT/'textures'/(name+'-normal.png'))
    normal.file_format = 'PNG'
    normal.save()
    normal.pack()
    return image, normal


def material(name, color, roughness=.7, metal=0, pattern=None, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*rgb(color), 1)
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb(color), 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metal
    if emission:
        shader.inputs['Emission Color'].default_value = (*rgb(color), 1)
        shader.inputs['Emission Strength'].default_value = emission
    if pattern:
        albedo, normal = texture(name, color, pattern)
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = albedo
        mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = normal
        bump = mat.node_tree.nodes.new('ShaderNodeNormalMap')
        bump.inputs['Strength'].default_value = .45
        mat.node_tree.links.new(tex.outputs['Color'], bump.inputs['Color'])
        mat.node_tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    materials[name] = mat
    return mat


stone = material('limestone', '#d9d3c4', .73, pattern='concrete')
trim = material('warm_cream_trim', '#e5dfce', .65)
brick = material('stone_courses', '#b5aa97', .85, pattern='brick')
paving = material('plaza_paving', '#bcbdae', .85, pattern='paving')
asphalt = material('asphalt', '#59645f', .92, pattern='concrete')
grass = material('grass', '#8c9d70', .95, pattern='grass')
roof = material('sage_metal_roof', '#7d8d7b', .48, .25)
roof_seam = material('standing_seam', '#697c6b', .52, .2)
frame_mat = material('window_frames', '#758174', .55, .25)
glass = material('cityhall_glass_dark', '#516c73', .16, .35)
litglass = material('cityhall_glass_lit', '#60787a', .18, .25)
litglass['nightEmission'] = True
dark = material('recess_shadow', '#303c37', .8)
steel = material('street_metal', '#4e6056', .42, .6)
wood = material('bench_wood', '#977755', .63)
gravel = material('planter_gravel', '#9f9983', .95)
leaf = [material('leaf_'+str(i), c, .9) for i, c in enumerate(['#829866','#697f58','#9aaa71','#5b7654'])]
bark = material('bark', '#786a50', .95)
water = material('fountain_water', '#7c9da0', .1, .25)
lamp = material('cityhall_lamp', '#ffe0a3', .45, emission=.0)
sign_mat = material('civic_lettering', '#7c8675', .45, .3)
tire = material('rubber', '#303b37', .9)
chrome = material('wheel_and_hardware', '#a8b1a6', .35, .7)
paint = [material('car_paint_'+str(i), c, .3, .3) for i, c in enumerate(['#627e81','#c7c6b1','#617561','#8e6d60'])]


def own(obj):
    for coll in list(obj.users_collection):
        coll.objects.unlink(obj)
    source.objects.link(obj)
    obj.parent = root
    return obj


def box(name, center, size, mat, bevel=.025, turn=0):
    coords=[tuple(sign[i]*size[i]/2 for i in range(3)) for sign in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(coords,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    mesh.update()
    obj=own(bpy.data.objects.new(name,mesh))
    obj.location=center
    obj.data.materials.append(mat)
    uv = obj.data.uv_layers.new(name="米制UV")
    # 六个面按局部实际长度展开；不同长宽的立面不会拉伸砖纹或铺装。
    for poly in obj.data.polygons:
        normal = poly.normal
        axes = (0, 1) if abs(normal.z) > .5 else (0, 2) if abs(normal.y) > .5 else (1, 2)
        for loop in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[loop].vertex_index].co
            uv.data[loop].uv = (co[axes[0]]/8, co[axes[1]]/8)
    obj.rotation_euler.z = turn
    if bevel:
        modifier = obj.modifiers.new('小倒角_保留硬朗轮廓', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = 'ANGLE'
        modifier.harden_normals = True
        for poly in obj.data.polygons:
            poly.use_smooth = True
        normal = obj.modifiers.new('面积加权法线', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
        normal.weight = 40
    return obj


def cylinder(name, center, radius, height, mat, vertices=16):
    coords=[(radius*math.cos(i*math.tau/vertices),radius*math.sin(i*math.tau/vertices),z) for z in (-height/2,height/2) for i in range(vertices)]
    faces=[(i,(i+1)%vertices,(i+1)%vertices+vertices,i+vertices) for i in range(vertices)]
    faces.extend([tuple(reversed(range(vertices))),tuple(range(vertices,vertices*2))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(coords,[],faces);mesh.update()
    obj=own(bpy.data.objects.new(name,mesh));obj.location=center
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = len(poly.vertices) == 4
    return obj


def beam(name, a, b, radius, mat):
    direction = Vector(b)-Vector(a)
    obj = cylinder(name, (Vector(a)+Vector(b))/2, radius, direction.length, mat, 8)
    obj.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    return obj


def hip_roof(cx, cy, width, depth, z, rise):
    # 梯形坡面与短屋脊，避免把每幢楼顶做成相同的锥体。
    if width < depth:
        # 长矩形屋顶的短脊沿长边；转换后仍保持四坡面和米制接缝。
        before=set(source.objects)
        hip_roof(0,0,depth,width,z,rise)
        for obj in set(source.objects)-before:
            px,py=obj.location.x,obj.location.y
            obj.location.x=cx-py;obj.location.y=cy+px
            obj.rotation_euler.z+=math.pi/2
        return
    half = max(0, (width-depth)/2)
    verts = [(-width/2, -depth/2, 0), (width/2, -depth/2, 0), (width/2, depth/2, 0), (-width/2, depth/2, 0), (-half, 0, rise), (half, 0, rise)]
    mesh = bpy.data.meshes.new('四坡屋顶')
    mesh.from_pydata(verts, [], [(0, 1, 5, 4), (1, 2, 5), (2, 3, 4, 5), (3, 0, 4)])
    mesh.update()
    obj = bpy.data.objects.new('四坡金属屋顶', mesh)
    own(obj)
    obj.location = (cx, cy, z)
    mesh.materials.append(roof)
    solid = obj.modifiers.new('屋面厚度', 'SOLIDIFY')
    solid.thickness = .16
    # 屋面接缝沿坡延伸；不是把细节烘成离线图片。
    for side in (-1, 1):
        for x in np.arange(-width/2+.7, width/2-.3, 1.05):
            crest = max(-half, min(half, x))
            beam('屋面立缝', (cx+x, cy+side*depth/2, z+.03), (cx+crest, cy, z+rise+.03), .027, roof_seam)
    beam('屋脊盖板', (cx-half, cy, z+rise+.09), (cx+half, cy, z+rise+.09), .13, roof_seam)


def window(x, y, bottom, width=2.1, height=2.65, turn=0, powered=True):
    # 真实凹入：玻璃后置，窗框、窗台和上口各自有厚度。
    def part(name, dx, dy, dz, w, d, h, mat, bevel=.018):
        px = x + dx*math.cos(turn)-dy*math.sin(turn)
        py = y + dx*math.sin(turn)+dy*math.cos(turn)
        return box(name, (px, py, bottom+dz), (w, d, h), mat, bevel, turn)
    part('窗内暗层', 0, .26, height/2, width+.18, .08, height+.2, dark)
    part('玻璃', 0, .18, height/2, width, .06, height, litglass if powered else glass, 0)
    for dx in (-width/2-.07, width/2+.07):
        part('窗套竖框', dx, .02, height/2, .16, .27, height+.30, trim)
    for dz in (-.07, height+.07):
        part('窗套横框', 0, .02, dz, width+.30, .27, .16, trim)
    part('窗台滴水', 0, -.16, -.19, width+.48, .56, .15, stone)
    part('玻璃中挺', 0, .12, height/2, .055, .09, height, frame_mat)
    part('玻璃横挺', 0, .12, height*.66, width, .09, .06, frame_mat)


def wing(cx, cy, w, d, height):
    base = 1.35
    box('楼体核心', (cx, cy+.45, base+height/2), (w-1.0, d-1.7, height), stone, .08)
    front = cy-d/2
    count = round(w/3.6)
    pitch = w/count
    for i in range(count+1):
        box('临街石柱', (cx-w/2+i*pitch, front+.25, base+height/2), (.65, .90, height), stone)
    for level in range(4):
        box('楼层石带', (cx, front+.24, base+level*4.05+.2), (w+.28, .84, .42), trim)
    for level in range(3):
        for i in range(count):
            window(cx-w/2+(i+.5)*pitch, front, base+.95+level*4.05, powered=(i+level)%4 != 1)
    # 侧面和背面同样有门窗，保证自由视角完整。
    for sign in (-1, 1):
        for i in range(round(d/4.1)):
            y = cy-d/2+(i+.5)*d/round(d/4.1)
            for level in range(3):
                window(cx+sign*w/2, y, base+.95+level*4.05, turn=sign*math.pi/2, powered=(i+level)%3 != 0)
    for i in range(count):
        for level in range(3):
            window(cx-w/2+(i+.5)*pitch, cy+d/2, base+.95+level*4.05, turn=math.pi, powered=(i+level)%4 == 0)
    for z in (base+.35, base+height-.35, base+height+.12):
        box('整圈檐口与基座', (cx, cy, z), (w+.8, d+.8, .30), trim, .045)
    hip_roof(cx, cy, w+1.3, d+1.3, base+height+.35, 3.2)
    for x in (cx-w/2+.12, cx+w/2-.12):
        cylinder('雨水落管', (x, cy+d/2+.4, base+height/2), .065, height, roof_seam, 8)


icos={}
def crown_mesh(level,mat):
    key=(level,mat.name)
    if key not in icos:
        mesh=bpy.data.meshes.new('共用树冠_'+mat.name+str(level));bm=bmesh.new()
        bmesh.ops.create_icosphere(bm,subdivisions=level+1,radius=1)
        bm.to_mesh(mesh);bm.free();mesh.materials.append(mat);icos[key]=mesh
    return icos[key]


def tree(x, y, height=8):
    cylinder('树干', (x, y, height*.29), .23, height*.58, bark, 10)
    for i in range(7):
        angle = i*2.4
        r = 1.25 if i else 0
        cx, cy = x+math.cos(angle)*r, y+math.sin(angle)*r
        cz = height*.72 + random.uniform(-.65, .75)
        beam('树枝', (x, y, height*.38), (cx, cy, cz), .075, bark)
        obj=own(bpy.data.objects.new('分层树冠',crown_mesh(2,leaf[i%4])));obj.location=(cx,cy,cz)
        obj.scale = (random.uniform(1.0, 1.45), random.uniform(1.0, 1.45), random.uniform(1.2, 1.8))
    for i in range(42):
        angle=random.uniform(0,math.tau);vertical=random.uniform(-.9,.9);radius=math.sqrt(1-vertical*vertical)
        cx=x+math.cos(angle)*radius*2.5;cy=y+math.sin(angle)*radius*2.35;cz=height*.72+vertical*1.7
        obj=own(bpy.data.objects.new('细分叶簇',crown_mesh(1,leaf[i%4])));obj.location=(cx,cy,cz)
        obj.scale=(random.uniform(.35,.65),random.uniform(.35,.65),random.uniform(.40,.80))


def bed(x, y, w, d):
    box('花池基座', (x, y, .3), (w, d, .5), stone, .1)
    box('花池土面', (x, y, .6), (w-.35, d-.35, .15), gravel, .04)
    for i in range(max(3, int(w*d/1.7))):
        px, py = x+random.uniform(-w*.40, w*.40), y+random.uniform(-d*.40, d*.40)
        obj=own(bpy.data.objects.new('灌木团',crown_mesh(1,leaf[i%4])));obj.location=(px,py,1.05);obj.scale=(random.uniform(.35,.7),)*3
        obj.scale.z *= .8


def bench(x, y, turn=0):
    for i in range(5):
        box('长椅木板', (x, y+(i-2)*.11, .62), (2.2, .095, .07), wood, .02, turn)
    for i in range(3):
        box('长椅靠背', (x, y+.28, .87+i*.13), (2.2, .065, .10), wood, .018, turn)
    for dx in (-.8, .8):
        box('长椅支脚', (x+dx, y, .32), (.08, .50, .60), steel)


def streetlight(x, y):
    cylinder('路灯柱', (x, y, 3.8), .085, 7.6, steel, 12)
    beam('灯臂', (x, y, 7.4), (x+.65, y, 7.6), .055, steel)
    box('灯具外壳', (x+.65, y, 7.6), (.7, .42, .18), steel, .065)
    box('灯具发光面', (x+.65, y, 7.49), (.55, .33, .035), lamp, .008)
    lights.append([x+.65, 7.35, -y, 180, 15])


def car(x, y, index=0):
    # 场景比例参照车：4.6m长，轮胎/窗框/车灯有几何，不把小物件放大成地标。
    box('车辆底盘', (x, y, .44), (1.9, 4.6, .35), dark, .12)
    box('车身', (x, y, .8), (1.9, 4.4, .65), paint[index%4], .20)
    box('车顶', (x, y+.15, 1.43), (1.5, 2.5, .65), paint[index%4], .22)
    box('挡风玻璃', (x, y-1.09, 1.43), (1.35, .04, .43), glass, .02)
    box('后窗', (x, y+1.39, 1.43), (1.32, .04, .4), glass, .02)
    for side in (-1, 1):
        box('车侧窗', (x+side*.77, y+.15, 1.44), (.045, 2.12, .4), glass, .018)
        box('车窗B柱', (x+side*.8, y+.12, 1.43), (.06, .10, .52), dark)
        box('后视镜', (x+side*1.03, y-.65, 1.2), (.22, .32, .14), paint[index%4], .05)
        for ay in (-1.45, 1.45):
            wheel = cylinder('轮胎', (x+side*.93, y+ay, .38), .36, .22, tire, 20)
            wheel.rotation_euler.y = math.pi/2
            hub = cylinder('轮毂', (x+side*1.05, y+ay, .38), .23, .025, chrome, 16)
            hub.rotation_euler.y = math.pi/2
    for dx in (-.65, .65):
        box('前车灯', (x+dx, y-2.19, .83), (.48, .06, .18), trim, .035)
        box('后尾灯', (x+dx, y+2.19, .81), (.43, .05, .14), paint[3], .03)


def person(x, y, color):
    cloth = material('visitor_'+str(len(materials)), color, .85)
    cylinder('行人躯干', (x, y, 1.07), .19, .55, cloth, 8)
    cylinder('行人头', (x, y, 1.57), .13, .25, wood, 10)
    for side in (-1, 1):
        beam('行人腿', (x+side*.10, y, .14), (x+side*.10, y, .82), .07, dark)
        beam('行人手臂', (x+side*.20, y, 1.29), (x+side*.27, y+.06, .85), .065, cloth)


print('CITYX_PHASE geometry',flush=True)
# 建筑在园区后半部，前方留出真正的市民广场；模型全程使用米。
box('园区基座_120x140m', (0, 0, -.62), (120, 140, 1.2), brick, .32)
box('园区草坪', (0, 0, -.04), (119.4, 139.4, .14), grass, .04)
box('前方道路', (0, -63, .03), (119, 10, .13), asphalt)
for x in range(-55, 56, 9):
    box('道路分隔虚线', (x, -63, .11), (4, .13, .015), trim, 0)
for y in (-56.2, -69):
    box('人行路缘', (0, y, .16), (119.2, .25, .30), stone)
box('市民广场铺装', (0, -24, .12), (77, 61, .24), paving, .05)
for x in (-47, 47):
    box('侧面停车铺装', (x, 29, .075), (19, 63, .15), asphalt)
    for y in range(0, 61, 10):
        box('停车位边线', (x, y, .16), (6, .12, .025), trim, 0)
    box('侧面步道', (x*.78, 15, .16), (2.4, 88, .30), paving)
    box('前庭草坪', (x, -30, .08), (17, 42, .18), grass, .04)
    bed(x, -30, 9, 25)
    tree(x, -39, 7.7);tree(x, -23, 7.5)
for x in range(-5, 6):
    box('人行横道', (x*1.05, -63, .12), (.60, 8, .015), trim, 0)
box('建筑基座', (0, 23, .65), (70, 37, 1.25), brick, .12)
wing(-22, 24, 22, 27, 12.75)
wing(22, 24, 22, 27, 12.75)
box('中央主楼', (0, 24, 9.4), (22, 31, 16), stone, .08)
for z in (1.5, 17.4):
    box('中央檐口', (0, 24, z), (23.2, 32.2, .50), trim, .07)
hip_roof(0, 24, 23.7, 32.7, 17.7, 4.3)
for x in (-18,26):
    box('屋顶维护烟道',(x,30,17.4),(2.2,2.8,2.1),stone,.05)
    box('烟道盖板',(x,30,18.50),(2.65,3.25,.24),trim,.05)
    for z in (17.05,17.3,17.55,17.8):box('通风百叶',(x,28.57,z),(1.65,.06,.09),roof_seam,.012)
box('屋顶天窗基座',(0,36,20),(4.2,3.2,1.4),trim,.05)
box('屋顶天窗玻璃',(0,36,20.73),(3.7,2.7,.045),litglass,.012)
bpy.ops.object.text_add(location=(0,6.18,16.72))
label=own(bpy.context.object);label.name='市政厅入口铭文';label.data.body='CITY HALL'
label.data.align_x='CENTER';label.data.size=.55;label.data.extrude=.018;label.data.bevel_depth=.006
label.rotation_euler.x=math.pi/2;label.data.materials.append(sign_mat)
bpy.ops.object.convert(target='MESH')
box('入口暗内层', (0, 8.48, 8.85), (16.3, .2, 14.6), dark)
box('中央入口玻璃', (0, 8.25, 8.85), (15.9, .1, 14.35), litglass, 0)
for x in (-8.1, -4.05, 0, 4.05, 8.1):
    box('中央石柱', (x, 6.8, 9.0), (.8, 1.05, 15.1), trim, .055)
    for z in (1.8, 16.4):
        box('石柱柱脚柱头', (x, 6.8, z), (1.2, 1.4, .38), stone, .055)
for z in (5.25, 9.3, 13.35):
    box('入口楼层横挺', (0, 8.16, z), (16.4, .14, .13), frame_mat)
for x in np.arange(-7.4, 8, 1.55):
    box('入口玻璃竖挺', (x, 8.16, 8.85), (.085, .15, 14.2), frame_mat)
box('门厅踏步平台', (0, 4.4, 1.1), (24, 5, .6), paving, .08)
for i in range(8):
    box('入口宽台阶', (0, .4-i*.52, 1.18-i*.135), (23, .55, .14), stone, .018)
for side in (-1, 1):
    beam('台阶扶手', (side*11.6, -3.4, 1.1), (side*11.6, .6, 2.15), .045, steel)
    for y in (-3.2, -1.6, 0):
        beam('扶手立柱', (side*11.6, y, .22), (side*11.6, y, 1.14+(y+3.2)*.24), .035, steel)
box('后部服务步道', (0, 49, .16), (71, 8, .3), paving)
for i in range(5):
    window(-8+i*4, 39.95, 2.5, turn=math.pi)
    window(-8+i*4, 39.95, 7.2, turn=math.pi, powered=False)
    window(-8+i*4, 39.95, 11.7, turn=math.pi)
for side in (-1, 1):
    for y in (13, 19, 25, 31):
        for z in (2.4, 7, 11.5):
            window(side*11.35, y, z, turn=side*math.pi/2, powered=False)
for x in (-15, -9, -3):
    cylinder('广场旗杆', (x, -13, 5.3), .06, 10.6, chrome, 12)
    box('市民旗帜', (x+1, -13, 9.5), (1.9, .05, 1.15), roof if x == -9 else trim, .01)
box('喷泉石台', (0, -33, .40), (11, 14, .65), stone, .15)
box('喷泉水面', (0, -33, .75), (9.7, 12.7, .10), water, .06)
for x in (-5.35, 5.35):
    box('喷泉池沿', (x, -33, .84), (.35, 14, .43), trim, .055)
for y in (-39.85, -26.15):
    box('喷泉池沿', (0, y, .84), (11, .35, .43), trim, .055)
cylinder('喷泉中央柱', (0, -33, 1.15), .55, 1.0, stone)
jet=material('fountain_spray','#c3d9d9',.2,.1)
beam('中央水柱',(0,-33,1.7),(0,-33,4.4),.065,jet)
for i in range(8):
    angle=i*math.tau/8
    for step in range(5):
        def point(t):return (math.cos(angle)*t*1.8,-33+math.sin(angle)*t*1.8,1.7+2.2*t-3*t*t)
        beam('弧形水线',point(step/5),point((step+1)/5),.025,jet)
for x in (-27, 27):
    for y in (-11, -28, -44):
        bed(x, y, 7, 6)
        tree(x, y, 6.8)
        bench(x, y+4.6)
for x in (-56, 56):
    for y in (-45, -21, 3, 27, 51):
        tree(x, y, 7.2+random.uniform(-.3, .9))
for x in (-32, -16, 0, 16, 32):
    tree(x, 61, 8.1)
for x in (-39, 39):
    tree(x, -45, 7.6)
    tree(x, -12, 7.2)
for x in (-45, 45):
    for y in (-45, -20, 5, 30, 53):
        streetlight(x, y)
for x in (-18, 18):
    streetlight(x, -46)
for i, y in enumerate((3, 18, 33, 48)):
    car(-48, y, i)
for i, y in enumerate((10, 28, 46)):
    car(48, y, i+1)
for x, y, c in [(-9, -6, '#727f89'), (7, -18, '#9b8b72'), (19, -37, '#899577'), (-18, -42, '#687d81'), (33, 2, '#8c7568')]:
    person(x, y, c)
lights.extend([[-6, 4, -6, 500, 20], [6, 4, -6, 500, 20], [0, 2, 33, 120, 14]])
root['cityhallLights'] = lights

print('CITYX_PHASE source',len(source.objects),flush=True)
# 源文件保留分件与修饰器；导出副本按材质合并并固化小倒角，不损坏可编辑源。
scene.world = bpy.data.worlds.new('柔和环境')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.85, .88, .90, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .55
world_nodes=scene.world.node_tree.nodes
backdrop=world_nodes.new('ShaderNodeBackground');backdrop.inputs[0].default_value=(.95,.95,.90,1);backdrop.inputs[1].default_value=3
ray=world_nodes.new('ShaderNodeLightPath');mix=world_nodes.new('ShaderNodeMixShader')
scene.world.node_tree.links.new(ray.outputs['Is Camera Ray'],mix.inputs[0])
scene.world.node_tree.links.new(world_nodes['Background'].outputs[0],mix.inputs[1])
scene.world.node_tree.links.new(backdrop.outputs[0],mix.inputs[2])
scene.world.node_tree.links.new(mix.outputs[0],world_nodes['World Output'].inputs[0])
bpy.ops.object.light_add(type='SUN', location=(-60, -90, 120))
sun = bpy.context.object
sun.name = '市政厅_日光'
sun.rotation_euler = (math.radians(25), math.radians(-25), math.radians(-30))
sun.data.energy = 3.0
sun.data.color=(1,.95,.85)
sun.data.angle = math.radians(12)
bpy.ops.object.camera_add(location=(155, -185, 165))
camera = bpy.context.object
camera.name = '参考图_斜视镜头'
camera.rotation_euler = (Vector((0, 2, 5))-camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 190
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = options.samples
scene.cycles.use_denoising = True
scene.render.resolution_x = options.size
scene.render.resolution_y = round(options.size*.8)
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
scene.view_settings.exposure=.35
scene.render.film_transparent = False
scene.render.image_settings.color_mode = 'RGBA'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'city-hall.blend'))

export = bpy.data.collections.new('GLB_合并副本')
scene.collection.children.link(export)
deps = bpy.context.evaluated_depsgraph_get()
batches = {}
for original in list(source.objects):
    if original.type != 'MESH':
        continue
    evaluated = original.evaluated_get(deps)
    mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=deps)
    obj = bpy.data.objects.new(original.name, mesh)
    obj.matrix_world = original.matrix_world.copy()
    export.objects.link(obj)
    name = original.data.materials[0].name
    batches.setdefault(name, []).append(obj)
export_root = bpy.data.objects.new('CityHall_Quality', None)
export.objects.link(export_root)
for key in root.keys():
    export_root[key] = root[key]
for objects in batches.values():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].parent = export_root
    objects[0].name = '材质批次_'+objects[0].data.materials[0].name
bpy.ops.object.select_all(action='DESELECT')
for obj in export.objects:
    obj.select_set(True)
print('CITYX_PHASE export',flush=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'city-hall.glb'), export_format='GLB', use_selection=True, export_extras=True, export_apply=False, export_lights=False, export_cameras=False)
triangles = sum(len(o.data.loop_triangles) for o in export.objects if o.type == 'MESH')
stats = {'units':'meters', 'footprint':[120,140], 'materials':len(batches), 'sourceObjects':len(source.objects), 'triangles':triangles, 'glbBytes':(OUT/'city-hall.glb').stat().st_size, 'elapsedSeconds':round(time.monotonic()-started,1), 'blender':bpy.app.version_string}
(OUT/'build-info.json').write_text(json.dumps(stats, ensure_ascii=False, indent=2)+'\n')
print('CITYX_BUILD', json.dumps(stats))
export.hide_render = True

if options.render:
    scene.render.filepath = str(OUT/'renders'/'city-hall-day.png')
    bpy.ops.render.render(write_still=True)
    backdrop.inputs[0].default_value=(.025,.045,.06,1);backdrop.inputs[1].default_value=1
    sun.data.energy = .35
    sun.data.color = (.55, .68, 1)
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.12, .20, .27, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .28
    for mat in (litglass, lamp):
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Emission Color'].default_value = (*rgb('#ffd49b'), 1)
        shader.inputs['Emission Strength'].default_value = .9 if mat == litglass else 3
    for x, z, ny, power, reach in lights:
        bpy.ops.object.light_add(type='POINT', location=(x, -ny, z))
        obj = bpy.context.object
        obj.data.color = (1, .70, .37)
        obj.data.energy = power*5
        obj.data.shadow_soft_size = .4
    scene.render.filepath = str(OUT/'renders'/'city-hall-night.png')
    bpy.ops.render.render(write_still=True)
print('CITYX_DONE', round(time.monotonic()-started, 1))
