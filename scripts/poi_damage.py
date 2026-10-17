"""废弃POI的结构坍塌与失养场地；只改样板废弃态，不改完好/接通态。"""
import math
import random
import importlib
import sys
from mathutils import Vector, Euler, Matrix


def patch(q,name,x,y,w,d,z=.285,mat=None):
    """不规则薄地表，集中表达积尘、油污和垃圾堆底色。"""
    ring=[(x+math.cos(i*math.tau/13)*w*.5*random.uniform(.72,1),y+math.sin(i*math.tau/13)*d*.5*random.uniform(.72,1),z) for i in range(13)]
    mesh=q.bpy.data.meshes.new(name);mesh.from_pydata(ring,[],[tuple(range(13))]);mesh.update();mesh.materials.append(mat or q.soil)
    return q.own(q.bpy.data.objects.new(name,mesh))


def cut(q,name,area,bottom,structures=(),prefixes=()):
    """切除大块上层墙体、屋面和附属窗框；源文件保留可编辑布尔工具。"""
    x,y,w,d=area;n=8
    ring=[(x-w*.5,y-d*.47),(x-w*.18,y-d*.54),(x+w*.48,y-d*.5),(x+w*.54,y-d*.12),(x+w*.48,y+d*.5),(x+w*.13,y+d*.55),(x-w*.52,y+d*.47),(x-w*.47,y+d*.10)]
    verts=[(px,py,z) for z in (bottom,65) for px,py in ring]
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=q.bpy.data.meshes.new(name+'_切除体');mesh.from_pydata(verts,[],faces);mesh.update()
    tool=q.bpy.data.objects.new(name+'_隐藏坍塌工具',mesh);q.scene.collection.objects.link(tool);tool.hide_render=True;tool.hide_set(True)
    q.bpy.context.view_layer.update()
    for obj in list(q.source.objects):
        if obj.type!='MESH' or obj.name.startswith(('树','分层树冠','细分叶簇','灌木','自生杂草')):continue
        if structures or prefixes:
            if obj.get('poiStructure') not in structures and not any(obj.name.startswith(p) for p in prefixes):continue
        corners=[obj.matrix_world@Vector(v) for v in obj.bound_box]
        if max(v.z for v in corners)<bottom or max(v.x for v in corners)<x-w*.55 or min(v.x for v in corners)>x+w*.55 or max(v.y for v in corners)<y-d*.56 or min(v.y for v in corners)>y+d*.56:continue
        mod=obj.modifiers.new(name+'_真实结构缺失','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=tool
    return tool


def sheet(q,name,center,size,angles,metal=False):
    """成组折落板片，板面和立缝一起倾斜，避免悬空整齐屋面。"""
    w,d=size;before=set(q.source.objects)
    q.box(name,(0,0,0),(w,d,.11 if metal else .25),q.roof if metal else q.concrete,.025)
    if metal:
        for x in range(max(2,int(w/.65))):
            q.box('塌落板立缝',(-w/2+.3+x*.65,0,.08),(.045,d,.12),q.rust,.006)
    else:
        for dx in (-w*.28,w*.28):q.beam('断板外露钢筋',(dx,-d/2-.4,0),(dx,d/2+.4,0),.025,q.rust)
    matrix=Matrix.Translation(Vector(center))@Euler(angles,'XYZ').to_matrix().to_4x4()
    for obj in set(q.source.objects)-before:obj.matrix_world=matrix@obj.matrix_basis


def heap(q,x,y,w,d,height=2.0,count=60,base=.2):
    """塌落位置堆成有体积的碎砖/楼板，不把废墟铺成均匀小方块。"""
    patch(q,'坍塌积尘',x,y,w*1.3,d*1.3,base+.02,q.damage_soot)
    n=18;ring=[(math.cos(i*math.tau/n)*w*.48*random.uniform(.85,1),math.sin(i*math.tau/n)*d*.48*random.uniform(.85,1)) for i in range(n)]
    verts=[(x+dx,y+dy,base+.02) for dx,dy in ring]+[(x+dx*.5,y+dy*.5,base+height*random.uniform(.42,.62)) for dx,dy in ring]+[(x,y,base+height*.72)]
    faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]+[(i+n,(i+1)%n+n,n*2) for i in range(n)]
    mesh=q.bpy.data.meshes.new('瓦砾堆承托体');mesh.from_pydata(verts,[],faces);mesh.update();mesh.materials.append(q.gravel);q.own(q.bpy.data.objects.new('混合碎石堆积层',mesh))
    for i in range(count):
        dx=random.uniform(-w/2,w/2);dy=random.uniform(-d/2,d/2)
        mound=max(.08,1-(dx/(w*.58))**2-(dy/(d*.58))**2)
        z=base+height*mound*random.uniform(.48,.78)
        obj=q.own(q.bpy.data.objects.new('碎砖混凝土堆',q.crown_mesh(0,q.concrete if i%3 else q.red)))
        obj.location=(x+dx,y+dy,z);obj.scale=(random.uniform(.25,1.1),random.uniform(.25,.95),random.uniform(.15,.5));obj.rotation_euler=(random.random(),random.random(),random.random()*math.tau)
    for i in range(6):
        cx=x+random.uniform(-w*.28,w*.28);cy=y+random.uniform(-d*.28,d*.28)
        sheet(q,'坠落破楼板',(cx,cy,base+random.uniform(.4,height*.8)),(random.uniform(1.7,3.7),random.uniform(1.4,2.8)),(random.uniform(-.4,.4),random.uniform(-.5,.5),random.uniform(-2,2)))
    q.weeds(x,y,w*1.15,d*1.15,25)


def trash(q,x,y,w=8,d=5,count=16):
    """垃圾袋、破箱、纸片、轮胎按现实尺寸聚集在失养角落。"""
    patch(q,'垃圾堆积污痕',x,y,w*1.15,d*1.2,.30,q.damage_soot)
    for i in range(count):
        px=x+random.uniform(-w*.45,w*.45);py=y+random.uniform(-d*.45,d*.45)
        if i%4==0:
            obj=q.own(q.bpy.data.objects.new('扎口垃圾袋',q.crown_mesh(1,q.damage_bag)));obj.location=(px,py,.5);obj.scale=(.31,.26,.4)
            q.cylinder('垃圾袋扎口',(px,py,.91),.06,.13,q.damage_bag,8)
        elif i%4==1:
            q.box('破纸箱底',(px,py,.48),(.72,.55,.36),q.wood,.015,random.uniform(-1,1))
            flap=q.box('纸箱翻折盖',(px+.3,py,.73),(.32,.57,.035),q.wood,.005);flap.rotation_euler.y=.7
        else:
            paper=q.box('散落纸张包装',(px,py,.33),(.25+random.random()*.3,.20+random.random()*.3,.012),q.trim if i%3 else q.dark,0,random.random()*6);paper.rotation_euler.x=.04
    for i in range(2):
        px=x+random.uniform(-w*.3,w*.3);py=y+random.uniform(-d*.3,d*.3)
        # 圆环真实留孔，区别于实心垃圾块。
        for j in range(16):
            a=j*math.tau/16;b=(j+1)*math.tau/16
            q.beam('废弃轮胎',(px+.3*math.cos(a),py+.3*math.sin(a),.4),(px+.3*math.cos(b),py+.3*math.sin(b),.4),.105,q.tire)
    q.weeds(x,y,w,d,15)


def wall_dirt(q,x,y,w,h=4):
    """墙脚潮污及断续雨痕，避开把整个立面罩成均匀黑色。"""
    for i in range(max(6,int(w/1.7))):
        px=x+random.uniform(-w*.48,w*.48);width=random.uniform(.3,1.4);height=random.uniform(.45,h)
        verts=[(px-width/2,y,.55),(px+width/2,y,.55),(px+width*.42,y,height*.7+.55),(px+width*.1,y,height+.55),(px-width*.38,y,height*.8+.55)]
        mesh=q.bpy.data.meshes.new('墙脚潮污');mesh.from_pydata(verts,[],[(0,1,2,3,4)]);mesh.update();mesh.materials.append(q.damage_soot)
        q.own(q.bpy.data.objects.new('墙脚斑驳雨痕',mesh))



def broken_wall(q,name,x,y,length,height,z=.55,turn=0):
    """保留不规则砖墙断桩；破坏轮廓有高低，而非整齐裁掉整个矩形。"""
    n=9;top=[(-length/2+i*length/(n-1),z+height*random.uniform(.3,1)) for i in range(n)]
    contour=[(-length/2,z),(length/2,z)]+list(reversed(top));m=len(contour)
    verts=[(px,dy,zz) for dy in (-.18,.18) for px,zz in contour]
    faces=[tuple(reversed(range(m))),tuple(range(m,m*2))]+[(i,(i+1)%m,(i+1)%m+m,i+m) for i in range(m)]
    mesh=q.bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();mesh.materials.append(q.red)
    obj=q.own(q.bpy.data.objects.new(name,mesh));obj.location=(x,y,0);obj.rotation_euler.z=turn
    for i in (1,4,7):
        px,zz=top[i];pxw=x+px*math.cos(turn);pyw=y+px*math.sin(turn)
        q.beam('断墙露筋',(pxw,pyw,zz-.3),(pxw+.15,pyw+.1,zz+.5),.022,q.rust)


def school(q):
    # 教学楼一端上两层塌落；主入口和西翼保留，恢复前后位置明确对应。
    cut(q,'教学楼东端坍塌',(24,8,22,19),4.5,('三层教学楼',),('教学立面砖柱',))
    heap(q,24,8,18,12,3.0,85,4.45)
    heap(q,29,-3,14,11,2.4,70)
    sheet(q,'悬垂断楼板',(17,8,7.1),(5,10),(.12,.68,.05))
    for yy in (3,12):q.beam('教学楼断裂钢筋',(14,yy,8.6),(19,yy+.4,7.2),.035,q.rust)
    # 体育馆右后半部连同外墙倒塌，瓦砾与倾斜屋面落在原建筑范围。
    cut(q,'体育馆大段垮塌',(48,17,18,23),2.7)
    heap(q,47,17,17,20,2.6,100,.75)
    for cx,cy,z,rx,ry in [(45,11,3.6,.25,.55),(49,22,2.0,-.24,-.32),(52,14,2.6,.45,.12)]:
        sheet(q,'体育馆坠落屋面',(cx,cy,z),(8,5),(rx,ry,.14),True)
    q.beam('弯折体育馆钢梁',(33,12,7.7),(43,12,4.0),.13,q.rust)
    q.beam('折断下垂钢梁',(43,12,4),(51,13,2.6),.13,q.rust)
    broken_wall(q,'教学楼上层残墙',23,1.12,15,2.6,4.5)
    broken_wall(q,'体育馆垮塌墙根',53.9,18,18,1.8,.65,math.pi/2)
    patch(q,'屋面积尘斑',-8,8,24,10,12.61,q.damage_dust)
    for px,py in ((-24,49),(21,61),(4,49)):patch(q,'失养草地裸斑',px,py,15,9,.232,q.damage_dry)
    wall_dirt(q,-9,.68,44,3.7)
    trash(q,-7,-57,12,6,28);trash(q,-28,-1,11,4,22);trash(q,48,-37,7,9,18)


def apply(q,asset):
    if not q.abandoned:return
    random.seed(2026101701)
    q.damage_soot=q.material('abandoned_soot_damp','#5d594b',.99)
    q.damage_dust=q.material('abandoned_dust','#888674',.99)
    q.damage_dry=q.material('abandoned_dry_ground','#939077',.99)
    q.damage_bag=q.material('abandoned_garbage_bag','#343a32',.82)
    builder=getattr(importlib.import_module('poi_'+asset.replace('-','_')),'damage',None)
    fallback=globals().get(asset.replace('-','_'))
    if builder or fallback:
        if builder:builder(q,sys.modules[__name__])
        else:fallback(q)
        q.root['condition']=['weathered-surfaces','structural-collapse','accumulated-trash','unmaintained-grounds']
        q.root['damageRevision']=2
