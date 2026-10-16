"""区域火车站：站厅、双站台、双贯通轨道和静态四节列车。"""
import math
INFO={'name':'火车站','footprint':[180,100],'mainBuilding':[60,25],'sheet':'02-infrastructure','landmarks':{'entrance':[0,-23],'hall':[0,-7],'platforms':[[0,20],[0,40]],'railways':[[0,27],[0,34]]},'treeExclusions':[[-90,10,90,50]]}


def build(q):
    q.site()
    platform=q.material('railway_platform','#b0ada0');yellow=q.material('railway_tactile','#b6a477');train_paint=q.material('railway_train_cream','#a6a899' if q.abandoned else '#c9d0c6',.42,.2)
    train_band=q.material('railway_train_blue','#496a7a',.4,.25);rust=q.rust
    q.box('站前广场',(0,-28,.18),(100,18,.24),q.paving,.03)
    q.building('区域站厅',0,-7,60,25,9.2,2,spacing=4.4)
    # 中央挑高玻璃入口，较低配楼和中央檐顶形成车站剪影。
    q.box('中央门厅立面',(0,-19.68,5.6),(17,.2,8.3),q.dark,.03)
    for x in (-6,-2,2,6):
        q.window(x,-19.88,5.2,w=3.7,h=7.3,lit=True,broken=q.abandoned and x==2)
    q.entrance(0,-20,10,3.5)
    q.text('NORTH CENTRAL',0,-21.9,5.2,.8)
    q.box('中央高屋面',(0,-8,10.45),(23,27,.35),q.trim,.04)
    q.hip_roof(0,-8,22,26,10.65,1.5)
    q.building('车站附属办公房',-40,-7,16,18,5.5,1)
    q.building('候车辅助房',40,-7,16,18,5.5,1)
    q.box('站厅至站台铺装',(0,11,.22),(100,12,.22),q.paving,.025)
    for py in (20,40):
        q.box('站台实体',(0,py,.65),(164,6,1.2),platform,.06)
        for side in (-1,1):
            q.box('站台安全线',(0,py+side*2.65,1.28),(160,.18,.035),yellow,0)
            q.box('站台白边',(0,py+side*2.92,1.24),(164,.1,.08),q.trim,.01)
            for x in range(-78,81,4):q.box('盲道凸条',(x,py+side*2.25,1.30),(.16,.45,.035),yellow,.005)
        for x in range(-72,73,12):
            q.cylinder('站台雨棚钢柱',(x,py,3.5),.13,4.6,q.steel,12)
            q.beam('雨棚横梁',(x,py-3.1,5.5),(x,py+3.1,5.5),.09,q.steel)
        for i in range(27):
            x=-78+i*6
            if q.abandoned and (i in (6,7,19) if py==20 else i in (12,13,14)):continue
            q.box('站台雨棚分片',(x,py,5.9),(5.94,7,.16),q.roof,.025)
            for dy in (-2,0,2):q.box('雨棚立缝',(x,py+dy,6.0),(5.94,.04,.035),q.roof_seam,.005)
            if i%5==0:
                q.box('站台灯带',(x,py,5.75),(2.5,.16,.06),q.lamp,.01);q.light(x,py,5.6,100,15)
        for x in (-50,-15,20,55):
            q.bench(x,py,0)
            q.box('站台编号牌',(x,py,4.8),(1.5,.12,.7),q.blue,.03);q.text('1' if py==20 else '2',x,py-.08,4.8,.5,q.white)
        q.weeds(0,py,160,6,60)
    for ry in (27,34):
        q.box('道砟道床',(0,ry,.3),(180,4.6,.5),q.gravel,.02)
        for x in range(-89,90):q.box('混凝土轨枕',(x,ry,.57),(.24,2.5,.18),q.concrete,.012)
        for side in (-1,1):
            q.box('铁轨轨底',(0,ry+side*.72,.7),(180,.15,.1),rust if q.abandoned else q.chrome,.01)
            q.box('铁轨轨腹',(0,ry+side*.72,.79),(180,.06,.16),rust if q.abandoned else q.steel,.005)
            q.box('铁轨轨头',(0,ry+side*.72,.90),(180,.12,.06),q.chrome,.01)
    # 四节20m车厢，完整/废弃同位置；接通仅增加照明，不模拟行车。
    for index in range(4):
        x=-31+index*20.7;y=34
        q.box('车厢底架',(x,y,1.25),(19.7,2.9,.6),q.dark,.12)
        q.box('列车车体',(x,y,2.8),(19.7,3.05,2.8),train_paint,.23)
        q.box('列车屋顶',(x,y,4.28),(19.2,2.85,.35),q.concrete,.18)
        for side in (-1,1):
            q.box('列车腰线',(x,y+side*1.54,2.1),(19.1,.035,.3),train_band,.015)
            for j in range(8):q.window(x-7.8+j*2.2,y+side*1.56,3.1,w=1.5,h=1.1,turn=0 if side<0 else math.pi,lit=True,broken=q.abandoned and (j+index)%7==2)
            if q.abandoned:
                for dx in (-6,-1,4):q.box('车厢锈蚀水痕',(x+dx,y+side*1.59,2.4),(.20,.025,1.0),q.rust,.005)
            for wx in (-6.8,6.8):
                wheel=q.cylinder('列车车轮',(x+wx,y+side*1.0,1.05),.44,.28,q.steel,20);wheel.rotation_euler.x=math.pi/2
            for dx in (-8.9,8.9):q.box('车门',(x+dx,y+side*1.56,2.6),(1.2,.06,2.2),train_band,.04)
        if index<3:
            q.box('车厢连接风挡',(x+10.25,y,2.8),(.85,2.4,2.2),q.dark,.08)
        for wx in (-5,5):q.box('列车空调',(x+wx,y,4.65),(2.6,1.8,.5),q.concrete,.07)
    # 架空步行桥连接远站台，避免把跨轨步行表现为直接穿过铁轨。
    q.box('跨轨人行桥桥面',(-60,27,7.6),(3.4,33,.28),q.concrete,.04)
    for yy in (14,24,42):
        for xx in (-61.35,-58.65):q.beam('人行桥支柱',(xx,yy,1),(xx,yy,7.4),.13,q.steel)
    for side in (-1,1):
        for yy in range(12,44,3):
            q.box('人行桥立柱',(-60+side*1.65,yy,8.8),(.12,.12,2.4),q.steel,.015)
            if not(q.abandoned and yy in (21,24)):q.box('桥侧挡风玻璃',(-60+side*1.63,yy,8.8),(.04,2.8,2),q.glass,.01)
    for yy in range(12,44,3):
        if not(q.abandoned and yy==24):q.box('人行桥雨棚',(-60,yy,10.1),(3.9,2.96,.12),q.roof,.025)
    for i in range(40):
        height=.3+(i+1)*.18
        q.box('南侧上桥梯步',(-60,-1+i*.30,height/2),(3.1,.31,height),q.concrete,.01)
    for i in range(34):
        height=1.25+(34-i)*.18
        q.box('远站台下桥梯步',(-62-i*.30,40,height/2),( .31,2.8,height),q.concrete,.01)
    q.light(-60,20,9.5,100,16);q.light(-60,39,9.5,100,16)
    for x in (-80,-40,0,40,80):
        q.cylinder('接触网立柱',(x,45,4.9),.13,9.6,q.steel,12)
        q.beam('接触网门架',(x,45,9.4),(x,24,9.4),.09,q.steel)
    for ry in (27,34):
        for i in range(4):
            q.beam('接触网线',(-80+i*40,ry,8.7),(-40+i*40,ry,8.7),.012,q.rust if q.abandoned else q.chrome)
    for x in (-67,-55,54,66):
        q.box('停车位铺装',(x,-25,.15),(9,15,.15),q.asphalt,.025)
        for dx in (-3.6,0,3.6):q.box('停车位线',(x+dx,-25,.24),(.09,7,.02),q.white,0)
        q.car(x,-25,int(abs(x))%4)
    for x in (-23,23):q.bed(x,-29,5,3);q.tree(x,-29,7);q.streetlight(x+5,-29)
    if q.abandoned:
        q.rubble(31,17,9,4,22);q.weeds(0,-28,75,17,65)
    q.people([(-4,-27),(2,-25),(19,-24),(-16,20),(12,40),(48,20)])


def damage(q,d):
    """站厅侧翼塌层、站台长段雨棚失稳，铁路身份与中央入口保留。"""
    d.cut(q,'站厅东侧上层塌毁',(23,-6,22,30),5.2,('区域站厅',))
    d.heap(q,23,-6,18,20,2.4,90,5.17);d.heap(q,29,-20,16,10,1.9,65)
    d.broken_wall(q,'站厅东侧残墙',23,-19.3,17,2.4,5.2)
    d.sheet(q,'站厅断楼板',(14,-7,5.8),(5,13),(.08,.7,.12))
    for x,py,w in ((28,20,37),(-15,40,27)):
        d.cut(q,'站台连续雨棚垮塌',(x,py,w,8.2),1.45,prefixes=('站台雨棚','雨棚横梁','站台灯带','雨棚立缝'))
        for dx in (-w*.28,0,w*.28):d.sheet(q,'坠落站台雨棚',(x+dx,py,2.0),(8.5,6),(.12,.25 if dx else -.15,dx*.005),True)
        q.beam('折弯站台钢柱',(x-4,py,1.3),(x-1,py+1.0,3.1),.13,q.rust)
        d.heap(q,x,py,w*.75,4.5,.8,45,1.3)
    d.wall_dirt(q,-9,-19.78,34,3.7)
    d.trash(q,-35,-20,13,6,30);d.trash(q,53,20,11,4,25);d.trash(q,-36,40,10,4,22)
    for x,y in ((-25,-27),(18,-28),(60,-25)):d.patch(q,'站前积尘',x,y,14,8,.315,q.damage_dust)
