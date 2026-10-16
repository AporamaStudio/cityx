"""孤立避难所的局部失养与破损；大厅保持可居住，不影响接通版材质。"""
import math
import random

import bpy
import numpy as np


def apply_shelter_weathering(source, root, own, box, beam, material, rgb):
    rng = random.Random(816)
    original = list(source.objects)
    aged = {}
    wanted = {'limestone', 'warm_cream_trim', 'plaza_paving', 'sage_metal_roof', 'standing_seam'}
    for obj in original:
        if obj.type != 'MESH':
            continue
        for slot in obj.material_slots:
            base = slot.material
            if base.name not in wanted:
                continue
            if base.name not in aged:
                mat = base.copy();mat.name = 'weathered_shelter_' + base.name
                shader = mat.node_tree.nodes['Principled BSDF']
                shader.inputs['Roughness'].default_value = .92
                textures = [n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and n.image.name.endswith('_albedo')]
                for node in textures:
                    image = node.image
                    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(image.size[1], image.size[0], 4)
                    # 多尺度平滑随机斑块，不用周期条纹，避免铺装像波浪大理石。
                    noise = np.random.default_rng(816+len(aged))
                    fields=[]
                    for cells in (7,23):
                        grid=noise.random((cells+1,cells+1));grid[-1,:]=grid[0,:];grid[:,-1]=grid[:,0]
                        gx=np.linspace(0,cells,image.size[0],endpoint=False);gy=np.linspace(0,cells,image.size[1],endpoint=False)
                        rows=np.array([np.interp(gx,np.arange(cells+1),row) for row in grid])
                        fields.append(np.array([np.interp(gy,np.arange(cells+1),column) for column in rows.T]).T)
                    mask = np.clip((fields[0]-.45)*.40,0,.18)+fields[1]*.035
                    pixels[:,:,:3] *= (1-mask[:,:,None])
                    pixels[:,:,:3] = pixels[:,:,:3]*.97+np.array(rgb('#86775b'))[None,None,:]*mask[:,:,None]*.12
                    worn = image.copy();worn.name = 'weathered_shelter_'+image.name
                    worn.pixels.foreach_set(pixels.ravel());worn.pack();node.image = worn
                if not textures:
                    color = shader.inputs['Base Color'].default_value
                    for axis in range(3):
                        color[axis] *= .88
                aged[base.name] = mat
            slot.material = aged[base.name]
        if obj.name.startswith('四坡金属屋顶'):
            uv = obj.data.uv_layers.new(name='米制风化屋面UV')
            for loop in obj.data.loops:
                co = obj.data.vertices[loop.vertex_index].co
                uv.data[loop.index].uv = (co.x/8,co.y/8)

    chip = material('shelter_exposed_masonry','#8f8874',.98)
    damp = material('shelter_damp_streak','#8b8c74',.98)
    crack = material('shelter_surface_cracks','#535b50',1)
    roof_stain = material('shelter_roof_watermarks','#6e7c66',.95,.15)

    def patch(name, verts, mat):
        mesh = bpy.data.meshes.new(name);mesh.from_pydata(verts,[],[tuple(range(len(verts)))]);mesh.update()
        obj = own(bpy.data.objects.new(name,mesh));mesh.materials.append(mat)
        return obj

    # 屋面仍沿用原米制颜色，以贴合坡面的局部污斑表达风化，保证GLB和离线一致。
    for x,y in ((-13,4.1),(-8,4.3),(-2,4.0),(5,4.2),(10,4.5),(-7,10.5),(3,10.4)):
        points=[(x-.38,y-.6),(x+.42,y-.5),(x+.29,y+.7),(x-.10,y+1.1),(x-.35,y+.4)]
        verts=[(px,py,8+2.5*min((17.3-abs(px+3))/11.8,1-abs(py-13)/11.8)+.025) for px,py in points]
        patch('坡面局部水斑',verts,roof_stain)

    # 失养最明显处在窗台下和墙脚；不覆盖发光窗或原门头。
    for x in (-19.5,-16.2,-12.9,6.9,10.2,13.5):
        patch('柱脚剥落抹灰',[(x-.24,1.989,.78),(x+.20,1.989,.78),(x+.27,1.989,1.6),
              (x+.08,1.989,1.88),(x-.17,1.989,1.66),(x-.25,1.989,1.21)],chip)
        for j in range(3):
            z=2.1+j*.32
            patch('窗台下方水渍',[(x-.17+j*.06,1.984,z),(x+.05+j*.04,1.984,z),
                  (x+.03+j*.04,1.984,z+.75),(x-.08+j*.06,1.984,z+1.1)],damp)
    for x,y in ((-14,-16),(-9,-18),(-2,-21)):
        points=[(x,y,.282),(x+.45,y+.3,.283),(x+.75,y+.10,.282),(x+1.2,y+.6,.282)]
        for a,b in zip(points,points[1:]):
            beam('失养铺装裂纹',a,b,.017,crack)

    # 两扇未点亮的玻璃保留锯齿状残片，后方暗层仍在，发光窗不打碎。
    for obj in original:
        if not obj.name.startswith('凹入玻璃') or obj.data.materials[0].name != 'cityhall_glass_dark':
            continue
        if abs(obj.location.y-2.18) > .01 or not any(abs(obj.location.x-x)<.01 for x in (-14.55,1.95)):
            continue
        w,h=.925,1.075
        vertices=[(-w,-.035,-h),(-w,-.035,h),(-.26,-.035,h),(-.48,-.035,.36),(-.31,-.035,-.15),(-.64,-.035,-h),
                  (w,-.035,-h),(w,-.035,h),(.62,-.035,h),(.38,-.035,.62),(.60,-.035,.14),(.49,-.035,-h)]
        mesh=bpy.data.meshes.new('锯齿状玻璃残片');mesh.from_pydata(vertices,[],[(5,4,3,2,1,0),(11,10,9,8,7,6)]);mesh.update()
        mesh.materials.append(obj.data.materials[0]);obj.data=mesh
        obj.name='未点亮破窗_保留残片'

    # 配楼屋顶边缘小范围真实缺角，主大厅屋面不坍塌。
    cutter=box('临时缺角切割体',(22.3,3.5,5.6),(1.4,3.2,1.6),chip,0)
    targets=[o for o in original if o.name.startswith(('配楼平屋顶','配楼防水层')) or o.name.startswith('配楼女儿墙') and o.location.x>20]
    bpy.context.view_layer.update()
    for obj in targets:
        bpy.context.view_layer.objects.active=obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        modifier=obj.modifiers.new('局部女儿墙缺角','BOOLEAN');modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    for i in range(16):
        obj=box('配楼落地碎片',(23+rng.random()*1.1,2.5+rng.random()*3,.18+rng.random()*.06),
                (rng.uniform(.16,.4),rng.uniform(.15,.5),rng.uniform(.10,.25)),chip,.01,turn=rng.uniform(-math.pi,math.pi))
        obj.rotation_euler.x=rng.uniform(-.3,.3)
    root['shelterCondition']=['stained-surfaces','broken-unlit-windows','chipped-wing-parapet']
