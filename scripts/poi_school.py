"""学校：三层教学楼、短行政翼与低体育馆，同址三态园区。"""
import math
INFO={'name':'学校','footprint':[120,160],'mainBuilding':[62,14],'treeExclusions':[[30,-5,60,33]],'sheet':'01-civic-life','landmarks':{'entrance':[0,-66],'main':[0,8],'gym':[43,12],'court':[-23,-30]}}


def court(q,x,y):
    floor=q.material('school_court','#7c9590');key=q.material('school_court_key','#ae7d68')
    q.box('篮球场',(x,y,.18),(15.2,28.5,.18),floor,.035)
    for side in (-1,1):
        q.box('罚球区',(x,y+side*10.8,.28),(4.9,5.8,.015),key,0)
        for dx in (-7.1,7.1):q.box('球场边线',(x+dx,y,.29),(.09,27,.018),q.white,0)
        q.box('球场端线',(x,y+side*13.4,.29),(14.2,.09,.018),q.white,0)
        q.beam('篮架柱',(x,y+side*14.1,.3),(x,y+side*14.1,3.8),.09,q.steel)
        q.box('篮板',(x,y+side*12.8,3.5),(1.8,.12,1.05),q.white,.035)
        # 环形篮圈与地面中圈均为真实曲线细分，不是贴图。
        for i in range(24):
            a=i*math.tau/24;b=(i+1)*math.tau/24
            q.beam('篮圈',(x+.23*math.cos(a),y+side*12.5+.23*math.sin(a),3.05),(x+.23*math.cos(b),y+side*12.5+.23*math.sin(b),3.05),.018,q.rust)
    q.box('中线',(x,y,.29),(14.2,.09,.018),q.white,0)
    for i in range(64):
        a=i*math.tau/64;b=(i+1)*math.tau/64
        q.beam('球场中圈',(x+1.8*math.cos(a),y+1.8*math.sin(a),.3),(x+1.8*math.cos(b),y+1.8*math.sin(b),.3),.04,q.white)
    q.weeds(x,y,15,28,40)


def build(q):
    q.site()
    q.box('入口至主楼铺装',(0,-34,.18),(17,75,.2),q.paving,.035)
    q.box('教学楼前广场',(0,-5,.16),(80,14,.22),q.paving,.04)
    q.building('三层教学楼',0,8,62,14,11.8,3)
    # 立面竖向砖色体块与连续窗带形成学校识别，不套用市政厅柱廊。
    for x in (-30,-15,0,15,30):q.box('教学立面砖柱',(x,.88,6.4),(1.1,.26,11.5),q.red,.025)
    q.building('短行政翼',-37,17,13,32,11.8,3)
    q.entrance(0,.75,6,3.2)
    q.text('NORTH DISTRICT SCHOOL',0,-1.28,4.45,.55,q.steel)
    for side in (-1,1):
        q.box('校门柱',(side*5.4,-65,1.8),(1,1,3.4),q.brick,.08)
        q.box('校门顶帽',(side*5.4,-65,3.6),(1.2,1.2,.18),q.trim,.025)
        q.fence(side*6,-65,side*54,-65)
    q.building('校门值班室',-44,-59,6,5,3.0,1)
    # 体育馆为空壳，缺损屋面下能看到桁架和场地，不会看到实心方块封死的假洞。
    x,y,w,d,h=43,12,22,30,7.7
    q.box('体育馆基础',(x,y,.3),(w+.4,d+.4,.5),q.brick,.05)
    q.box('馆内地板',(x,y,.62),(w-.4,d-.4,.18),q.wood,.035)
    for side in (-1,1):
        q.box('体育馆长墙',(x+side*w/2,y,h/2+.5),(.35,d,h),q.red,.03)
        q.box('体育馆端墙',(x,y+side*d/2,h/2+.5),(w,.35,h),q.stone,.03)
        for cy in range(-10,14,5):q.window(x+side*(w/2+.08),y+cy,5.7,w=3,h=2,turn=-math.pi/2 if side>0 else math.pi/2,lit=True,broken=q.abandoned and cy==5)
    for yy in range(-12,15,6):
        q.beam('体育馆主桁架',(x-w/2,y+yy,h),(x,y+yy,h+2.2),.12,q.steel)
        q.beam('体育馆主桁架',(x,y+yy,h+2.2),(x+w/2,y+yy,h),.12,q.steel)
        q.beam('桁架拉杆',(x-w/2,y+yy,h),(x+w/2,y+yy,h),.085,q.steel)
        for dx in (-6,0,6):q.beam('桁架腹杆',(x+dx,y+yy,h),(x+dx*.5,y+yy,h+1.1),.05,q.steel)
    for side in (-1,1):
        slope=math.atan2(2.2,11)
        for j in range(10):
            if q.abandoned and side==1 and j in (3,4,5):continue
            obj=q.box('体育馆分段屋面',(x+side*5.5,y-13.5+j*3,h+1.16),(11.4,2.96,.16),q.roof,.025)
            obj.rotation_euler.y=side*slope
            for sy in (-1.1,0,1.1):
                q.beam('体育馆屋面立缝',(x,y-13.5+j*3+sy,h+2.3),(x+side*11,y-13.5+j*3+sy,h+.1),.027,q.roof_seam)
    for side in (-1,1):
        mesh=q.bpy.data.meshes.new('体育馆山墙');mesh.from_pydata([(x-w/2,y+side*d/2,h+.5),(x+w/2,y+side*d/2,h+.5),(x,y+side*d/2,h+2.3)],[],[(0,1,2) if side<0 else (2,1,0)]);mesh.update()
        obj=q.own(q.bpy.data.objects.new('体育馆山墙',mesh));mesh.materials.append(q.stone)
        for dx in (-6,0,6):q.window(x+dx,y+side*(d/2+.06),5.5,w=3.8,h=2,turn=0 if side<0 else math.pi,lit=True)
    q.beam('体育馆脊盖',(x,y-15,h+2.35),(x,y+15,h+2.35),.13,q.roof_seam)
    if q.abandoned:
        q.rubble(55,11,5,12,32)
        q.weeds(43,13,21,28,35)
    q.entrance(43,-3.2,5,3)
    court(q,-22,-30)
    for x,y in ((-43,-19),(-43,-37),(-21,-52),(19,-22),(20,-47)):
        q.bed(x,y,3,3);q.tree(x,y,7)
    for y in (-18,-42):
        q.bench(-8,y);q.bench(10,y);q.streetlight(9,y)
    # 后院保留宽阔操练草地和通往体育馆的步道。
    q.box('后院步道',(0,39,.17),(87,3,.2),q.paving,.025)
    q.box('后院操练草地',(0,54,.15),(85,24,.15),q.grass,.02)
    # 后院练习场采用小型校园场地尺度，不复制完整标准体育场。
    for side in (-1,1):
        q.box('练习场端线',(side*34,54,.245),(.10,23,.02),q.white,0)
        q.box('练习场边线',(0,54+side*11.5,.245),(68,.10,.02),q.white,0)
        for dy in (-2.5,2.5):q.beam('练习球门',(side*33.5,54+dy,.2),(side*33.5,54+dy,2.5),.05,q.white)
        q.beam('球门横梁',(side*33.5,51.5,2.5),(side*33.5,56.5,2.5),.05,q.white)
    q.box('练习场中线',(0,54,.245),(.10,23,.02),q.white,0)
    for x in (-25,-12,12,25):
        q.bench(x,36);q.bed(x,32.5,4,2)
    for x in (-35,-17,0,17,35):q.tree(x,72,7.5)
    for x in (42,46,50):
        q.box('停车位线',(x,-41,.23),(.09,7,.025),q.white,0)
    q.car(44,-40,0)
    if q.connected:q.car(48,-40,2)
    q.people([(-2,-13),(3,-22),(-20,-34),(-23,-31),(31,-8),(8,35)])
    q.weeds(0,-51,80,18,60)
    for x in (-22,0,23):q.light(x,-1,8,85,12)
