"""POI品质样板共用的米制构件与导出流程；只服务独立视觉预览。"""
from pathlib import Path
import math
import random
import time
import json
import bpy
import bmesh
import numpy as np
from mathutils import Vector
from cityhall_abandoned import configure_viewport
ROOT = Path(__file__).resolve().parents[1]

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



def material(name, color, roughness=.8, metal=0, night=0, light_color='#ffe0b1'):
    """昼夜共用PBR材质；发光与灯位通过extras供网页重现。"""
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    mat.diffuse_color=(*rgb(color),1)
    shader=mat.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value=(*rgb(color),1)
    shader.inputs['Roughness'].default_value=roughness
    shader.inputs['Metallic'].default_value=metal
    if night and connected:
        mat['poiNightStrength']=night;mat['poiNightColor']=list(rgb(light_color))
        shader.inputs['Emission Color'].default_value=(*rgb(light_color),1)
    materials[name]=mat
    return mat


def initialize(options, info):
    global source, root, scene, materials, icos, lights, spotlights, abandoned, connected, footprint, asset_info, started
    global stone,trim,brick,paving,asphalt,grass,roof,roof_seam,frame_mat,glass,dark,steel,wood,gravel,bark,tire,chrome,leaf,paint
    global lit_glass,lamp,white,soil,rust,red,blue,concrete
    started=time.monotonic();random.seed(20261017)
    abandoned=options.state=='abandoned';connected=options.state=='connected'
    asset_info=info;footprint=info['footprint'];materials={};icos={};lights=[];spotlights=[]
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.context.preferences.filepaths.save_version=0
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    source=bpy.data.collections.new(info['name']+'_米制可编辑分件');scene.collection.children.link(source)
    root=bpy.data.objects.new(options.asset+'_Quality',None);source.objects.link(root)
    root['units']='meters';root['footprintMeters']=footprint;root['visualOnly']=True;root['qualitySample']=True
    root['poiAsset']=options.asset;root['poiState']=options.state
    root['landmarks']=info['landmarks'];root['referenceSheet']=info['sheet']
    names=['limestone','warm_cream_trim','stone_courses','plaza_paving','asphalt','grass','sage_metal_roof','standing_seam','window_frames','cityhall_glass_dark','recess_shadow','street_metal','bench_wood','planter_gravel','bark','rubber','wheel_and_hardware']+['leaf_'+str(i) for i in range(4)]+['car_paint_'+str(i) for i in range(4)]
    with bpy.data.libraries.load(str(ROOT/'assets/model-preview/cityhall-quality/city-hall.blend'),link=False) as (available,loaded):
        loaded.materials=list(names)
    stone,trim,brick,paving,asphalt,grass,roof,roof_seam,frame_mat,glass,dark,steel,wood,gravel,bark,tire,chrome=[bpy.data.materials[n] for n in names[:17]]
    leaf=[bpy.data.materials['leaf_'+str(i)] for i in range(4)];paint=[bpy.data.materials['car_paint_'+str(i)] for i in range(4)]
    lit_glass=material('poi_window_lit','#798c8c',.27,.15,night=1.2)
    lamp=material('poi_lamp_diffuser','#f2e5c9',.35,night=3.4)
    white=material('poi_marking','#d6d4bc');soil=material('poi_soil','#77735b')
    rust=material('poi_exposed_rust','#76604c',.94);red=material('poi_brick_red','#95755e')
    blue=material('poi_desaturated_blue','#697e84',.55,.12)
    concrete=material('poi_service_concrete','#abae9d',.9)
    if abandoned:
        # 风化派生为已打包的真实PBR图像，离线和GLB读取同一颜色资料。
        for mat in [stone,trim,paving,roof,brick,concrete,steel]:
            shader=mat.node_tree.nodes['Principled BSDF'];base=shader.inputs['Base Color']
            if base.is_linked and base.links[0].from_node.type=='TEX_IMAGE':
                tex=base.links[0].from_node;original=tex.image;w,h=original.size
                rgba=np.empty(w*h*4,dtype=np.float32);original.pixels.foreach_get(rgba);rgba=rgba.reshape(h,w,4)
                rng=np.random.default_rng(42);field=np.zeros((h,w),dtype=np.float32)
                # 多尺度块状噪声平滑插值，避免规律条纹。
                for resolution,weight in [(5,.12),(17,.07),(57,.025)]:
                    small=rng.random((resolution,resolution));grid=np.arange(w)*resolution/w
                    ix=grid.astype(int)%resolution;fx=grid-ix;iy=(np.arange(h)*resolution/h).astype(int)%resolution;fy=np.arange(h)*resolution/h-iy
                    fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
                    top=small[iy[:,None],ix[None,:]]*(1-fx)+small[iy[:,None],(ix+1)[None,:]%resolution]*fx
                    bottom=small[(iy+1)[:,None]%resolution,ix[None,:]]*(1-fx)+small[(iy+1)[:,None]%resolution,(ix+1)[None,:]%resolution]*fx
                    field+=weight*(top*(1-fy[:,None])+bottom*fy[:,None])
                rgba[:,:,:3]*=(.44+field[:,:,None]*1.65)
                rgba[:,:,:3]*=np.array([1.0,.94,.84],dtype=np.float32)
                image=bpy.data.images.new(mat.name+'_abandoned_albedo',width=w,height=h)
                image.colorspace_settings.name=original.colorspace_settings.name
                image.pixels.foreach_set(rgba.ravel());image.pack();tex.image=image
            else:
                color=base.default_value;new=tuple(color[i]*.64 for i in range(3))+(1,)
                base.default_value=new;mat.diffuse_color=new
        root['condition']=['weathered-surfaces','local-structural-damage','unmaintained-grounds']


def window(x,y,z,w=2.0,h=2.2,turn=0,lit=True,broken=False):
    """带窗洞阴影、框、竖梃和窗台的实体窗；z为窗中心。"""
    def part(name,dx,dy,dz,size,mat,bev=.015):
        return box(name,(x+dx*math.cos(turn)-dy*math.sin(turn),y+dx*math.sin(turn)+dy*math.cos(turn),z+dz),size,mat,bev,turn)
    part('窗洞阴影',0,0,0,(w+.22,.14,h+.22),dark)
    if not broken:
        part('玻璃',0,-.09,0,(w-.12,.045,h-.12),lit_glass if lit else glass)
    else:
        # 真实碎片留空窗洞；不以一块完整暗玻璃假装破窗。
        for dx,dz in [(-w*.28,h*.2),(w*.24,-h*.25)]:
            part('残留碎玻璃',dx,-.09,dz,(w*.22,.04,h*.3),glass)
    for dx in (-w/2,w/2):part('窗框',dx,-.13,0,(.10,.16,h+.13),frame_mat)
    for dz in (-h/2,h/2):part('窗框',0,-.13,dz,(w+.1,.16,.10),frame_mat)
    part('中梃',0,-.14,0,(.065,.14,h),frame_mat)
    part('横梃',0,-.14,-h*.12,(w,.14,.055),frame_mat)
    part('窗台',0,-.19,-h/2-.12,(w+.3,.46,.14),trim,.025)


def building(name,x,y,w,d,h,floors=2,spacing=3.7,windows=True,flat=True):
    """普通公共建筑的壳体：四面立面、楼层线脚和屋顶设备。"""
    before=set(source.objects)
    box(name+'_基础',(x,y,.36),(w+.5,d+.5,.6),brick,.07)
    if abandoned:
        # 废弃楼体保留真实墙壳/楼板，坍塌后能看到内部层次而非实心方块。
        for side in (-1,1):
            box(name+'_纵墙',(x+side*(w/2-.23),y,h/2+.55),(.46,d,h),stone,.035)
            box(name+'_横墙',(x,y+side*(d/2-.23),h/2+.55),(w,.46,h),stone,.035)
        for level in range(floors):
            box(name+'_室内楼板',(x,y,.55+level*h/floors),(w-.6,d-.6,.24),concrete,.025)
        for px in np.arange(x-w/2+8,x+w/2-3,8):
            box(name+'_内部承重墙',(float(px),y,h/2+.55),(.22,d-.6,h),concrete,.02)
    else:
        box(name+'_楼体',(x,y,h/2+.55),(w,d,h),stone,.06)
    for z in [.65]+[.55+h*i/floors for i in range(1,floors+1)]:
        box(name+'_楼层线脚',(x,y,z),(w+.3,d+.3,.19),trim,.025)
    if windows:
        for level in range(floors):
            z=.55+(level+.52)*h/floors
            count=max(1,int((w-2)/spacing));step=(w-2)/count
            for i in range(count):
                wx=x-w/2+1+step*(i+.5)
                for side in (-1,1):window(wx,y+side*(d/2+.06),z,w=min(2.3,step-.7),h=min(2.5,h/floors-1),turn=0 if side<0 else math.pi,lit=(i+level)%4!=0,broken=abandoned and (i+level*3)%11==1)
            count=max(1,int((d-2)/spacing));step=(d-2)/count
            for i in range(count):
                wy=y-d/2+1+step*(i+.5)
                for side in (-1,1):window(x+side*(w/2+.06),wy,z,w=min(2.3,step-.7),h=min(2.5,h/floors-1),turn=-math.pi/2 if side>0 else math.pi/2,lit=(i+level)%3==0,broken=abandoned and (i+level)%9==2)
    if flat:
        box(name+'_屋面',(x,y,h+.66),(w+.5,d+.5,.25),roof,.035)
        for side in (-1,1):
            box(name+'_女儿墙',(x+side*w/2,y,h+.98),(.22,d,.7),trim)
            box(name+'_女儿墙',(x,y+side*d/2,h+.98),(w,.22,.7),trim)
        for dx in (-w*.25,w*.25):
            box('屋顶空调基座',(x+dx,y+1,h+.95),(2.4,2.2,.3),dark)
            box('屋顶空调',(x+dx,y+1,h+1.6),(2,1.8,1.1),concrete,.07)
            for k in range(5):box('空调散热格栅',(x+dx-.7+k*.35,y+.06,h+1.6),(.06,.04,.8),steel,.005)
    if abandoned:
        stains=max(4,int(w/5))
        for i in range(stains):
            px=x-w*.42+i*w*.84/(stains-1)
            box('立面风化水痕',(px,y-d/2-.014,h*.6),(.24+random.random()*.6,.018,h*.5+random.random()),soil,0)

    for obj in set(source.objects)-before:obj['poiStructure']=name


def entrance(x,y,w=5,h=3.3):
    box('入口退台',(x,y,.45),(w+2,3,.7),paving,.035)
    for i in range(3):box('入口台阶',(x,y-1.5-i*.35,.12+i*.1),(w+2,.4,.18),trim,.02)
    for dx in (-w*.25,w*.25):window(x+dx,y+.16,h/2+.65,w=w*.46,h=h,lit=True)
    box('入口雨棚',(x,y-.7,h+1.15),(w+2.4,3.6,.25),trim,.06)
    box('雨棚下灯带',(x,y-1.7,h+.99),(w*.7,.18,.06),lamp,.01)
    light(x,y-1.4,h+.75,130,11)


def light(x,y,z,power=120,reach=13):
    if connected:lights.append([x,z,-y,power,reach])


def spot(x,y,z,tx,ty,tz,power=6000,reach=120,angle=.64):
    """场灯朝功能区域照射，位置/朝向供网页与Cycles共同使用。"""
    if connected:spotlights.append([x,z,-y,tx,tz,-ty,power,reach,angle])


def streetlight(x,y,height=5.5):
    cylinder('路灯底座',(x,y,.3),.25,.5,steel)
    cylinder('路灯柱',(x,y,height/2),.075,height,steel,12)
    box('灯臂',(x+.45,y,height),(.95,.1,.1),steel)
    box('灯罩',(x+.8,y,height-.08),(.7,.35,.16),steel,.04)
    box('灯罩扩散板',(x+.8,y,height-.18),(.55,.27,.05),lamp,.015)
    light(x+.8,y,height-.23,160,17)


def bench(x,y,turn=0):
    for z,depth in ((.55,.48),(1.0,.1)):
        box('长椅木条',(x,y+(0 if z<.6 else .22),z),(2.1,depth,.1 if z<.6 else .65),wood,.025,turn)
    for dx in (-.8,.8):box('长椅脚',(x+dx,y,.32),(.08,.45,.5),steel,.02)


def text(text,x,y,z,size=.8,mat=None):
    curve=bpy.data.curves.new('设施标识','FONT');curve.body=text;curve.align_x='CENTER';curve.align_y='CENTER';curve.size=size;curve.extrude=.008
    obj=own(bpy.data.objects.new('标识_'+text,curve));obj.location=(x,y,z);obj.rotation_euler=(math.pi/2,0,0);curve.materials.append(mat or steel)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH')


def fence(x1,y1,x2,y2,height=1.9):
    distance=math.hypot(x2-x1,y2-y1);count=max(1,math.ceil(distance/3))
    for i in range(count+1):
        t=i/count;cylinder('围栏立柱',(x1+(x2-x1)*t,y1+(y2-y1)*t,height/2+.2),.055,height,steel,8)
    for z in (.55,height):beam('围栏横杆',(x1,y1,z),(x2,y2,z),.035,steel)
    # 立杆细网格，保留透空；避免不透明围墙误导。
    for i in range(int(distance/.35)):
        t=i*.35/distance
        beam('围栏竖丝',(x1+(x2-x1)*t,y1+(y2-y1)*t,.35),(x1+(x2-x1)*t,y1+(y2-y1)*t,height),.009,steel)


def weeds(x,y,w,d,count=25):
    if not abandoned:return
    for i in range(count):
        px=x+random.uniform(-w/2,w/2);py=y+random.uniform(-d/2,d/2)
        for j in range(3):beam('自生杂草',(px,py,.15),(px+random.uniform(-.13,.13),py+random.uniform(-.13,.13),random.uniform(.28,.65)),.018,leaf[j])


def rubble(x,y,w=6,d=5,count=22):
    for i in range(count):
        obj=box('对应塌落碎块',(x+random.uniform(-w/2,w/2),y+random.uniform(-d/2,d/2),random.uniform(.18,.5)),(random.uniform(.2,.9),random.uniform(.25,1),random.uniform(.12,.4)),concrete,.03,random.random()*3)
        obj.rotation_euler.x=random.uniform(-.3,.3)


def people(points):
    if not connected:return
    skin=material('poi_skin','#b49b80');jacket=material('poi_workwear','#6b817e')
    for x,y in points:
        cylinder('人物头部',(x,y,1.7),.13,.23,skin,12);cylinder('人物躯干',(x,y,1.2),.19,.55,jacket,10)
        for side in (-1,1):
            beam('人物腿',(x+side*.1,y,.25),(x+side*.1,y,.96),.065,dark)
            beam('人物手臂',(x+side*.2,y,1.42),(x+side*.25,y+.1,1),.06,jacket)


def site():
    w,d=footprint
    box('园区米制底板',(0,0,-.3),(w,d,.6),concrete,.12)
    box('园区地表',(0,0,.025),(w-.5,d-.5,.12),grass,.02)
    box('临街车行道',(0,-d/2+3.8,.13),(w,7.2,.2),asphalt,.025)
    box('临街人行道',(0,-d/2+9.4,.15),(w,3.5,.2),paving,.025)
    for x in np.arange(-w/2+2,w/2,7):box('临街虚线',(float(x),-d/2+3.8,.245),(3,.12,.02),white,0)
    for y in (-d/2+7.5,-d/2+11.2):box('临街路缘',(0,y,.24),(w,.22,.25),trim,.025)
    for x in np.arange(-w/2+7,w/2,16):
        tree(float(x),d/2-6,7.2)
    for x in (-w/2+4,w/2-4):
        for y in np.arange(-d/2+18,d/2-8,23):
            if not any(a<=x<=c and b<=y<=e for a,b,c,e in asset_info.get('treeExclusions',[])):tree(x,float(y),7.5)
    for x in np.arange(-w/2+12,w/2,24):streetlight(float(x),-d/2+10.8)
    fence(-w/2+1,-d/2+12,-w/2+1,d/2-1);fence(w/2-1,-d/2+12,w/2-1,d/2-1)
    fence(-w/2+1,d/2-1,w/2-1,d/2-1)


def finish(options):
    """保存分件源文件，导出固化副本，再以同一镜头渲染昼夜。"""
    if abandoned:
        from poi_damage import apply
        apply(__import__(__name__),options.asset)
    out=ROOT/'assets/model-preview'/(options.asset+'-quality');out.mkdir(parents=True,exist_ok=True);(out/'renders').mkdir(exist_ok=True)
    stem=options.asset+'-'+options.state
    root['poiLights']=lights;root['poiSpotLights']=spotlights;root['poiLightColor']=asset_info.get('lightColor','#ffe0b1')
    root['mainBuildingMeters']=asset_info.get('mainBuilding',[0,0])
    scene.world=bpy.data.worlds.new('POI环境');scene.world.use_nodes=True;bg=scene.world.node_tree.nodes['Background']
    bg.inputs[0].default_value=(.78,.84,.87,1);bg.inputs[1].default_value=.55
    bpy.ops.object.light_add(type='SUN',location=(-60,-80,120));sun=bpy.context.object;sun.name='柔和日光'
    sun.rotation_euler=(math.radians(28),math.radians(-24),math.radians(-30));sun.data.energy=3;sun.data.color=(1,.95,.86);sun.data.angle=math.radians(10)
    extent=max(footprint);target=Vector((0,0,asset_info.get('cameraHeight',4)))
    bpy.ops.object.camera_add(location=(extent*.95,-extent*1.15,extent*1.05));camera=bpy.context.object
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=extent*1.4;scene.camera=camera
    scene.render.engine='CYCLES';scene.cycles.samples=options.samples;scene.cycles.use_denoising=True
    scene.render.resolution_x=options.size;scene.render.resolution_y=round(options.size*.8);scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.35
    configure_viewport(scene)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=extent*1.35
    bpy.ops.wm.save_as_mainfile(filepath=str(out/(stem+'.blend')))
    export=bpy.data.collections.new('GLB_合批副本');scene.collection.children.link(export)
    deps=bpy.context.evaluated_depsgraph_get();batches={}
    for original in list(source.objects):
        if original.type!='MESH':continue
        mesh=bpy.data.meshes.new_from_object(original.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
        obj=bpy.data.objects.new(original.name,mesh);obj.matrix_world=original.matrix_world.copy();export.objects.link(obj)
        batches.setdefault(original.data.materials[0].name,[]).append(obj)
    export_root=bpy.data.objects.new(options.asset+'_Quality',None);export.objects.link(export_root)
    for key in root.keys():export_root[key]=root[key]
    for objects in batches.values():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].parent=export_root;objects[0].name='材质批次_'+objects[0].data.materials[0].name
    bpy.ops.object.select_all(action='DESELECT')
    for obj in export.objects:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out/(stem+'.glb')),export_format='GLB',use_selection=True,export_extras=True,export_apply=False,export_lights=False,export_cameras=False)
    triangles=0
    for obj in export.objects:
        if obj.type=='MESH':obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
    stats={'asset':options.asset,'state':options.state,'units':'meters','footprint':footprint,'sourceObjects':len(source.objects),'materials':len(batches),'triangles':triangles,'glbBytes':(out/(stem+'.glb')).stat().st_size,'nightLights':len(lights),'nightSpotLights':len(spotlights),'blender':bpy.app.version_string,'elapsedSeconds':round(time.monotonic()-started,1)}
    (out/(stem+'-build-info.json')).write_text(json.dumps(stats,ensure_ascii=False,indent=2)+'\n')
    print('POI_BUILD',json.dumps(stats),flush=True);export.hide_render=True
    if options.render:
        scene.render.filepath=str(out/'renders'/(stem+'-day.png'));bpy.ops.render.render(write_still=True)
        bg.inputs[0].default_value=(.12,.21,.31,1);bg.inputs[1].default_value=.40;sun.data.energy=.40;sun.data.color=(.55,.70,1)
        for mat in materials.values():
            if mat.get('poiNightStrength'):mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=mat['poiNightStrength']
        for x,z,ny,power,reach in lights:
            bpy.ops.object.light_add(type='POINT',location=(x,-ny,z));point=bpy.context.object
            point.data.energy=power*5;point.data.color=rgb(asset_info.get('lightColor','#ffe0b1'));point.data.shadow_soft_size=.5
        for x,z,ny,tx,tz,nty,power,reach,angle in spotlights:
            bpy.ops.object.light_add(type='SPOT',location=(x,-ny,z));point=bpy.context.object
            point.data.energy=power*5;point.data.color=rgb(asset_info.get('lightColor','#ffe0b1'));point.data.shadow_soft_size=.5
            point.data.spot_size=angle*2;point.data.spot_blend=.5;point.rotation_euler=(Vector((tx,-nty,tz))-point.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(out/'renders'/(stem+'-night.png'));bpy.ops.render.render(write_still=True)
    print('POI_DONE',stem,round(time.monotonic()-started,1),flush=True)
