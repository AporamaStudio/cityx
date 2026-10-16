"""独立运动场：缩编跑道、练习足球场、小看台与篮球场。"""
import math
from poi_school import court
INFO={'name':'操场','footprint':[160,120],'mainBuilding':[65,8],'sheet':'01-civic-life','landmarks':{'entrance':[0,-43],'track':[-10,12],'stands':[-10,45],'court':[65,-11]},'lightColor':'#e5eddc'}


def loop_points(radius,z=.27):
    points=[]
    for side in (1,-1):
        cx=-10+side*30
        for i in range(65):
            a=-math.pi/2+math.pi*i/64 if side==1 else math.pi/2+math.pi*i/64
            points.append((cx+radius*math.cos(a),12+radius*math.sin(a),z))
    return points


def build(q):
    q.site()
    track=q.material('athletics_ochre_track','#aa7964' if not q.abandoned else '#8d7963',.96)
    turf=q.material('athletics_playing_turf','#829367' if not q.abandoned else '#8e8d6c',.96)
    edge=loop_points(27.2,.17);verts=[(-10,12,.17)]+edge;count=len(edge)
    mesh=q.bpy.data.meshes.new('贴合跑道的地表');mesh.from_pydata(verts,[],[(0,i+1,(i+1)%count+1) for i in range(count)]);mesh.update();mesh.materials.append(turf);q.own(q.bpy.data.objects.new('椭圆场地',mesh))
    # 真实跑道环带，内场保持开放；本场为游戏缩编练习跑道，不标标准400m。
    for lane in range(6):
        inner=20+lane*1.15;outer=inner+1.13;a=loop_points(inner);b=loop_points(outer)
        verts=a+b;n=len(a);faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        mesh=q.bpy.data.meshes.new('跑道环带');mesh.from_pydata(verts,[],faces);mesh.update()
        obj=q.own(q.bpy.data.objects.new('第'+str(lane+1)+'跑道',mesh));mesh.materials.append(track)
        pts=loop_points(inner,.295)
        for i,p in enumerate(pts):q.beam('跑道分道线',p,pts[(i+1)%len(pts)],.035,q.white)
    for i in range(7):
        q.box('起跑线',(-7+i*1.3,-12,.30),(.09,5.8,.025),q.white,0)
    # 缩编足球练习场及球门、边线、中心圈。
    for side in (-1,1):
        q.box('草坪边线',(-10,12+side*17,.28),(59,.09,.025),q.white,0)
        q.box('草坪端线',(-10+side*29.5,12,.28),(.09,34,.025),q.white,0)
        for dy in (-3,3):q.beam('球门柱',(-10+side*29.1,12+dy,.25),(-10+side*29.1,12+dy,2.65),.06,q.white)
        q.beam('球门横梁',(-10+side*29.1,9,2.65),(-10+side*29.1,15,2.65),.06,q.white)
        for dy in (-8,8):q.box('禁区横线',(-10+side*24.5,12+dy,.29),(10,.08,.02),q.white,0)
        q.box('禁区竖线',(-10+side*19.5,12,.29),(.08,16,.02),q.white,0)
        # 透空球网几何，夜晚仍能从轮廓辨认。
        for dy in range(-3,4):q.beam('球网',(-10+side*29.1,12+dy,2.65),(-10+side*30.5,12+dy,.3),.012,q.white)
    q.box('中场线',(-10,12,.28),(.09,34,.025),q.white,0)
    for i in range(72):
        a=i*math.tau/72;b=(i+1)*math.tau/72
        q.beam('中圈',(-10+5*math.cos(a),12+5*math.sin(a),.3),(-10+5*math.cos(b),12+5*math.sin(b),.3),.035,q.white)
    # 五排矮看台、柱梁、遮雨棚；不做巨大体育场。
    for row in range(5):
        q.box('看台阶梯',(-10,43+row*.95,.35+row*.24),(65,.95,.5+row*.48),q.concrete,.03)
        for col in range(36):
            if q.abandoned and (col+row*3)%13==2:continue
            seat=q.box('看台座板',(-40+col*1.7,43+row*.95,.72+row*.48),(1.4,.5,.14),q.blue,.04)
            q.box('看台椅背',(-40+col*1.7,43.3+row*.95,1.0+row*.48),(1.4,.12,.5),q.blue,.04)
    for x in (-40,-20,0,20):
        q.beam('看台雨棚柱',(x,48,.3),(x,48,6),.13,q.steel)
        q.beam('看台雨棚梁',(x,48,5.9),(x,41,5.5),.10,q.steel)
    for j in range(13):
        if q.abandoned and j in (9,10):continue
        roof=q.box('看台分片雨棚',(-40+j*5,44.5,5.8),(4.95,8,.12),q.roof,.025);roof.rotation_euler.x=.06
    q.building('更衣服务房',-48,-34,16,9,3.2,1)
    q.entrance(-48,-38.6,4,2.4)
    court(q,65,-11)
    q.box('环场入口步道',(4,-40,.18),(99,4,.22),q.paving,.03)
    q.box('入场通道',(0,-44,.17),(9,11,.2),q.paving,.03)
    q.fence(-73,-29,49,-29,2.1)
    for x,y in ((-66,-20),(46,-20),(-66,40),(46,40)):
        q.cylinder('场灯基座',(x,y,.4),.5,.7,q.concrete)
        q.cylinder('场灯高杆',(x,y,8),.16,16,q.steel,16)
        q.box('场灯横梁',(x,y,16),(3.5,.2,.2),q.steel)
        for dx in (-1.2,-.4,.4,1.2):
            q.box('场灯灯体',(x+dx,y-.15,15.9),(.65,.5,.6),q.steel,.05)
            q.box('场灯扩散板',(x+dx,y-.43,15.8),(.55,.04,.44),q.lamp,.02)
        q.spot(x,y-1,15,-10,12,.3,6500,120,.64)
    for x in (-25,0,25):q.bench(x,-35);q.bed(x,-31,4,2)
    if q.abandoned:
        q.weeds(-10,12,90,45,130);q.weeds(65,-11,15,28,45);q.rubble(11,45,9,5,14)
        # 不规则小片枯草贴近地面，不以整场变色取代失养。
        for x,y in ((-33,8),(-7,22),(17,4),(-41,-8),(8,-10)):
            verts=[(x+math.cos(i*math.tau/9)*(2.2+(i%3)*.6),y+math.sin(i*math.tau/9)*(1.3+(i%2)*.4),.266) for i in range(9)]
            mesh=q.bpy.data.meshes.new('不规则枯草斑');mesh.from_pydata(verts,[],[tuple(range(9))]);mesh.update();mesh.materials.append(q.soil);q.own(q.bpy.data.objects.new('草坪失养斑块',mesh))
    q.people([(-7,-38),(-12,-35),(1,11),(-18,17),(65,-9),(67,-12)])


def damage(q,d):
    """看台局部垮塌、跑道失养；保留开放运动场的原有身份。"""
    d.cut(q,'东段看台与雨棚塌毁',(10,45,25,14),.8,prefixes=('看台',))
    d.heap(q,11,44,24,11,1.8,90)
    for x,y,z,angle in ((5,43,2.2,.25),(14,44,1.5,-.16),(18,42,1.0,.4)):
        d.sheet(q,'折落看台雨棚',(x,y,z),(7.5,6),(.12,angle,.18),True)
    q.beam('看台弯折立柱',(0,48,.3),(2,47,3.5),.13,q.rust)
    q.beam('看台坠落横梁',(2,47,3.5),(12,42,1.2),.12,q.rust)
    d.broken_wall(q,'看台碎裂混凝土挡沿',9,41,21,1.3)
    # 跑道表面和场地有局部泥土/裂纹，避免整场铺满瓦砾。
    for x,y,w,h in ((-37,-11,18,5),(33,23,11,8),(-9,20,18,12),(-38,8,14,9)):
        d.patch(q,'运动场积尘裸斑',x,y,w,h,.308,q.damage_dry)
        q.weeds(x,y,w,h,25)
    for i in range(6):
        q.beam('跑道裂缝',(-31+i*1.1,-14,.319),(-30+i*.9,-9+i*.25,.319),.025,q.dark)
    d.cut(q,'破损球门',(19,12,4,8),.6,prefixes=('球门','球网'))
    q.beam('倾倒球门横梁',(17,9,.4),(21,14,.8),.065,q.rust)
    d.wall_dirt(q,-48,-38.53,15,2.3)
    d.trash(q,-42,-29,10,5,24);d.trash(q,26,49,10,5,22);d.trash(q,62,-29,6,5,14)
