"""沿用市政厅米制/PBR/分件pipeline，机械活动部件在导出时单独保留。"""
from pathlib import Path
from types import SimpleNamespace
import math
import json
import time
import random
import bpy
import bmesh
import numpy as np
from mathutils import Vector
import poi_quality as q
from cityhall_abandoned import configure_viewport

ROOT = Path(__file__).resolve().parents[1]
box, cylinder, beam, rgb = q.box, q.cylinder, q.beam, q.rgb


def material(name, color, roughness=.6, metal=0, texture=False, day=0, night=0, weathered=False):
    """原创细颗粒漆面/磨损及法线打包进文件，避免仅Blender有效的程序节点。"""
    mat = q.material(name, color, roughness, metal)
    shader = mat.node_tree.nodes['Principled BSDF']
    if texture:
        n = 256
        rng = np.random.default_rng(73+len(q.materials))
        yy, xx = np.mgrid[0:n, 0:n]
        grain = rng.normal(0, .025, (n, n))
        field = .018*np.sin(xx*.042)*np.cos(yy*.051)
        scratches = (rng.random((n, n))>.995) * .14
        # glTF底色PNG必须存sRGB数值，不能把线性值直接作为sRGB再次解码。
        srgb=np.array([int(color[i:i+2],16)/255 for i in (1,3,5)])
        color_data = np.clip(srgb[None, None, :]*(1+grain[:,:,None]+field[:,:,None])+scratches[:,:,None], 0, 1)
        if weathered:
            stains=(np.sin(xx*.073+np.sin(yy*.021)*2)*np.cos(yy*.057)+np.sin(xx*.019+yy*.027))*.5
            mask=np.clip((stains-.45)*.65,0,.28)[:,:,None]
            color_data=color_data*(1-mask)+np.array([.31,.25,.18])[None,None,:]*mask
            # 有方向的浅划痕与稀疏细小掉漆，避免整个机械铺满随机亮点。
            marks=(np.sin(xx*.12+np.sin(yy*.07))>.996)&(rng.random((n,n))>.7)
            color_data[marks]=srgb*.78+np.array([.18,.15,.11])
        def packed(suffix, pixels, colorspace):
            image = bpy.data.images.new(name+'_'+suffix, width=n, height=n)
            image.colorspace_settings.name = colorspace
            rgba = np.ones((n,n,4), dtype=np.float32); rgba[:,:,:3] = pixels
            image.pixels.foreach_set(rgba.ravel()); image.pack()
            node = mat.node_tree.nodes.new('ShaderNodeTexImage'); node.image = image
            return node
        color_node = packed('albedo', color_data, 'sRGB')
        mat.node_tree.links.new(color_node.outputs['Color'], shader.inputs['Base Color'])
        dx = (np.roll(grain,-1,1)-np.roll(grain,1,1))*.22
        dy = (np.roll(grain,-1,0)-np.roll(grain,1,0))*.22
        normals = np.stack((dx*.5+.5,dy*.5+.5,np.ones((n,n))),axis=2)
        normal_node = packed('normal', normals, 'Non-Color')
        normal = mat.node_tree.nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value=.35
        mat.node_tree.links.new(normal_node.outputs['Color'],normal.inputs['Color'])
        mat.node_tree.links.new(normal.outputs['Normal'],shader.inputs['Normal'])
    if day or night:
        mat['machineryDayEmission'] = day; mat['machineryNightEmission'] = night
        shader.inputs['Emission Color'].default_value = (*rgb(color),1)
        shader.inputs['Emission Strength'].default_value = day
    return mat


def initialize(options, info):
    global scene, root, source, asset_info, started, groups, points, spots, surface, metal, steel, edge, yellow, dark, rubber, ash, glow, white_light, red_light
    started = time.monotonic(); random.seed(20261019); asset_info = info; groups = []; points = []; spots = []
    q.initialize(SimpleNamespace(asset=options.asset,state='connected'),{**info,'landmarks':info['features']})
    scene, root, source = q.scene, q.root, q.source
    for key in ['poiAsset','poiState','landmarks']:
        if key in root: del root[key]
    root['machineryAsset'] = options.asset; root['referenceSheet'] = info['sheet']
    root['siteMeters'] = info['footprint']; root['equipmentMeters'] = info['equipment']
    root['assetRole'] = info['role']; root['visualFeatures'] = info['features']
    root['state'] = 'active-visual-sample'; root['style'] = 'stylized-realistic-mid-poly'
    surface = material('设备浅灰漆面','#87928e',.58,.45,True)
    metal = material('深灰结构钢','#424d50',.48,.66,True)
    steel = material('机械加工不锈钢','#a3afb0',.3,.82,True)
    edge = material('检修面板浅灰','#b8bcb2',.62,.25,True)
    yellow = material('低饱和检修黄','#b29142',.65,.15,True)
    dark = material('凹槽与绝缘件','#202c30',.84)
    rubber = material('黑橡胶','#2b3230',.9,0,True)
    ash = material('厚灰沉积','#9c9987',.98,0,True)
    glow = material('转化核心青白光','#91d4c6',.35,.18,True,day=.8,night=2.2)
    white_light = material('固定LED灯面','#d9eeed',.33,.08,day=.2,night=3.8)
    red_light = material('旧机械敌方光学传感器','#df6035',.3,.1,day=.6,night=2.7)


def mesh(name, vertices, faces, mat, bevel=0):
    data = bpy.data.meshes.new(name); data.from_pydata(vertices,[],faces); data.update()
    obj = q.own(bpy.data.objects.new(name,data)); data.materials.append(mat)
    uv = data.uv_layers.new(name='米制UV')
    for poly in data.polygons:
        axes=(0,1) if abs(poly.normal.z)>.6 else (0,2) if abs(poly.normal.y)>.6 else (1,2)
        for loop in poly.loop_indices:
            co=data.vertices[data.loops[loop].vertex_index].co; uv.data[loop].uv=(co[axes[0]]/4,co[axes[1]]/4)
    if bevel:
        mod=obj.modifiers.new('机械边缘倒角','BEVEL'); mod.width=bevel; mod.segments=2
        obj.modifiers.new('面积加权法线','WEIGHTED_NORMAL')
    return obj


def taper(name, center, bottom, top, height, mat):
    x,y,z=center; w,d=bottom; a,b=top
    return mesh(name,[(x+sx*ww/2,y+sy*dd/2,zz) for ww,dd,zz in [(w,d,z-height/2),(a,b,z+height/2)] for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,.055)


def girder(name, a, b, width, depth, mat):
    delta=Vector(b)-Vector(a)
    obj=box(name,(Vector(a)+Vector(b))/2,(width,depth,delta.length),mat,min(width*.08,.04))
    obj.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    return obj


def pipe(name, path, radius=.1, mat=None):
    # 折点用小球封接，实际管线进入GLB，不靠离线光线假装存在。
    mat=mat or steel
    for a,b in zip(path,path[1:]):beam(name,a,b,radius,mat)
    for point in path[1:-1]:ico(name+'_弯头',point,(radius*1.1,)*3,mat,1)


def ico(name, center, scale, mat, subdivisions=1):
    data=bpy.data.meshes.new(name);bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=subdivisions+1,radius=1)
    bm.to_mesh(data);bm.free();data.materials.append(mat)
    obj=q.own(bpy.data.objects.new(name,data));obj.location=center;obj.scale=scale
    return obj


def ring(name, center, major, minor, mat, segments=48):
    x,y,z=center;verts=[];faces=[]
    for i in range(segments):
        a=i*math.tau/segments
        for j in range(8):
            b=j*math.tau/8;r=major+minor*math.cos(b)
            verts.append((x+r*math.cos(a),y+r*math.sin(a),z+minor*math.sin(b)))
    for i in range(segments):
        for j in range(8):faces.append((i*8+j,((i+1)%segments)*8+j,((i+1)%segments)*8+(j+1)%8,i*8+(j+1)%8))
    return mesh(name,verts,faces,mat)


def bolt(x,y,z,r=.08):
    cylinder('六角螺栓',(x,y,z),r,r*.7,steel,6)


def cabinet(x,y,z,w=1.6,d=.9,h=2.2,turn=0):
    before=set(source.objects)
    box('检修机柜',(x,y,z+h/2),(w,d,h),surface,.055)
    box('机柜凹入门缝',(x,y-d/2-.012,z+h*.5),(w*.84,.035,h*.88),dark,.01)
    box('柜门',(x,y-d/2-.035,z+h*.5),(w*.79,.04,h*.83),edge,.018)
    box('门把手',(x+w*.28,y-d/2-.085,z+h*.5),(.045,.07,.23),steel,.012)
    for zz in range(7):box('机柜通风百叶',(x,y-d/2-.07,z+.22+zz*.055),(w*.55,.04,.018),metal,.004)
    for xx in (-w*.34,w*.34):
        for zz in (.13,h-.13):bolt(x+xx,y,z+zz,.045)
    if turn:
        for obj in set(source.objects)-before:
            px,py=obj.location.x-x,obj.location.y-y
            obj.location.x=x+px*math.cos(turn)-py*math.sin(turn);obj.location.y=y+px*math.sin(turn)+py*math.cos(turn)
            obj.rotation_euler.z+=turn


def railing(a,b,height=1.1):
    va,vb=Vector(a),Vector(b);length=(vb-va).length
    for i in range(max(1,math.ceil(length/1.5))+1):
        p=va.lerp(vb,i/max(1,math.ceil(length/1.5)));beam('安全栏立柱',p,p+Vector((0,0,height)),.035,yellow)
    for z in (.5,height):beam('检修栏扶手',va+Vector((0,0,z)),vb+Vector((0,0,z)),.04,yellow)


def part(name, objects, pivot=(0,0,0)):
    """源文件及GLB保留转塔/炮管/核心等独立枢轴；静态部分只在同枢轴内合批。"""
    group=q.own(bpy.data.objects.new(name,None));group.location=pivot;group['visualPart']=name;groups.append(group)
    for obj in objects:
        obj.parent=group;obj.location-=Vector(pivot)
    return group


def point_light(position, power, reach, color='#b8eee0', day=False):
    x,y,z=position;points.append({'position':[x,z,-y],'power':power,'range':reach,'color':color,'day':day})


def spot_light(position, target, power, reach, angle, color='#deedf1'):
    x,y,z=position;tx,ty,tz=target
    spots.append({'position':[x,z,-y],'target':[tx,tz,-ty],'power':power,'range':reach,'angle':angle,'color':color})


def site(width, depth, polluted=False):
    # 单独的展示地台节点可在接入游戏时移除；20m用地不等于设备铺满20m。
    before=set(source.objects)
    box('展示地台',(0,0,-.19),(width,depth,.36),q.concrete,.1)
    box('场地面层',(0,0,.015),(width-.1,depth-.1,.08),ash if polluted else q.asphalt,.025)
    for x in np.arange(-width/2+1,width/2-1,4):
        box('维护边界虚线',(float(x),-depth/2+1,.065),(2,.1,.015),yellow,0)
    if polluted:
        for i in range(45):
            x=random.uniform(-width/2+.6,width/2-.6);y=random.uniform(-depth/2+.6,depth/2-.6)
            obj=ico('边缘灰堆',(x,y,.07),(random.uniform(.15,.65),random.uniform(.2,.7),random.uniform(.04,.14)),ash)
    part('DisplaySite',set(source.objects)-before)


def finish(options):
    """按活动枢轴和材质导出固化副本，源分件不合并；同模型渲染日/夜/俯视。"""
    out=ROOT/'assets/model-preview'/(options.asset+'-quality');out.mkdir(parents=True,exist_ok=True);(out/'renders').mkdir(exist_ok=True)
    root['machineryLights']=points;root['machinerySpotLights']=spots
    root['runtimeEffectsPending']=['purification-flow-and-sound'] if options.asset=='purification-tower' else []
    root['detachableDisplaySite']='DisplaySite'; root['sweepingSearchlights']=False
    # 直接构造的圆柱/球也须有同名UV，防止按材质合并后出现texCoord=-1。
    for obj in source.objects:
        if obj.type!='MESH':continue
        data=obj.data
        if data.uv_layers:
            data.uv_layers.active.name='米制UV'
        else:
            uv=data.uv_layers.new(name='米制UV')
            for poly in data.polygons:
                axes=(0,1) if abs(poly.normal.z)>.6 else (0,2) if abs(poly.normal.y)>.6 else (1,2)
                for loop in poly.loop_indices:
                    co=data.vertices[data.loops[loop].vertex_index].co
                    uv.data[loop].uv=(co[axes[0]]/4,co[axes[1]]/4)
    world=bpy.data.worlds.new('机械样板环境');world.use_nodes=True;scene.world=world;bg=world.node_tree.nodes['Background']
    bg.inputs[0].default_value=(.72,.81,.87,1);bg.inputs[1].default_value=.65
    bpy.ops.object.light_add(type='SUN',location=(-30,-40,70));sun=bpy.context.object;sun.name='柔和日光';sun.rotation_euler=(.45,-.4,-.5);sun.data.energy=3;sun.data.angle=.15;sun.data.color=(1,.95,.85)
    extent=max(asset_info['footprint']);height=asset_info['equipment'][2];target=Vector((0,0,height*.4))
    bpy.ops.object.camera_add(location=(extent*.9,-extent*1.2,max(height*1.7,extent*.9)));camera=bpy.context.object
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=max(extent*1.32,height*1.65);scene.camera=camera
    scene.render.engine='CYCLES';scene.cycles.samples=options.samples;scene.cycles.use_denoising=True
    scene.render.resolution_x=options.size;scene.render.resolution_y=round(options.size*.8);scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.5
    lamps=[]
    for light in points+spots:
        x,z,ny=light['position'];kind='SPOT' if 'target' in light else 'POINT'
        bpy.ops.object.light_add(type=kind,location=(x,-ny,z));obj=bpy.context.object;obj.name='核心工作光' if light.get('day') else '固定局部照明'
        obj.data.energy=light['power']*5;obj.data.color=rgb(light['color']);obj.data.shadow_soft_size=.4
        if kind=='SPOT':
            tx,tz,nty=light['target'];obj.rotation_euler=(Vector((tx,-nty,tz))-obj.location).to_track_quat('-Z','Y').to_euler();obj.data.spot_size=light['angle']*2;obj.data.spot_blend=.7
        obj.hide_render=not light.get('day',False);lamps.append((obj,light))
    configure_viewport(scene)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':area.spaces.active.region_3d.view_location=target;area.spaces.active.region_3d.view_distance=max(extent,height)*1.5
    bpy.ops.wm.save_as_mainfile(filepath=str(out/(options.asset+'.blend')))
    export=bpy.data.collections.new('GLB_按枢轴与材质合批');scene.collection.children.link(export)
    export_root=bpy.data.objects.new(root.name,None);export.objects.link(export_root)
    for key in root.keys():export_root[key]=root[key]
    pivots={root:export_root}
    for original in groups:
        obj=bpy.data.objects.new(original.name,None);export.objects.link(obj)
        for key in original.keys():obj[key]=original[key]
        pivots[original]=obj
    for original in groups:
        pivots[original].parent=pivots.get(original.parent,export_root)
        pivots[original].matrix_local=original.matrix_local.copy()
    bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get();batches={}
    for original in list(source.objects):
        if original.type!='MESH':continue
        data=bpy.data.meshes.new_from_object(original.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
        obj=bpy.data.objects.new(original.name,data);obj.matrix_world=original.matrix_world.copy();export.objects.link(obj)
        batches.setdefault((original.parent,original.data.materials[0].name),[]).append(obj)
    for (parent,mat),objects in batches.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        obj=objects[0];world_matrix=obj.matrix_world.copy();obj.parent=pivots.get(parent,export_root);obj.matrix_world=world_matrix;obj.name=mat+'_'+obj.parent.name
    bpy.ops.object.select_all(action='DESELECT')
    for obj in export.objects:obj.select_set(True)
    path=out/(options.asset+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_apply=False,export_lights=False,export_cameras=False)
    triangles=0
    for obj in export.objects:
        if obj.type=='MESH':obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
    stats={'asset':options.asset,'units':'meters','footprint':asset_info['footprint'],'equipmentMeters':asset_info['equipment'],'sourceObjects':len(source.objects),'materials':len({mat for parent,mat in batches}),'batches':len(batches),'triangles':triangles,'glbBytes':path.stat().st_size,'pointLights':len(points),'fixedSpotLights':len(spots),'parts':[g.name for g in groups],'blender':bpy.app.version_string,'buildSeconds':round(time.monotonic()-started,1)}
    (out/(options.asset+'-build-info.json')).write_text(json.dumps(stats,ensure_ascii=False,indent=2)+'\n')
    print('MACHINERY_BUILD',json.dumps(stats),flush=True);export.hide_render=True
    if options.render:
        scene.render.filepath=str(out/'renders'/(options.asset+'-day.png'));bpy.ops.render.render(write_still=True)
        # 同一模型、同一材质，夜晚仅改变环境/光源/发光强度。
        bg.inputs[0].default_value=(.13,.22,.34,1);bg.inputs[1].default_value=.45;sun.data.energy=.45;sun.data.color=(.58,.72,1)
        for mat in q.materials.values():
            if 'machineryNightEmission' in mat:mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=mat['machineryNightEmission']
        for obj,light in lamps:obj.hide_render=False
        scene.render.filepath=str(out/'renders'/(options.asset+'-night.png'));bpy.ops.render.render(write_still=True)
        bg.inputs[0].default_value=(.72,.81,.87,1);bg.inputs[1].default_value=.65;sun.data.energy=3;sun.data.color=(1,.95,.85)
        for mat in q.materials.values():
            if 'machineryDayEmission' in mat:mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=mat['machineryDayEmission']
        for obj,light in lamps:obj.hide_render=not light.get('day',False)
        camera.location=(0,0,max(extent,height)*2);camera.rotation_euler=(0,0,0);camera.data.ortho_scale=extent*1.16
        scene.render.filepath=str(out/'renders'/(options.asset+'-top.png'));bpy.ops.render.render(write_still=True)
    print('MACHINERY_DONE',options.asset,round(time.monotonic()-started,1),flush=True)
