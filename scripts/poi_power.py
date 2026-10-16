"""区域发电站：分跨主厂房、检修管道、烟囱与变压站院。"""
import math
INFO={'name':'发电站','footprint':[160,180],'mainBuilding':[70,40],'sheet':'02-infrastructure','cameraHeight':10,'landmarks':{'entrance':[0,-67],'hall':[-15,12],'chimney':[-36,52],'switchyard':[51,12]},'treeExclusions':[[-70,20,-48,58]]}


def pipe(q,points,r=.55):
    for a,b in zip(points,points[1:]):q.beam('工艺管道',a,b,r,q.rust if q.abandoned else q.chrome)
    for p in points:
        q.cylinder('管道支墩',(p[0],p[1],.6),.5,1.0,q.concrete,12)


def chimney(q,x,y):
    colors=[q.trim,q.trim,q.rust,q.trim,q.rust,q.trim,q.rust]
    for i in range(7):
        r0=2.6-i*.13;r1=r0-.13;z=1+i*6
        verts=[(x+r*math.cos(k*math.tau/48),y+r*math.sin(k*math.tau/48),zz) for r,zz in [(r0,z),(r1,z+6)] for k in range(48)]
        faces=[(k,(k+1)%48,(k+1)%48+48,k+48) for k in range(48)]
        mesh=q.bpy.data.meshes.new('烟囱锥段');mesh.from_pydata(verts,[],faces);mesh.update();mesh.materials.append(colors[i]);q.own(q.bpy.data.objects.new('烟囱渐细段',mesh))
    q.cylinder('烟囱黑暗内口',(x,y,42.8),1.6,.12,q.dark,48)
    for i in range(70):q.box('烟囱检修梯',(x+2.65,y,1+i*.56),(.4,.075,.06),q.steel,.005)
    for z in (15,30):
        for i in range(48):
            a=i*math.tau/48;b=(i+1)*math.tau/48
            q.beam('烟囱平台栏杆',(x+2.75*math.cos(a),y+2.75*math.sin(a),z),(x+2.75*math.cos(b),y+2.75*math.sin(b),z),.035,q.steel)


def transformer(q,x,y):
    q.box('变压器基础',(x,y,.4),(6,6,.6),q.concrete,.06)
    q.box('油浸变压器箱',(x,y,2.2),(3.3,3.9,3),q.blue,.14)
    for side in (-1,1):
        for j in range(10):q.box('变压器散热片',(x+side*2.05,y-1.8+j*.4,2.15),(.85,.10,2.7),q.steel,.015)
        q.cylinder('储油箱',(x+side*1.1,y,4.35),.42,3.6,q.steel,24).rotation_euler.x=math.pi/2
    for dx in (-1.0,0,1.0):
        q.cylinder('高压瓷套管',(x+dx,y,4.9),.15,2.1,q.trim,16)
        for z in (4.2,4.5,4.8,5.1,5.4):q.cylinder('绝缘伞裙',(x+dx,y,z),.26,.10,q.trim,16)
    q.light(x,y-4,6,120,14)


def build(q):
    q.site()
    q.box('厂区作业铺装',(0,7,.14),(143,143,.2),q.asphalt,.03)
    q.box('检修环道',(-15,12,.26),(84,55,.10),q.paving,.025)
    x,y,w,d,h=-15,12,70,40,19
    q.box('主厂房基础',(x,y,.5),(w+.5,d+.5,.8),q.brick,.05)
    q.box('主厂房地板',(x,y,.95),(w-1,d-1,.2),q.concrete,.02)
    for side in (-1,1):
        q.box('厂房长立面',(x,y+side*d/2,h/2+.7),(w,.4,h),q.stone,.04)
        q.box('厂房端立面',(x+side*w/2,y,h/2+.7),(.4,d,h),q.stone,.04)
        for dx in range(-30,35,5):
            q.window(x+dx,y+side*(d/2+.1),13,w=4.3,h=3.8,turn=0 if side<0 else math.pi,lit=dx%3!=0,broken=q.abandoned and dx in (-10,15))
            q.box('工业立面竖肋',(x+dx,y+side*(d/2+.28),9.8),(.2,.24,18),q.trim,.015)
        for dy in (-14,-7,0,7,14):
            q.window(x+side*(w/2+.1),y+dy,13,w=4.5,h=3.8,turn=-math.pi/2 if side>0 else math.pi/2,lit=True)
    # 三跨屋面与实体桁架；废弃仅缺一跨局部面板，不掏空所有厂房。
    for bay in range(3):
        cx=x-w/2+(bay+.5)*w/3
        for yy in range(-15,20,10):
            q.beam('主厂房屋架',(cx-w/6,y+yy,h+.6),(cx,y+yy,h+3.2),.16,q.steel)
            q.beam('主厂房屋架',(cx,y+yy,h+3.2),(cx+w/6,y+yy,h+.6),.16,q.steel)
            q.beam('屋架下弦',(cx-w/6,y+yy,h+.6),(cx+w/6,y+yy,h+.6),.12,q.steel)
        for side in (-1,1):
            for j in range(8):
                if q.abandoned and bay==1 and side==1 and j in (2,3,4):continue
                obj=q.box('厂房屋面分片',(cx+side*w/12,y-17.5+j*5,h+1.95),(12.05,4.96,.18),q.roof,.03);obj.rotation_euler.y=side*math.atan2(2.6,w/6)
                for offset in (-1.7,-.6,.6,1.7):q.beam('厂房屋面接缝',(cx,y-17.5+j*5+offset,h+3.3),(cx+side*w/6,y-17.5+j*5+offset,h+.7),.028,q.roof_seam)
        for end in (-1,1):
            verts=[(cx-w/6,y+end*d/2,h+.65),(cx+w/6,y+end*d/2,h+.65),(cx,y+end*d/2,h+3.2)]
            mesh=q.bpy.data.meshes.new('厂房山墙');mesh.from_pydata(verts,[],[(0,1,2) if end<0 else (2,1,0)]);mesh.update();mesh.materials.append(q.stone);q.own(q.bpy.data.objects.new('厂房山墙',mesh))
        q.beam('厂房屋脊',(cx,y-d/2,h+3.4),(cx,y+d/2,h+3.4),.16,q.roof_seam)
    # 可见检修设备：不模拟汽轮机与电力生产。
    for cx in (-35,-10,13):
        q.box('机组基础',(cx,12,1.3),(12,18,.6),q.concrete,.05)
        q.cylinder('机组壳体',(cx,12,4.4),3,12,q.blue,32).rotation_euler.x=math.pi/2
        for yy in (-5,5):q.box('机组支架',(cx,12+yy,2.5),(6,1,2.4),q.steel,.03)
    for xx in (-39,-27,9):
        points=[(xx,-8.5,9),(xx,-11,9)]
        points += [(xx,-11-2*math.sin(i*math.pi/24),7+2*math.cos(i*math.pi/24)) for i in range(1,13)]
        points += [(xx,-13,2.8)]
        points += [(xx,-14.8+1.8*math.cos(i*math.pi/24),2.8-1.8*math.sin(i*math.pi/24)) for i in range(1,13)]
        points += [(xx,-24,1)]
        for a,b in zip(points,points[1:]):
            direction=q.Vector(b)-q.Vector(a);obj=q.cylinder('外露大管圆弧弯头',(q.Vector(a)+q.Vector(b))/2,.62,direction.length,q.rust if q.abandoned else q.chrome,24);obj.rotation_euler=direction.to_track_quat('Z','Y').to_euler()
        q.box('外露管道泵基础',(xx,-24,.5),(2.4,3.4,.8),q.concrete,.06)
        q.box('外露管道泵体',(xx,-24,1.3),(1.4,2.1,1.4),q.blue,.1)
    q.entrance(-15,-8.3,6,3.8)
    q.text('DISTRICT ENERGY',-15,-10.2,5.2,.9)
    chimney(q,-36,52)
    q.building('锅炉辅助间',-5,47,25,14,10,1,spacing=4.5)
    q.building('厂区控制楼',-43,-36,24,14,6.4,2)
    q.entrance(-43,-43.2,4.2,2.6)
    q.building('门卫值班室',-10,-62,9,7,3.2,1)
    for sy in (-1,1):
        pipe(q,[(-50,sy*9+12,5.0),(-55,sy*9+12,5),(-55,sy*9+12,2),(-55,-18,2),(-48,-18,2)],.65)
    pipe(q,[(-7,40,5),(-7,34,5),(-7,34,3)],.7)
    # 变电院清晰分区，安全围栏与服务道保留。
    q.box('变电院砾石',(51,12,.32),(34,82,.35),q.gravel,.02)
    for tx in (43,58):
        for ty in (-8,15,38):transformer(q,tx,ty)
    for yy in (-19,2,25,49):
        for xx in (36,67):
            q.beam('母线门架柱',(xx,yy,.5),(xx,yy,9),.12,q.steel)
            q.beam('门架斜撑',(xx,yy,2),(xx+(-1 if xx>50 else 1)*1.2,yy,5),.06,q.steel)
        q.beam('母线门架横梁',(36,yy,9),(67,yy,9),.12,q.steel)
        for xx in (41,51,61):
            q.cylinder('母线绝缘柱',(xx,yy,9.8),.18,1.5,q.trim,16)
    for xx in (41,51,61):q.beam('高架母线',(xx,-19,10.6),(xx,49,10.6),.045,q.chrome)
    q.fence(32,-31,71,-31,2.4);q.fence(32,-31,32,55,2.4);q.fence(71,-31,71,55,2.4)
    q.box('入口车行通道',(6,-68,.25),(10,35,.15),q.paving,.03)
    q.car(-61,-43,0);q.car(-55,-43,1)
    for x,y in ((-61,-18),(22,-20),(20,51),(-57,50)):q.streetlight(x,y,7)
    if q.abandoned:
        q.rubble(-8,2,14,9,40);q.weeds(50,12,34,80,100);q.weeds(-18,-55,90,14,70)
    q.people([(-15,-15),(-43,-46),(7,-52),(28,12),(40,-22)])
