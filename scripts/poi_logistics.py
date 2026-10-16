"""物流中心：多跨仓库、装卸月台、车辆和集装箱服务场。"""
import math
INFO={'name':'物流中心','footprint':[140,160],'mainBuilding':[70,40],'sheet':'02-infrastructure','landmarks':{'entrance':[0,-64],'warehouse':[-10,24],'loading':[-10,-8],'containers':[49,38]},'treeExclusions':[[35,0,70,65]]}


def truck(q,x,y,color):
    q.box('半挂底架',(x,y,1),(2.5,13.4,.35),q.steel,.06)
    q.box('货箱',(x,y+1.9,2.95),(2.55,10.6,3.2),color,.08)
    q.box('牵引车驾驶室',(x,y-5,2.1),(2.45,3.0,2.5),q.blue,.18)
    q.box('驾驶室风挡',(x,y-6.52,2.8),(2.1,.06,.85),q.glass,.025)
    for side in (-1,1):
        for yy in (-5,-3,3.7,5.0):
            wheel=q.cylinder('卡车轮胎',(x+side*1.2,y+yy,.8),.56,.32,q.tire,20);wheel.rotation_euler.y=math.pi/2
            hub=q.cylinder('卡车轮毂',(x+side*1.4,y+yy,.8),.32,.035,q.chrome,16);hub.rotation_euler.y=math.pi/2
        q.box('货箱尾门',(x,y+7.22,2.8),(2.4,.07,2.9),q.trim,.025)
    for dx in (-.8,.8):q.box('卡车前灯',(x+dx,y-6.57,1.9),(.5,.05,.22),q.white,.03)


def container(q,x,y,index=0):
    col=[q.blue,q.rust,q.roof][index%3]
    q.box('集装箱实体',(x,y,1.55),(2.44,12.2,2.6),col,.05)
    for side in (-1,1):
        for i in range(30):q.box('集装箱波纹筋',(x+side*1.24,y-5.8+i*.4,1.55),(.055,.10,2.45),col,.005)
    for dx in (-.58,.58):
        q.box('集装箱对开门',(x+dx,y-6.13,1.55),(1.12,.08,2.5),col,.015)
        q.beam('门锁杆',(x+dx,y-6.2,.4),(x+dx,y-6.2,2.7),.025,q.chrome)


def pallet(q,x,y,z=.4):
    for dx in (-.5,0,.5):q.box('托盘垫木',(x+dx,y,z),( .12,1.0,.15),q.wood,.01)
    for dy in (-.4,-.2,0,.2,.4):q.box('托盘木板',(x,y+dy,z+.14),(1.2,.15,.08),q.wood,.008)
    q.box('码放物资',(x,y,z+.7),(1.08,.92,1),q.gravel,.025)


def build(q):
    q.site();q.box('物流场站硬地',(0,8,.15),(123,123,.22),q.asphalt,.03)
    x,y,w,d,h=-10,24,70,40,10
    q.box('仓库承台',(x,y,.65),(w+.5,d+.5,1.1),q.concrete,.06)
    q.box('仓库内部地板',(x,y,1.35),(w-.5,d-.5,.2),q.concrete,.02)
    for side in (-1,1):q.box('仓库侧墙',(x+side*w/2,y,5.8),(.35,d,9.5),q.stone,.03)
    q.box('仓库后墙',(x,y+d/2,5.8),(w,.35,9.5),q.stone,.03)
    q.box('月台立面上墙',(x,4,7.9),(w,.35,5.2),q.stone,.03)
    for xx in (-43.8,23.8):q.box('仓库端部实墙',(xx,4,3.0),(2.5,.4,4.5),q.stone,.025)
    for side in (-1,1):
        for yy in range(6,44,3):q.box('仓库侧墙板缝',(x+side*(w/2+.21),yy,5.8),(.025,.035,9.2),q.trim,.005)
    for i in range(6):
        bx=-40+i*12
        if i<5:
            q.box('仓库门间墙',(bx+5,4,3.0),(6,.35,4.5),q.stone,.03)
        q.box('卸货门洞',(bx,3.8,3.5),(4.4,.25,4.6),q.dark,.02)
        if not(q.abandoned and i==2):
            for j in range(13):q.box('卷帘门板',(bx,3.63,1.45+j*.32),(4.1,.08,.3),q.blue,.012)
        q.box('月台踏板',(bx,2.5,1.35),(4.8,2.5,.35),q.concrete,.04)
        for dx in (-2.1,2.1):q.box('月台防撞胶',(bx+dx,1.25,.9),(.3,.25,1),q.tire,.03)
        q.text(str(i+1).zfill(2),bx,3.52,6.3,.65)
        q.box('装卸口灯',(bx,3.5,6.0),(1.5,.15,.08),q.lamp,.015);q.light(bx,1.9,5.9,150,16)
    for cx in (-33,-10,13):
        for yy in (9,24,39):
            q.beam('仓库屋架',(cx-11.5,yy,10.6),(cx,yy,13.0),.13,q.steel)
            q.beam('仓库屋架',(cx,yy,13),(cx+11.5,yy,10.6),.13,q.steel)
        for side in (-1,1):
            for j in range(8):
                if q.abandoned and cx==-10 and side==1 and j in (3,4,5):continue
                obj=q.box('仓库屋面分片',(cx+side*5.75,6.5+j*5,11.85),(11.8,4.96,.16),q.roof,.025);obj.rotation_euler.y=side*math.atan2(2.4,11.5)
                for offset in (-1.6,0,1.6):q.beam('屋面立缝',(cx,6.5+j*5+offset,13.1),(cx+side*11.5,6.5+j*5+offset,10.7),.027,q.roof_seam)
        for end in (-1,1):
            verts=[(cx-11.5,24+end*20,10.6),(cx+11.5,24+end*20,10.6),(cx,24+end*20,13)]
            mesh=q.bpy.data.meshes.new('仓库山墙');mesh.from_pydata(verts,[],[(0,1,2) if end<0 else (2,1,0)]);mesh.update();mesh.materials.append(q.stone);q.own(q.bpy.data.objects.new('仓库山墙',mesh))
        roof_window=q.box('仓库采光带基框',(cx-5.75,24,11.98),(4.3,12.3,.12),q.steel,.02);roof_window.rotation_euler.y=-math.atan2(2.4,11.5)
        roof_window=q.box('仓库采光玻璃',(cx-5.75,24,12.05),(4.0,12,.06),q.lit_glass,.015);roof_window.rotation_euler.y=-math.atan2(2.4,11.5)
        q.beam('仓库脊盖',(cx,4,13.2),(cx,44,13.2),.13,q.roof_seam)
    for cx in (-34,-9,15):
        q.box('仓库后场物资',(cx,32,2.6),(5,5,2.4),q.gravel,.04)
    q.building('物流办公楼',-44,-36,25,15,6.2,2)
    q.entrance(-44,-43.7,4.2,2.6)
    q.building('门卫室',13,-58,7,6,3,1)
    for xx in (-45,-33,-21,-9,3,15,25):q.box('装卸通道引导线',(xx,-10,.28),(.10,25,.025),q.white,0)
    for index,(xx,yy) in enumerate(((-40,-7),(-16,-7),(8,-24))):truck(q,xx,yy,q.trim if index!=1 else q.roof)
    for i in range(5):container(q,38+i*4.5,35,i)
    for i in range(12):pallet(q,34+(i%4)*2,6+(i//4)*2)
    # 叉车：轮胎、门架、货叉的可识别实体，纯静态摆件。
    q.box('叉车底盘',(36,-15,.65),(1.5,2.5,.7),q.rust,.1)
    for side in (-1,1):
        q.beam('叉车门架',(36+side*.6,-16.3,.4),(36+side*.6,-16.3,3),.06,q.steel)
        q.box('叉车货叉',(36+side*.5,-17,.3),(.13,1.5,.10),q.steel,.01)
        for yy in (-15.8,-14.2):q.cylinder('叉车轮',(36+side*.75,yy,.4),.35,.2,q.tire,16).rotation_euler.y=math.pi/2
    q.box('入口车道',(0,-57,.26),(9,32,.12),q.paving,.025)
    for x,y in ((-55,-12),(25,-20),(52,5),(24,57)):q.streetlight(x,y,7)
    if q.abandoned:q.rubble(2,21,9,12,30);q.weeds(0,-39,105,20,95)
    q.people([(-43,-46),(11,-57),(-24,-20),(33,-14),(8,-2)])
