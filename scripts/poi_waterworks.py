"""水厂：三个开放沉淀池、两座过滤池与泵房/检修管桥。"""
import math
INFO={'name':'水厂','footprint':[120,140],'mainBuilding':[24,15],'sheet':'02-infrastructure','landmarks':{'entrance':[0,-53],'settlers':[[-31,30],[0,30],[31,30]],'filters':[[-18,-5],[18,-5]],'control':[-35,-37]}}


def tank(q,x,y,index,water):
    # 真正开放的环形池壁与水面；不以一块蓝圆柱替代池体。
    n=96;outer=12.5;inner=11.8
    for i in range(n):
        a=i*math.tau/n;b=(i+1)*math.tau/n;top=2.45
        if q.abandoned and index==2 and 22<=i<=26:top=1.8
        vertices=[(x+r*math.cos(t),y+r*math.sin(t),z) for z in (.25,top) for r in (inner,outer) for t in (a,b)]
        faces=[(0,1,5,4),(2,6,7,3),(4,5,7,6),(0,2,3,1)]
        mesh=q.bpy.data.meshes.new('池壁弧段');mesh.from_pydata(vertices,[],faces);mesh.update();mesh.materials.append(q.concrete);q.own(q.bpy.data.objects.new('沉淀池实体池壁',mesh))
    q.cylinder('池内水面',(x,y,(.5 if index==2 else .85) if q.abandoned else 1.9),11.75,.06,water,128)
    q.cylinder('中央刮泥轴',(x,y,1.9),.55,3,q.steel,24)
    q.box('刮泥桥工作台',(x,y,2.85),(23.9,1.1,.25),q.steel,.025)
    for side in (-1,1):
        q.beam('刮泥桥扶手',(x-11.8,y+side*.55,3.9),(x+11.8,y+side*.55,3.9),.035,q.steel)
        for dx in range(-11,12,2):q.beam('桥栏杆',(x+dx,y+side*.55,2.9),(x+dx,y+side*.55,3.9),.025,q.steel)
    q.box('刮泥机减速箱',(x,y,3.35),(1.5,1.4,.8),q.blue,.06)
    for i in range(48):
        if q.abandoned and index==2 and i in (10,11,12):continue
        a=i*math.tau/48;b=(i+1)*math.tau/48
        p=(x+12.3*math.cos(a),y+12.3*math.sin(a),3.4);end=(x+12.3*math.cos(b),y+12.3*math.sin(b),3.4)
        q.beam('池边护栏',p,end,.025,q.steel)
        q.beam('池边立杆',(p[0],p[1],2.5),p,.025,q.steel)
    for i in range(10):q.box('池边梯步',(x-13.3-i*.32,y,.25+i*.24),(.34,1.1,.22),q.concrete,.01)
    if q.abandoned:
        for i in range(5):
            q.cylinder('水面藻斑',(x+math.sin(i*3)*7,y+math.cos(i*2)*6,.54 if index==2 else .89),1.1+i*.15,.015,q.soil,16)


def build(q):
    q.site()
    water=q.material('waterworks_water','#5b8791' if not q.abandoned else '#6b7055',.2 if not q.abandoned else .65,.15)
    q.box('设备维护地坪',(0,8,.14),(101,91,.2),q.paving,.03)
    for index,x in enumerate((-31,0,31)):tank(q,x,30,index,water)
    for x in (-18,18):
        q.box('过滤池底座',(x,-5,.4),(27,22,.65),q.concrete,.04)
        for side in (-1,1):
            q.box('过滤池侧壁',(x+side*13,-5,1.2),(.55,22,1.9),q.concrete,.03)
            q.box('过滤池端墙',(x,-5+side*10.7,1.2),(26,.55,1.9),q.concrete,.03)
        q.box('过滤池水面',(x,-5,1.3 if not q.abandoned else .75),(25.4,20.5,.06),water,.01)
        for dy in (-6,0,6):
            q.box('过滤隔堰',(x,-5+dy,1.7),(25,.2,.8),q.concrete,.015)
        q.box('过滤池跨桥',(x,-5,2.2),(1.4,22,.18),q.steel,.025)
        for side in (-1,1):
            q.beam('跨桥扶手',(x+side*.65,-16,3.2),(x+side*.65,6,3.2),.035,q.steel)
            for yy in range(-15,7,3):q.beam('跨桥立杆',(x+side*.65,yy,2.2),(x+side*.65,yy,3.2),.03,q.steel)
    q.building('水厂控制楼',-35,-37,24,15,6.3,2)
    q.entrance(-35,-44.6,4.5,2.6);q.text('WATER SERVICES',-35,-46.5,4,.6)
    q.building('低泵房',35,-35,21,13,4.4,1,spacing=4.5)
    q.entrance(35,-41.7,4,2.6)
    # 连接管道、支座与法兰，全为米制实体构件。
    for x in (-31,0,31):
        q.beam('沉淀池出水管',(x,17.5,1),(x,10,1),.45,q.rust if q.abandoned else q.chrome)
        q.cylinder('管道法兰',(x,13.5,1),.63,.14,q.steel,24).rotation_euler.x=math.pi/2
    q.beam('汇水总管',(-39,10,1),(39,10,1),.58,q.chrome)
    for x in (-18,18):q.beam('过滤池进水管',(x,10,1),(x,6,1),.45,q.chrome)
    for x in (-40,-15,10,40):
        q.box('管道支墩',(x,10,.5),(1.1,1.4,.8),q.concrete,.03)
        q.box('管道检修阀体',(x,10,1.8),(.65,.65,.45),q.blue,.04)
        for i in range(20):
            a=i*math.tau/20;b=(i+1)*math.tau/20
            q.beam('阀门手轮',(x+.4*math.cos(a),10+.4*math.sin(a),2.15),(x+.4*math.cos(b),10+.4*math.sin(b),2.15),.035,q.rust)
    for x in (45,50):
        q.cylinder('药剂立罐',(x,-15,3),1.55,5.4,q.trim,32)
        q.cylinder('立罐顶盖',(x,-15,5.8),1.6,.2,q.steel,32)
        q.beam('加药细管',(x,-15,1),(35,-15,1),.09,q.chrome)
    q.box('入厂车道',(0,-48,.24),(9,23,.12),q.asphalt,.025)
    q.building('门卫室',10,-51,6,5,3,1)
    q.car(-51,-45,0)
    for x,y in ((-45,10),(45,10),(-43,-20),(43,-21),(0,-29)):q.streetlight(x,y,6)
    if q.abandoned:q.weeds(0,15,90,60,95);q.rubble(44,37,4,5,14)
    q.people([(-34,-48),(35,-44),(1,9),(12,-23),(-30,12)])


def damage(q,d):
    """破裂池沿、坠落刮泥桥和泵房塌顶，废弃程度对应水处理设施。"""
    d.cut(q,'东沉淀池崩塌池沿',(39,22,13,17),.65,prefixes=('沉淀池实体池壁','池边','刮泥桥','桥栏杆'))
    d.heap(q,40,21,12,12,1.6,65,.3)
    d.sheet(q,'断裂刮泥桥平台',(35,28,1.2),(11,1.2),(.14,.14,-.3),True)
    q.beam('沉落护栏',(33,27,1.2),(41,23,1),.04,q.rust)
    d.cut(q,'过滤池一角破裂',(28,-12,10,10),.7,prefixes=('过滤池侧壁','过滤池端墙','过滤隔堰','过滤池跨桥','跨桥'))
    d.heap(q,29,-13,9,8,1.4,50,.28)
    d.cut(q,'低泵房右端塌顶',(42,-34,12,18),1.8,('低泵房',))
    d.heap(q,42,-34,12,12,1.9,65,.6)
    d.sheet(q,'泵房坠落楼板',(39,-33,2.0),(7,6),(.2,.4,.1))
    d.broken_wall(q,'泵房残墙',43,-41.3,6,1.5)
    for x,y in ((-35,-44.65),(35,-41.65)):d.wall_dirt(q,x,y,19,2.5)
    d.trash(q,-44,-28,9,6,23);d.trash(q,46,9,8,6,21);d.trash(q,-19,42,7,5,15)
    for x,y in ((-18,-10),(10,-2),(31,33)):
        d.patch(q,'池内淤泥浮渣',x,y,12,6,.55 if x==31 else .90,q.damage_soot)
    for x,y in ((-27,12),(10,12),(35,-22)):d.patch(q,'维护地面水渍',x,y,16,8,.275,q.damage_soot)
