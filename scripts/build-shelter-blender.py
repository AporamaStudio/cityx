"""幸存者避难所品质样板：同址孤立/接通两态，仅供3D视觉预览。

Blender --background --factory-startup --python-exit-code 1 --python scripts/build-shelter-blender.py -- --state isolated --render
将state改为connected生成接通版。复用市政厅原创PBR材质与米制构件做法，不读取游戏地图。
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

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from cityhall_abandoned import configure_viewport
from shelter_weathering import apply_shelter_weathering

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/model-preview/shelter-quality'
OUT.mkdir(parents=True, exist_ok=True)
(OUT/'renders').mkdir(exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--state', choices=('isolated','connected'), default='isolated')
parser.add_argument('--render', action='store_true')
parser.add_argument('--size', type=int, default=1440)
parser.add_argument('--samples', type=int, default=96)
options = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
connected = options.state == 'connected'
stem = 'shelter-'+options.state
started = time.monotonic()
random.seed(815)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
source = bpy.data.collections.new('社区中心避难所_米制分件')
scene.collection.children.link(source)
root = bpy.data.objects.new('Shelter_60x80m', None)
source.objects.link(root)
root['units'] = 'meters'
root['footprintMeters'] = [60,80]
root['visualOnly'] = True
root['qualitySample'] = True
root['shelterState'] = options.state
root['mainBuildingMeters'] = [33,22]
lights = []
materials = {}
icos = {}


def rgb(value):
    c = [int(value[i:i+2], 16)/255 for i in (1, 3, 5)]
    return tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in c)

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
            # 长坡立缝平行排列，在斜脊终止，避免聚成扇面。
            inset = max(0, abs(x)-half)
            top = rise*(1-inset/(depth/2))
            beam('屋面立缝', (cx+x, cy+side*depth/2, z+.03), (cx+x, cy+side*inset, z+top+.03), .027, roof_seam)
        for y in np.arange(-depth/2+.7,depth/2-.3,1.05):
            end=half+abs(y);top=rise*(1-abs(y)/(depth/2))
            beam('端坡立缝',(cx+side*width/2,cy+y,z+.03),(cx+side*end,cy+y,z+top+.03),.027,roof_seam)
    beam('屋脊盖板', (cx-half, cy, z+rise+.09), (cx+half, cy, z+rise+.09), .13, roof_seam)

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

# 沿用市政厅已打包原创材质，两个样板同一美术语言；不拷贝它的建筑几何。
base_names = ['limestone','warm_cream_trim','stone_courses','plaza_paving','asphalt','grass',
              'sage_metal_roof','standing_seam','window_frames','cityhall_glass_dark',
              'recess_shadow','street_metal','bench_wood','planter_gravel','bark','rubber',
              'wheel_and_hardware'] + ['leaf_'+str(i) for i in range(4)] + ['car_paint_'+str(i) for i in range(4)]
with bpy.data.libraries.load(str(ROOT/'assets/model-preview/cityhall-quality/city-hall.blend'), link=False) as (available, loaded):
    loaded.materials = list(base_names)
stone, trim, brick, paving, asphalt, grass, roof, roof_seam, frame_mat, glass, dark, steel, wood, gravel, bark, tire, chrome = [bpy.data.materials[n] for n in base_names[:17]]
leaf = [bpy.data.materials['leaf_'+str(i)] for i in range(4)]
paint = [bpy.data.materials['car_paint_'+str(i)] for i in range(4)]


def material(name, color, roughness=.8, metal=0, night=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*rgb(color),1)
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb(color),1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metal
    if night:
        # 日间不发光，GLB显式记录夜间强度，网页和离线渲染读取同一资料。
        mat['shelterNightStrength'] = night
        night_color = '#ffd3a0' if connected else '#ffab50'
        mat['shelterNightColor'] = list(rgb(night_color))
        mat['shelterLightStyle'] = 'led' if connected else 'firelight'
        shader.inputs['Emission Color'].default_value = (*rgb(night_color),1)
    materials[name] = mat
    return mat


redbrick = brick.copy();redbrick.name='shelter_terracotta_brick'
brick_shader=redbrick.node_tree.nodes['Principled BSDF']
original_color=brick_shader.inputs['Base Color'].links[0].from_socket
tint=redbrick.node_tree.nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1
tint.inputs[2].default_value=(.85,.54,.36,1)
redbrick.node_tree.links.new(original_color,tint.inputs[1]);redbrick.node_tree.links.new(tint.outputs[0],brick_shader.inputs['Base Color'])
canvas = material('shelter_canvas_sage','#89927b',.94)
canvas_light = material('shelter_canvas_cream','#bdb394',.95)
canvas_seam = material('shelter_canvas_seams','#6d7662',.9)
plywood = material('shelter_plywood','#9b815a')
soil = material('shelter_dry_soil','#79745c',.97)
blue = material('shelter_water_container','#687f86',.5,.2)
solar = material('shelter_solar_cells','#34576a',.28,.4)
line = material('shelter_faded_court_lines','#c5c1a4',.95)
court = material('shelter_court_surface','#697f7a',.94)
cloth = material('shelter_laundry','#b5b5a3',.95)
cloth_blue = material('shelter_laundry_blue','#6e868b',.93)
light_glass = material('shelter_warm_glass','#8b9b92',.26,.15,night=1.15 if connected else .65)
lamp = material('shelter_lamp','#f2d6a3',.42,night=3.2 if connected else 1.8)
tent_lamp = material('shelter_tent_lantern','#ead2a7',.7,night=.7 if connected else .25)
label_mat = material('shelter_sign','#d8cba8',.8)
sign_dark = material('shelter_sign_ink','#4d625a',.9)


def text_label(text, position, size, mat, rotation=(math.pi/2,0,0)):
    # 真实曲线字转网格后导出，标识不依赖外部字体或网页贴图。
    curve = bpy.data.curves.new('避难所标识','FONT')
    curve.body = text
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.size = size
    curve.extrude = .008
    obj = own(bpy.data.objects.new('标识_'+text,curve))
    obj.location = position
    obj.rotation_euler = rotation
    curve.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')


def light_at(x,y,z,power,reach):
    lights.append([x,z,-y,power,reach])


def framed_window(x,y,z,w=1.85,h=2.15,turn=0,powered=False,boarded=False):
    def part(name,dx,dy,dz,size,mat,bevel=.016):
        return box(name,(x+dx*math.cos(turn)-dy*math.sin(turn),y+dx*math.sin(turn)+dy*math.cos(turn),z+dz),size,mat,bevel,turn)
    part('窗洞暗层',0,.26,h/2,(w+.22,.09,h+.22),dark)
    part('凹入玻璃',0,.18,h/2,(w,.06,h),light_glass if powered else glass,0)
    for dx in (-w/2-.06,w/2+.06):
        part('窄窗竖框',dx,.01,h/2,(.12,.30,h+.24),trim)
    for dz in (-.06,h+.06):
        part('窄窗横框',0,.01,dz,(w+.24,.30,.12),trim)
    part('窗台',0,-.15,-.16,(w+.4,.55,.16),stone)
    part('玻璃竖梃',0,.10,h/2,(.06,.09,h),frame_mat)
    part('玻璃横梃',0,.10,h*.63,(w,.09,.06),frame_mat)
    if boarded:
        for j in (-1,0,1):
            board = part('临时封窗木板',0,-.24,h*.5+j*.46,(w+.4,.07,.30),plywood,.012)
            board.rotation_euler.y = .06*(j+1)
            for side in (-1,1):
                part('封板螺钉',side*w*.42,-.29,h*.5+j*.46,(.05,.015,.05),steel,0)


def street_lamp(x,y,on):
    cylinder('路灯地脚',(x,y,.22),.22,.42,steel)
    cylinder('路灯灯杆',(x,y,3.25),.07,6.5,steel,12)
    beam('路灯悬臂',(x,y,6.25),(x+.8,y,6.55),.05,steel)
    box('路灯外壳',(x+.8,y,6.5),(.85,.44,.17),steel,.06)
    box('路灯灯面',(x+.8,y,6.40),(.69,.34,.035),lamp if on else trim,.01)
    if on:
        light_at(x+.8,y,6.25,220,16)


def tent(x,y,index):
    # 4×3m家庭帐篷，双坡布面有垂坠，封闭端面与门襟；不会像屋顶悬空。
    w,d=3.8,3.0
    verts=[(-w/2,-d/2,.28),(0,-d/2,2.5),(w/2,-d/2,.28),(-w/2,d/2,.28),(0,d/2,2.5),(w/2,d/2,.28)]
    mesh=bpy.data.meshes.new('帐篷布面')
    mesh.from_pydata(verts,[],[(0,3,4,1),(1,4,5,2),(3,5,4),(0,1,2)])
    mesh.update()
    obj=own(bpy.data.objects.new('家庭帆布帐篷',mesh))
    obj.location=(x,y,0)
    mesh.materials.append(canvas if index%2 else canvas_light)
    solid=obj.modifiers.new('帆布双面厚度','SOLIDIFY');solid.thickness=.025
    for side in (-1,1):
        beam('帐篷边脊',(x+side*w/2,y-d/2,.3),(x,y-d/2,2.52),.022,canvas_seam)
        beam('帐篷后脊',(x+side*w/2,y+d/2,.3),(x,y+d/2,2.52),.022,canvas_seam)
        for sy in (-1,1):
            beam('绷紧拉绳',(x+side*1.6,y+sy*1.35,.65),(x+side*2.4,y+sy*2.0,.14),.014,canvas_seam)
            cylinder('帐篷地钉',(x+side*2.4,y+sy*2.0,.13),.025,.25,steel,8)
    beam('帐篷屋脊',(x,y-d/2,2.53),(x,y+d/2,2.53),.025,canvas_seam)
    box('帐篷门内阴影',(x,y-d/2-.025,.85),(.9,.045,1.4),dark,.03)
    box('帐篷门襟',(x+.62,y-d/2-.08,.84),(.38,.055,1.42),canvas,.02)
    if index==0 or connected:
        box('帐篷透光小窗',(x-.75,y-d/2-.04,1.05),(.65,.025,.42),tent_lamp,.02)
        light_at(x-.7,y-d/2-.25,1.3,13 if not connected else 28,4.5)


def crate(x,y,z=.4):
    box('物资木箱',(x,y,z),(.95,.68,.74),wood,.035)
    for dx in (-.32,.32):
        box('木箱加固带',(x+dx,y,z),(.07,.71,.78),plywood,.012)
    box('物资标签',(x,y-.35,z),(.29,.012,.22),label_mat,0)


def bench(x,y):
    for j in range(5):
        box('长椅座板',(x,y+(j-2)*.11,.66),(2.2,.09,.08),wood,.018)
    for j in range(3):
        box('长椅靠背',(x,y+.28,.95+j*.13),(2.2,.065,.10),wood,.018)
    for dx in (-.80,.80):
        box('长椅铁脚',(x+dx,y,.35),(.08,.55,.65),steel)


def basketball():
    # 球场线保留在帐篷旁边，提示灾前用途；只画半场，不当作新玩法。
    box('社区半场',(17,-13,.16),(17,22,.12),court,.08)
    for x in (9.1,24.9):
        box('半场边线',(x,-13,.231),(.09,20,.012),line,0)
    for y in (-23,-3):
        box('半场底线',(17,y,.231),(15.9,.09,.012),line,0)
    for x in (14,20):
        box('禁区边线',(x,-6.9,.232),(.08,7.8,.012),line,0)
    box('罚球线',(17,-10.8,.232),(6,.08,.012),line,0)
    for i in range(32):
        a=math.pi+i*math.pi/32;b=math.pi+(i+1)*math.pi/32
        beam('半场弧线',(17+6.7*math.cos(a),-5+6.7*math.sin(a),.236),(17+6.7*math.cos(b),-5+6.7*math.sin(b),.236),.045,line)
    beam('篮架立柱',(17,-1.8,.15),(17,-1.8,4.2),.09,steel)
    beam('篮架悬臂',(17,-1.8,4),(17,-3.0,3.65),.065,steel)
    box('篮板',(17,-3,3.8),(1.8,.10,1.05),trim,.03)
    for i in range(20):
        a=i*math.tau/20;b=(i+1)*math.tau/20
        beam('篮筐',(17+.24*math.cos(a),-3.45+.24*math.sin(a),3.3),(17+.24*math.cos(b),-3.45+.24*math.sin(b),3.3),.02,redbrick)


print('SHELTER_PHASE geometry',options.state,flush=True)
box('60x80米园区基座',(0,0,-.48),(60,80,.9),brick,.18)
box('园区草地',(0,0,.015),(59.7,79.7,.12),grass,.03)
box('临街道路',(0,-34,.035),(59.6,8,.15),asphalt,.015)
for x in range(-25,28,8):
    box('路面分隔线',(x,-34,.12),(3.8,.12,.014),line,0)
for y in (-29.4,-38.8):
    box('道路路缘',(0,y,.20),(59.7,.25,.35),stone,.03)
box('入口人行道',(0,-27.2,.16),(59.6,4,.25),paving,.04)
box('接待前庭',(-6,-13,.15),(25,24,.25),paving,.06)
box('侧面通道',(-25,7,.13),(3,64,.22),paving,.03)
box('后侧维护通道',(-3,30,.13),(49,4,.22),paving,.03)
box('临时停车位',(-22,-17,.13),(7,16,.2),asphalt,.03)
for y in (-23,-18,-13):
    box('停车引导线',(-22,y,.24),(5.5,.10,.012),line,0)
for x in np.arange(-3,3.1,1.0):
    box('人行横道',(x,-34,.13),(.55,7,.013),trim,0)

# 大厅33×22m、两层；砖砌低配楼和入口雨棚形成概念图中的社区中心轮廓。
box('主楼基座',(-3,13,.45),(34,23,.75),brick,.08)
box('主楼墙体',(-3,13.45,4.1),(32.3,20.4,7.1),stone,.06)
for level in range(3):
    box('楼层横带',(-3,2.35,.7+level*3.45),(33.25,.75,.25),trim,.025)
for i in range(11):
    x=-19.5+i*3.3
    box('前立面窄柱',(x,2.40,4.0),(.55,.80,7),stone,.025)
for level in range(2):
    for i in range(10):
        if level==0 and i in (4,5):
            continue
        x=-19.5+(i+.5)*3.3
        powered=((i+level)%3!=1) if connected else (level==0 and i==2)
        framed_window(x,2,.95+level*3.45,powered=powered,boarded=not connected and (i,level) in ((0,0),(8,0),(9,1)))
for side in (-1,1):
    for i in range(5):
        for level in range(2):
            framed_window(-3+side*16.5,4.3+i*4,1+level*3.45,turn=side*math.pi/2,powered=connected and (i+level)%3==0,boarded=not connected and side==-1 and i==1 and level==0)
for i in range(9):
    framed_window(-17+i*3.5,24,1.1,turn=math.pi,powered=connected and i%3==0)
box('主楼檐口',(-3,13,7.8),(34,23,.35),trim,.045)
hip_roof(-3,13,34.6,23.6,8.0,2.5)
for x in (-19.5,13.5):
    cylinder('雨水落管',(x,24.7,4.1),.065,7.8,roof_seam,8)

# 面向前庭的门厅可看到玻璃分格、入口台阶和雨棚上方屋顶。
box('玻璃门厅暗层',(-3,1.9,2.30),(5.2,.25,3.3),dark,.02)
for x in (-4.15,-1.85):
    box('入口门玻璃',(x,1.69,2.25),(2.12,.08,3.1),light_glass,.02)
    for dx in (-1.1,1.1):
        box('入口门边框',(x+dx,1.60,2.25),(.10,.18,3.2),steel,.014)
    box('门把手',(x-.63,1.5,2.1),(.05,.12,.55),chrome,.012)
for j in range(4):
    box('入口台阶',(-3,-.1-j*.38,.51-j*.10),(9.8+j*.18,2.8+j*.35,.20),stone,.03)
for x in (-8.4,2.4):
    box('雨棚支柱',(x,-2.3,1.9),(.22,.22,3.4),steel,.025)
box('入口雨棚',(-3,-.8,3.8),(12.8,6,.28),trim,.055)
box('雨棚顶盖',(-3,-.8,3.98),(12.4,5.6,.10),roof,.02)
box('避难所门头',(-3,-3.84,3.45),(7.9,.14,.68),sign_dark,.025)
text_label('NORTH 03 / SHELTER',(-3,-3.93,3.45),.39,label_mat)
for x in (-7,1):
    box('入口应急灯罩',(x,-.4,3.58),(.7,.45,.09),lamp,.02)
    light_at(x,-.4,3.45,105 if not connected else 170,11)
box('紧急告示牌',(-10.2,-3.0,1.6),(1.2,.13,1.5),plywood,.025)
text_label('03',(-10.2,-3.08,1.78),.65,sign_dark)

# 配楼保留红砖、侧门、可维护屋顶；避难所并非新建军营。
box('配楼基座',(18,12,.45),(8.8,23,.75),brick,.08)
box('红砖配楼',(18,12.3,2.7),(8,21.4,4.35),redbrick,.045)
for z in (1.1,2.3,3.5,4.6):
    box('砖墙水平收口',(22.06,12.2,z),(.055,21.3,.055),brick,.005)
for y in (4.3,8.7,13.1,17.5,21.9):
    framed_window(22.15,y,1.25,1.7,2.0,turn=math.pi/2,powered=connected and y in (4.3,13.1))
box('配楼平屋顶',(18,12,5.05),(9.0,23.4,.35),trim,.05)
box('配楼防水层',(18,12,5.25),(8.6,23,.08),roof,.01)
for x in (13.7,22.3):
    box('配楼女儿墙',(x,12,5.48),(.18,23,.48),trim,.02)
box('配楼后女儿墙',(18,23.45,5.48),(8.6,.18,.48),trim,.02)
for x,y in ((17,17),(19.6,17)):
    box('屋顶通风机',(x,y,5.7),(1.4,1.8,.8),frame_mat,.08)
    for j in range(6):
        box('通风百叶',(x-.71,y-.65+j*.25,5.7),(.025,.10,.52),dark,0)

# 天窗朝前坡：顶视有实物框架和透光面，应急模式仅两片亮起。
for index,x in enumerate((-13,-6,1,8)):
    y=7.1;z=9.30
    curb=box('天窗金属基座',(x,y,z),(3.1,3.2,.22),roof_seam,.04)
    glass_obj=box('暖光天窗' if connected or index in (1,2) else '未点亮天窗',(x,y,z+.14),(2.75,2.85,.08),light_glass if connected or index in (1,2) else glass,.025)
    for obj in (curb,glass_obj):
        obj.rotation_euler.x=math.atan(2.5/11.8)
    for dx in (-1.46,0,1.46):
        beam('天窗金属竖梃',(x+dx,y-1.49,z-.18),(x+dx,y+1.49,z+.45),.035,frame_mat)
    # 天窗自身透光，屋面上方不放点光，避免灯泡反射热点。
# 小太阳能阵列位于后坡，毫米级框架简化为真实米制线条。
for i in range(3):
    px=-11+i*3.2;py=19;z=9.3
    before=set(source.objects)
    box('太阳能背架',(px,py,z),(2.9,3.6,.13),steel,.02)
    box('蓝灰太阳能板',(px,py,z+.09),(2.72,3.42,.045),solar,.015)
    for j in range(1,6):
        box('太阳能电池分格',(px-1.36+j*.453,py,z+.118),(.015,3.42,.008),chrome,0)
    for j in range(1,6):
        box('太阳能横栅',(px,py-1.71+j*.57,z+.118),(2.72,.012,.008),chrome,0)
    # 后坡向后下降，整个阵列沿屋坡倾斜，避免板片穿入屋面。
    for obj in set(source.objects)-before:
        obj.location.z-= (obj.location.y-py)*2.5/11.8
        obj.rotation_euler.x=-math.atan(2.5/11.8)
    for dx in (-1.2,1.2):
        beam('太阳能支撑脚',(px+dx,py,8.9),(px+dx,py,z),.04,steel)
# 屋顶无线电天线，轮廓可辨但保持三米级，避免变成高耸瞭望塔。
beam('无线电天线杆',(8,18,9.1),(8,18,13.6),.055,steel)
for z in (12.2,12.8,13.4):
    beam('天线横梁',(6.8,18,z),(9.2,18,z),.025,steel)
for x,y in ((6,16),(10,16),(8,20)):
    beam('天线拉索',(8,18,12.4),(x,y,8.9),.012,chrome)

basketball()
for index,(x,y) in enumerate(((13,-16),(21,-16),(13,-7))):
    tent(x,y,index)
# 维持中的生活：物资、晾衣与备用电源，接通后仍保留而非全部清空。
for i in range(8 if connected else 5):
    crate(-14+(i%3)*1.05,-5+(i//3)*.8)
box('登记桌',(-5,-6.4,.95),(2.1,.9,.13),wood,.035)
for dx in (-.8,.8):
    box('登记桌支脚',(-5+dx,-6.4,.49),(.08,.65,.90),steel)
box('登记册',(-5,-6.4,1.05),(.48,.36,.06),trim,.01)
for x in (24,27):
    cylinder('储水桶',(x,29,1.05),.9,1.85,blue,24)
    cylinder('储水桶盖',(x,29,2.02),.92,.12,frame_mat,24)
    cylinder('储水桶箍',(x,29,1.4),.92,.06,chrome,24)
box('备用发电机底座',(17.8,29,.38),(3.5,2.0,.60),steel,.08)
box('发电机机柜',(17.8,29,1.2),(3.1,1.65,1.25),frame_mat,.10)
for j in range(9):
    box('发电机散热口',(16.24,28.4+j*.15,1.2),(.025,.055,.80),dark,0)
beam('发电机排气管',(18.7,29,1.7),(18.7,29,2.35),.07,steel)
box('备用油桶',(20.5,29,.68),(.55,.40,.82),canvas_seam,.055)
for x in (10,20):
    beam('晾衣杆',(x,33,.1),(x,33,2.6),.045,steel)
beam('晾衣绳',(10,33,2.5),(20,33,2.5),.012,canvas_seam)
for i in range(5):
    obj=box('晾晒衣物',(11.1+i*1.65,33,1.9),(.72,.03,1.0),cloth if i%2 else cloth_blue,.015)
    obj.rotation_euler.x=.10*(i%3-1)
for x,y in ((-16,-20),(-7,-20),(-24,11)):
    bench(x,y)
for x,y,h in ((-24,27,7.5),(-23,1,6.4),(-24,-7,6.9),(26,-23,6.2),(27,9,7),(25,36,6.8),(-14,34,7.1),(-4,34,6.7)):
    tree(x,y,h)
for x,y,w,d in ((-18,-25,8,1.4),(-14,28,12,1.3),(27,-6,1.5,9)):
    bed(x,y,w,d)
car(-22,-20,0);car(-22,-12,2)
# 前庭细节围绕人的活动尺度布置，保留入口和主要通道。
for x,y in ((-13,-12),(-13,-19),(3,-19)):
    bed(x,y,2.1,1.25)
for x,y in ((-10,-5),(-10,-6.1)):
    for j in range(5):
        box('补给托盘板',(x+(j-2)*.2,y,.32),(.17,.95,.10),wood,.015)
    for dx in (-.35,.35):
        box('托盘底脚',(x+dx,y,.21),(.12,.9,.15),plywood,.012)
for x,y in ((-7,-8),(-3,-8),(-7,-10)):
    box('折叠椅座',(x,y,.65),(.48,.45,.07),canvas,.018)
    box('折叠椅靠背',(x,y+.19,.98),(.48,.045,.38),canvas,.018)
    for dx in (-.19,.19):
        beam('折叠椅支架',(x+dx,y-.21,.22),(x+dx,y+.2,.75),.02,steel)
# 临时电缆只作静态生活细节，不加入供电模拟。
for a,b in [((17.8,28.1,.27),(17.8,26.3,.27)),((17.8,26.3,.27),(20.8,26.3,.27)),((20.8,26.3,.27),(20.8,23.8,.27))]:
    beam('临时接线电缆',a,b,.022,dark)
# 同位置静态人物用于尺度与生活感，不表示可操作单位。
skin=material('shelter_survivor_skin','#aa8d70')
jacket=material('shelter_survivor_jacket','#667971')
for x,y in ((-4,-6.9),(-9,-9),(8,-17),(-12,-3)):
    cylinder('幸存者躯干',(x,y,1.20),.19,.55,jacket,10)
    cylinder('幸存者头部',(x,y,1.70),.13,.23,skin,12)
    for side in (-1,1):
        beam('人物腿',(x+side*.1,y,.25),(x+side*.1,y,.95),.065,dark)
        beam('人物手臂',(x+side*.2,y,1.42),(x+side*.27,y+.10,1.0),.06,jacket)
# 场景小围栏只作视觉提示，不表达安全区、通行权限或可攻击墙体。
for x in np.arange(-27,-9,2.7):
    box('前庭木桩',(x,-24.7,.85),(.12,.12,1.5),wood,.015)
for z in (.65,1.2):
    box('前庭横栏',(-18,-24.7,z),(18,.09,.12),wood,.015)
if not connected:
    for x,y in ((-8,-23),(-5.2,-23),(1.2,-23)):
        box('可移动木路障',(x,y,.65),(2.2,.28,1.0),plywood,.025,turn=.1)
        for dx in (-.85,.85):
            box('路障底脚',(x+dx,y,.25),(.16,1.0,.35),wood,.02)
    # 零星石缝杂草，保留前庭可用性，不做大片废墟。
    for i in range(45):
        x=random.uniform(-17,3);y=random.uniform(-24,-8)
        for j in range(3):
            beam('石缝杂草',(x,y,.28),(x+random.uniform(-.08,.08),y+random.uniform(-.08,.08),.4+random.random()*.18),.012,leaf[j])
else:
    box('接通后的物资车位',(25,20,.13),(4,7,.18),paving,.03)
for x,y in ((-19,-28),(0,-28),(20,-28),(-18,-8),(5,-12),(25,2)):
    street_lamp(x,y,connected)
root['shelterLights'] = lights
root['shelterLightColor'] = '#ffd098' if connected else '#ffab50'
root['shelterLightStyle'] = 'led' if connected else 'firelight'
root['landmarks'] = {'entrance':[-3,0], 'court':[17,-13], 'generator':[17.8,29], 'tents':[[13,-16],[21,-16],[13,-7]]}
if not connected:
    apply_shelter_weathering(source,root,own,box,beam,material,rgb)

# 独立品质样板照明，昼夜只改变光源与材质发光，不更换结构或贴图。
scene.world=bpy.data.worlds.new('避难所环境光');scene.world.use_nodes=True
background=scene.world.node_tree.nodes['Background']
background.inputs[0].default_value=(.78,.84,.87,1);background.inputs[1].default_value=.55
bpy.ops.object.light_add(type='SUN',location=(-40,-50,90))
sun=bpy.context.object;sun.name='柔和日光'
sun.rotation_euler=(math.radians(28),math.radians(-24),math.radians(-30));sun.data.energy=3
sun.data.color=(1,.95,.86);sun.data.angle=math.radians(10)
bpy.ops.object.camera_add(location=(87,-108,98))
camera=bpy.context.object;camera.name='同址对照_斜视'
camera.rotation_euler=(Vector((0,1,3))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=103;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=options.samples;scene.cycles.use_denoising=True
scene.render.resolution_x=options.size;scene.render.resolution_y=round(options.size*.8)
scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.35
configure_viewport(scene)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=103
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(stem+'.blend')))

# 固化倒角并按材质合批，源文件分件保留，GLB携带灯位/发光元数据与内嵌PBR贴图。
export=bpy.data.collections.new('GLB_合批副本');scene.collection.children.link(export)
deps=bpy.context.evaluated_depsgraph_get();batches={}
for original in list(source.objects):
    if original.type!='MESH':
        continue
    mesh=bpy.data.meshes.new_from_object(original.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
    obj=bpy.data.objects.new(original.name,mesh);obj.matrix_world=original.matrix_world.copy();export.objects.link(obj)
    batches.setdefault(original.data.materials[0].name,[]).append(obj)
export_root=bpy.data.objects.new('Shelter_Quality',None);export.objects.link(export_root)
for key in root.keys():
    export_root[key]=root[key]
for objects in batches.values():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].parent=export_root
    objects[0].name='材质批次_'+objects[0].data.materials[0].name
bpy.ops.object.select_all(action='DESELECT')
for obj in export.objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/(stem+'.glb')),export_format='GLB',use_selection=True,export_extras=True,export_apply=False,export_lights=False,export_cameras=False)
triangles=sum(len(o.data.loop_triangles) for o in export.objects if o.type=='MESH')
stats={'state':options.state,'units':'meters','footprint':[60,80],'sourceObjects':len(source.objects),'materials':len(batches),'triangles':triangles,'glbBytes':(OUT/(stem+'.glb')).stat().st_size,'nightLights':len(lights),'blender':bpy.app.version_string,'elapsedSeconds':round(time.monotonic()-started,1)}
(OUT/(stem+'-build-info.json')).write_text(json.dumps(stats,ensure_ascii=False,indent=2)+'\n')
print('SHELTER_BUILD',json.dumps(stats),flush=True)
export.hide_render=True
if options.render:
    scene.render.filepath=str(OUT/'renders'/(stem+'-day.png'));bpy.ops.render.render(write_still=True)
    background.inputs[0].default_value=(.12,.21,.31,1);background.inputs[1].default_value=.40
    sun.data.energy=.40;sun.data.color=(.55,.70,1)
    for mat in materials.values():
        if mat.get('shelterNightStrength'):
            mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=mat['shelterNightStrength']
    for x,z,ny,power,reach in lights:
        bpy.ops.object.light_add(type='POINT',location=(x,-ny,z))
        point=bpy.context.object;point.data.energy=power*5;point.data.color=(1,.72,.42) if connected else rgb('#ffab50');point.data.shadow_soft_size=.40
    scene.render.filepath=str(OUT/'renders'/(stem+'-night.png'));bpy.ops.render.render(write_still=True)
print('SHELTER_DONE',round(time.monotonic()-started,1),flush=True)
