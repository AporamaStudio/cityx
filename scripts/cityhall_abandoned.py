"""在同一市政厅源模型上构造废弃变体，保存真实缺口与米制失养场景。"""
import math
import random

import bpy
import numpy as np
from mathutils import Vector


def configure_viewport(scene):
    # 源文件打开即为可检查的材质视图，隐藏数千条父子关系辅助线。
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type != 'VIEW_3D':
                continue
            space = area.spaces.active
            space.overlay.show_relationship_lines = False
            space.overlay.show_extras = False
            space.overlay.show_floor = False
            space.shading.type = 'MATERIAL'
            space.region_3d.view_rotation = scene.camera.rotation_euler.to_quaternion()
            space.region_3d.view_location = (0, 2, 5)
            space.region_3d.view_distance = 195
            space.region_3d.view_perspective = 'ORTHO'
    bpy.ops.object.select_all(action='DESELECT')


def apply_abandoned(source, root, own, box, beam, cylinder, material, rgb):
    rng = random.Random(715)
    original = list(source.objects)
    rubble = material('abandoned_broken_stone', '#b6aa93', .96)
    dust = material('abandoned_interior_dust', '#8a8271', .98)
    timber = material('abandoned_roof_timber', '#73614a', .92)
    rust = material('abandoned_corroded_metal', '#77654f', .83, .12)
    crack = material('abandoned_paving_crack', '#555a48', 1)
    weed = material('abandoned_wild_grass', '#778363', .94)
    dead_leaf = material('abandoned_dry_grass', '#9d9271', 1)
    sediment = material('abandoned_fountain_sediment', '#928971', .97)
    boarded = material('abandoned_window_board', '#84735c', .92)

    # 独立材质与派生贴图；不覆盖完好版的任何原始贴图。
    aged = {}
    for obj in original:
        if obj.type != 'MESH':
            continue
        for slot in obj.material_slots:
            base = slot.material
            # 树冠共享网格会共享材质槽，已经替换的槽不重复派生。
            if base.name.startswith('abandoned_'):
                continue
            if base.name not in aged:
                mat = base.copy()
                mat.name = 'abandoned_' + base.name
                shader = mat.node_tree.nodes.get('Principled BSDF')
                shader.inputs['Emission Strength'].default_value = 0
                shader.inputs['Roughness'].default_value = max(.58, shader.inputs['Roughness'].default_value)
                if 'nightEmission' in mat:
                    del mat['nightEmission']
                color = shader.inputs['Base Color'].default_value
                for axis in range(3):
                    color[axis] = color[axis]*.9 + rgb('#99917c')[axis]*.06
                mat.diffuse_color = tuple(color)
                for node in mat.node_tree.nodes:
                    if node.type != 'TEX_IMAGE' or not node.image or not node.image.name.endswith('_albedo'):
                        continue
                    image = node.image
                    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(image.size[1], image.size[0], 4)
                    yy, xx = np.mgrid[0:image.size[1], 0:image.size[0]]
                    stain = np.maximum(0, np.sin(xx*.038)*np.cos(yy*.021) + np.sin(xx*.013+yy*.017))*.08
                    pixels[:, :, :3] *= (1-stain[:, :, None])
                    pixels[:, :, :3] = pixels[:, :, :3]*.94 + np.array(rgb('#887f68'))*.035
                    damaged = image.copy()
                    damaged.name = 'abandoned_' + image.name
                    damaged.pixels.foreach_set(pixels.ravel())
                    damaged.pack()
                    node.image = damaged
                aged[base.name] = mat
            slot.material = aged[base.name]

    for obj in original:
        if obj.name.startswith(('行人', '中央水柱', '弧形水线')):
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.name.startswith('喷泉水面'):
            obj.data.materials.clear(); obj.data.materials.append(sediment)
            obj.location.z = .75
        elif obj.name.startswith('市民旗帜'):
            obj.scale.z = .65
            obj.rotation_euler.y = -.13
        elif obj.name.startswith('玻璃') and rng.random() < .20:
            # 后方凹入暗层保留，碎玻璃只留两条不规则残片，破窗不变成发光贴片。
            obj.scale.x = rng.uniform(.22, .48)
            obj.scale.z = rng.uniform(.3, .7)
            obj.rotation_euler.y += rng.uniform(-.08, .08)
        elif obj.name.startswith('挡风玻璃'):
            obj.scale.x = .56
            obj.scale.z = .64
        elif obj.name.startswith('轮胎') and rng.random() < .32:
            obj.scale.y = .75
            obj.location.z -= .07
        elif obj.name.startswith('车顶') and obj.location.x > 40:
            obj.scale.z = .78
            obj.location.z -= .08
        elif obj.name.startswith('长椅木板') and obj.location.x > 20 and obj.location.y < -35:
            if rng.random() < .4:
                obj.location.z = .27
                obj.location.x += 1.2
                obj.rotation_euler.z = .34
        elif obj.name.startswith('长椅靠背') and obj.location.x > 20 and obj.location.y < -35:
            obj.rotation_euler.x = .22

    # 右配楼的七边形破口：真正切掉屋面与上层实体，留下下层楼板。
    polygon = [(19,12),(28,10.6),(33.5,15),(34,24),(28,28),(21,25),(18.8,20)]
    verts = [(x,y,z) for z in (11.2,26) for x,y in polygon]
    n = len(polygon)
    faces = [tuple(reversed(range(n))), tuple(range(n,n*2))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh = bpy.data.meshes.new('右配楼破口切割体')
    mesh.from_pydata(verts, [], faces); mesh.update()
    cutter = bpy.data.objects.new('临时切割体', mesh)
    scene = bpy.context.scene
    scene.collection.objects.link(cutter)
    bpy.context.view_layer.update()
    roof_obj = next(o for o in source.objects if o.name.startswith('四坡金属屋顶') and o.location.x > 15)
    core = next(o for o in source.objects if o.name.startswith('楼体核心') and o.location.x > 15)
    # 原檐口是整块薄板，也必须切开，否则它会盖住已挖出的真实上层空间。
    caps = [o for o in source.objects if o.name.startswith('整圈檐口与基座') and o.location.x > 15 and o.location.z > 11]
    for target in (roof_obj, core, *caps):
        bpy.context.view_layer.objects.active = target
        for modifier in list(target.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        boolean = target.modifiers.new('参考图局部坍塌', 'BOOLEAN')
        boolean.operation = 'DIFFERENCE'; boolean.solver = 'EXACT'; boolean.object = cutter
        bpy.ops.object.modifier_apply(modifier=boolean.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

    def inside(x,y):
        hit = False
        for i,(ax,ay) in enumerate(polygon):
            bx,by = polygon[(i+1)%n]
            if (ay > y) != (by > y) and x < (bx-ax)*(y-ay)/(by-ay)+ax:
                hit = not hit
        return hit

    def clip_seam(obj, radius):
        # 按破口轮廓截断立缝，不让金属接缝悬浮横穿屋顶缺口。
        z = max(v.co.z for v in obj.data.vertices)
        a = obj.matrix_world @ Vector((0,0,-z)); b = obj.matrix_world @ Vector((0,0,z))
        dx,dy = b.x-a.x,b.y-a.y
        stops = [0,1]
        for i,(px,py) in enumerate(polygon):
            qx,qy = polygon[(i+1)%n]; ex,ey = qx-px,qy-py
            determinant = dx*ey-dy*ex
            if abs(determinant) < 1e-9:
                continue
            t = ((px-a.x)*ey-(py-a.y)*ex)/determinant
            u = ((px-a.x)*dy-(py-a.y)*dx)/determinant
            if 0 < t < 1 and 0 <= u <= 1:
                stops.append(t)
        stops.sort()
        if not any(inside(*(a+(b-a)*((lo+hi)/2))[:2]) for lo,hi in zip(stops,stops[1:])):
            return
        mat = obj.data.materials[0]
        for lo,hi in zip(stops,stops[1:]):
            mid = a+(b-a)*((lo+hi)/2)
            if not inside(mid.x,mid.y) and hi-lo > .005:
                beam('断口残留屋面接缝', a+(b-a)*lo, a+(b-a)*hi, radius, mat)
        bpy.data.objects.remove(obj, do_unlink=True)

    for obj in list(source.objects):
        if obj.name.startswith(('屋面立缝', '屋脊盖板')) and obj.location.x > 9:
            clip_seam(obj, .13 if obj.name.startswith('屋脊盖板') else .027)

    floor_mesh = bpy.data.meshes.new('暴露楼板')
    floor_mesh.from_pydata([(x,y,11.225) for x,y in polygon], [], [tuple(range(n))])
    floor_mesh.update()
    floor = own(bpy.data.objects.new('坍塌处下层楼板与积尘', floor_mesh))
    floor.data.materials.append(dust)

    def roof_z(x,y):
        return 14.45+3.2*max(0,min(1,(11.65-abs(x-22))/11.65,(14.15-abs(y-24))/11.65))

    for index,y in enumerate((14.5,18.5,22.5,26)):
        # 完整部分藏在屋面下，外侧断端与下坠杆件说明坍塌方向。
        apex = (22,y,roof_z(22,y)-.38)
        beam('暴露承重桁架', (13,y,14.0), apex, .16, timber)
        end = (32.1,y,13.65 if index == 1 else 14.0)
        beam('暴露断端椽梁', apex, end, .15, timber)
        beam('桁架下弦', (14,y,13.5), (31.4,y,13.5), .13, timber)
        beam('桁架腹杆', (18,y,13.5), apex, .085, timber)
        beam('桁架腹杆', apex, (28,y,13.5), .085, timber)
    beam('残存屋脊承梁', (22,13.5,roof_z(22,13.5)-.4), (22,27.8,roof_z(22,27.8)-.4), .14, timber)
    for x,y in ((32.4,17),(30,27),(19.6,15)):
        panel = box('翘曲残存屋面板', (x,y,roof_z(x,y)+.04), (1.8,2.7,.13), aged['sage_metal_roof'], .02)
        panel.rotation_euler = (.16,-.24,.1)
    for i in range(6):
        x,y = rng.uniform(23,31),rng.uniform(14,24)
        beam('落入楼板的断梁', (x,y,11.42), (x+rng.uniform(-2,2),y+2.5,11.7), .13, timber)
    for x,y,z in ((33,17,14),(32.9,21,14.1),(29,11,14.05)):
        chip = box('屋檐断口石片', (x,y,z), (.48,1.1,.3), rubble, .07)
        chip.rotation_euler = (.16,.15,-.1)

    # 碎片集中在破口下方；不把整个园区均匀填满瓦砾。
    for i in range(100):
        x,y = rng.uniform(32.8,37),rng.uniform(11,27)
        if i < 25:
            x,y = rng.uniform(24,32),rng.uniform(7.2,10.5)
        chip = box('坍塌对应碎石', (x,y,.27), (rng.uniform(.18,.8),rng.uniform(.2,1.1),rng.uniform(.12,.45)), rubble, .04)
        chip.rotation_euler = (rng.uniform(-.3,.3),rng.uniform(-.3,.3),rng.uniform(0,math.tau))
    for i in range(6):
        x,y = rng.uniform(33.8,36.5),rng.uniform(11,22)
        metal = box('掉落屋面板', (x,y,.4), (rng.uniform(.7,1.3),rng.uniform(1.5,2.5),.10), rust)
        metal.rotation_euler = (.10,.17,rng.uniform(-1,1))

    # 路面裂缝有分叉，杂草从缝隙和失养花池生长，不飘浮在铺装上。
    def sprig(x,y,z=.27):
        for k in range(5):
            angle = k*math.tau/5+rng.random()*.4
            height = rng.uniform(.18,.60)
            coords = [(x-.025,y,z),(x+.025,y,z),(x+math.cos(angle)*.19,y+math.sin(angle)*.19,z+height)]
            mesh = bpy.data.meshes.new('杂草叶片');mesh.from_pydata(coords, [], [(0,1,2)]);mesh.update()
            obj = own(bpy.data.objects.new('石缝杂草',mesh));obj.data.materials.append(weed if k%3 else dead_leaf)

    for i in range(45):
        x,y = rng.uniform(-36,36),rng.uniform(-52,-7)
        angle = rng.uniform(0,math.tau)
        length = rng.uniform(.5,2.4)
        end = (x+math.cos(angle)*length,y+math.sin(angle)*length,.258)
        beam('铺装主裂缝',(x,y,.258),end,.016,crack)
        beam('铺装分叉裂缝',(x+.2,y,.26),(x+.7,y+.45,.26),.012,crack)
        sprig(x,y)
    for i in range(85):
        x = rng.choice((-1,1))*rng.uniform(43,51)
        y = rng.uniform(-47,47)
        sprig(x,y,.18)
    for i in range(25):
        sprig(rng.uniform(-4.5,4.5),rng.uniform(-38.5,-27.5),.81)
    for i in range(12):
        x,y = rng.uniform(-4.4,4.4),rng.uniform(-38.5,-27.5)
        box('喷泉沉积碎片',(x,y,.82),(rng.uniform(.1,.35),.25,.06),dust, .015)
    for x,y,z in ((-16.5,10.5,11.725),(16.5,10.5,7.675),(27.5,10.5,3.625)):
        for offset in (-.23,.23):
            plank = box('破窗封板',(x,y-.16,z+offset),(2.1,.10,.19),boarded)
            plank.rotation_euler.y = .12
    root['state'] = 'abandoned'
    root['cityhallLights'] = []
    root['roofDamage'] = {'wing':'right','floorZ':11.2,'roofBaseZ':14.45,'polygonXY':[value for point in polygon for value in point]}
    return {'state':'abandoned','cavityFloorMeters':11.2,'reference':'01-civic-life-abandoned.png'}
